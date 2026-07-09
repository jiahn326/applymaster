import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as cheerio from 'cheerio'

// ─── Config ──────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AUTOMATION_SECRET',
  'SUPABASE_USER_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN',
]

const SUPABASE_URL    = process.env.VITE_SUPABASE_URL!
const SERVICE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY!
const AUTOMATION_SECRET = process.env.AUTOMATION_SECRET!
const USER_ID         = process.env.SUPABASE_USER_ID!
const PROXY_URL       = `${SUPABASE_URL}/functions/v1/claude-proxy`

const TOP_N           = parseInt(process.env.DAILY_TOP_N    ?? '5')
const MIN_SCORE       = parseInt(process.env.DAILY_MIN_SCORE ?? '55')
const MAX_ANALYZE     = parseInt(process.env.DAILY_MAX_ANALYZE ?? '20')
const LOOKBACK_DAYS   = parseInt(process.env.DAILY_LOOKBACK_DAYS ?? '14')

// ─── Supabase (service role — bypasses RLS) ───────────────────────────────────

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ─── Claude proxy caller ─────────────────────────────────────────────────────

async function callProxy(action: string, payload: Record<string, unknown>) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTOMATION_SECRET}`,
    },
    body: JSON.stringify({ action, payload }),
  })
  if (!res.ok) throw new Error(`Proxy [${action}] ${res.status}: ${await res.text()}`)
  const data = await res.json() as any
  if (data?.error) throw new Error(data.error)
  return data
}

// ─── Gmail helpers ────────────────────────────────────────────────────────────

function makeGmailClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth })
}

function extractPart(payload: any, mime: string): string {
  if (payload.mimeType === mime && payload.body?.data) {
    return Buffer.from(payload.body.data as string, 'base64url').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts as any[]) {
      const found = extractPart(part, mime)
      if (found) return found
    }
  }
  return ''
}

// ─── Job types & parsing ──────────────────────────────────────────────────────

interface RawJob {
  title: string
  company: string
  url: string
  normalizedUrl: string
  jdText: string
  source: 'linkedin' | 'indeed' | 'other'
}

interface ScoredJob extends RawJob {
  fitScore: number
  fitAnalysis: any
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('linkedin.com')) {
      return `https://www.linkedin.com${u.pathname.replace('/comm/', '/')}`
    }
    if (u.hostname.includes('indeed.com')) {
      const jk = u.searchParams.get('jk')
      return jk ? `https://www.indeed.com/viewjob?jk=${jk}` : `${u.origin}${u.pathname}`
    }
    return `${u.origin}${u.pathname}`
  } catch {
    return url
  }
}

function parseJobsFromEmail(html: string): RawJob[] {
  const jobs: RawJob[] = []
  const seen = new Set<string>()

  const $ = cheerio.load(html)

  $('a[href]').each((_: any, el: any) => {
    const href = $(el).attr('href') ?? ''
    const title = $(el).text().trim()

    const isLinkedIn = /linkedin\.com\/(comm\/)?jobs\/view\//i.test(href)
    const isIndeed   = /indeed\.com\/(viewjob|rc\/clk|applystart)/i.test(href)

    if (!isLinkedIn && !isIndeed) return
    if (title.length < 3 || title.length > 120) return

    const norm = normalizeUrl(href)
    if (seen.has(norm)) return
    seen.add(norm)

    // Grab surrounding text for company/context
    const container = $(el).closest('td, div, tr, li').first()
    const ctx = container.text().replace(/\s+/g, ' ').trim().slice(0, 600)

    // Heuristic: company often follows a separator after the title
    const withoutTitle = ctx.replace(title, '').trim()
    const segments = withoutTitle.split(/[·\|•\n]/).map((s: string) => s.trim()).filter(Boolean)
    const company = segments[0] ?? 'Unknown'

    jobs.push({
      title,
      company,
      url: href,
      normalizedUrl: norm,
      jdText: ctx,
      source: isLinkedIn ? 'linkedin' : 'indeed',
    })
  })

  return jobs
}

async function fetchJd(url: string, source: string): Promise<string> {
  if (source === 'linkedin') return '' // LinkedIn blocks scrapers
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return ''
    return (await res.text()).slice(0, 4_000)
  } catch {
    return ''
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🤖 ApplyMaster — Daily JD Recommender')
  console.log('─'.repeat(50))

  // 0. Validate env
  const missing = REQUIRED_ENV.filter(k => !process.env[k])
  if (missing.length) {
    console.error('\nMissing env vars in .env.local:', missing.join(', '))
    console.error('See .env.example for setup instructions.')
    process.exit(1)
  }

  // 1. Load latest resume
  console.log('\n📄 Loading resume...')
  const { data: resumes } = await supabase
    .from('resumes')
    .select('content')
    .order('created_at', { ascending: false })
    .limit(1)

  if (!resumes?.length) {
    console.error('No resume found. Upload one in ApplyMaster first.')
    process.exit(1)
  }
  const resume = resumes[0]
  const resumeRawText    = resume.content.raw_text as string
  const resumeHeader     = resume.content.structure?.header as { name: string; contact: string } | undefined
  const currentLocation  = resume.content.current_location as string | undefined
  console.log(`  ✓ ${resumeRawText.split(/\s+/).length} words loaded`)

  // 2. Already-tracked job URLs (last N days)
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const { data: existingApps } = await supabase
    .from('applications')
    .select('job_url')
    .gte('created_at', cutoff)
    .not('job_url', 'is', null)

  const existingUrls = new Set((existingApps ?? []).map((a: any) => normalizeUrl(a.job_url)))
  console.log(`  ✓ ${existingUrls.size} jobs already tracked in last ${LOOKBACK_DAYS} days`)

  // 3. Fetch today's job alert emails
  console.log('\n📧 Checking Gmail for job alerts...')
  const gmail = makeGmailClient()
  const gmailQuery = [
    'from:(jobs-noreply@linkedin.com OR jobalerts-noreply@linkedin.com',
    'OR alert@indeedemail.com OR jobalert@indeed.com)',
    'newer_than:1d',
  ].join(' ')

  const { data: msgList } = await gmail.users.messages.list({
    userId: 'me',
    q: gmailQuery,
    maxResults: 20,
  })

  const messages = msgList.messages ?? []
  console.log(`  ✓ ${messages.length} job alert email(s) found`)

  if (!messages.length) {
    console.log('\nNo job alert emails today. Done.\n')
    return
  }

  // 4. Parse jobs from emails
  console.log('\n🔍 Parsing job listings from emails...')
  const allJobs: RawJob[] = []

  for (const msg of messages) {
    const { data: full } = await gmail.users.messages.get({
      userId: 'me', id: msg.id!, format: 'full',
    })
    const html = extractPart(full.payload!, 'text/html')
    if (html) allJobs.push(...parseJobsFromEmail(html))
  }

  // Deduplicate across emails
  const uniqueMap = new Map<string, RawJob>()
  for (const j of allJobs) uniqueMap.set(j.normalizedUrl, j)
  const uniqueJobs = [...uniqueMap.values()]
  console.log(`  ✓ ${uniqueJobs.length} unique listings parsed`)

  const newJobs = uniqueJobs.filter(j => !existingUrls.has(j.normalizedUrl))
  console.log(`  ✓ ${newJobs.length} not yet in dashboard`)

  if (!newJobs.length) {
    console.log('\nAll jobs already processed. Done.\n')
    return
  }

  // 5. Fetch full JDs (Indeed only; LinkedIn blocked)
  console.log('\n🌐 Fetching full job descriptions...')
  const toAnalyze = newJobs.slice(0, MAX_ANALYZE)

  for (const job of toAnalyze) {
    if (job.source !== 'linkedin') {
      const fetched = await fetchJd(job.url, job.source)
      if (fetched.length > 100) job.jdText = fetched
    }
    await sleep(300)
  }

  const analyzable = toAnalyze.filter(j => j.jdText.length > 50)
  console.log(`  ✓ ${analyzable.length}/${toAnalyze.length} have usable JD text`)

  // 6. Fit analysis — quick pass for ranking
  console.log('\n🧠 Analyzing fit for each job...')
  const scored: ScoredJob[] = []

  for (const job of analyzable) {
    try {
      process.stdout.write(`  ${job.title} @ ${job.company} ... `)
      const analysis = await callProxy('analyzeJobFit', {
        resumeRawText,
        jobDescription: job.jdText,
        currentLocation,
      })
      console.log(`${analysis.overallScore}/100 (${analysis.verdict})`)
      scored.push({ ...job, fitScore: analysis.overallScore, fitAnalysis: analysis })
    } catch (err: any) {
      console.log(`skipped (${err.message})`)
    }
    await sleep(500)
  }

  // 7. Pick top N above threshold
  scored.sort((a, b) => b.fitScore - a.fitScore)
  const topJobs = scored.filter(j => j.fitScore >= MIN_SCORE).slice(0, TOP_N)

  console.log(`\n🏆 Top ${topJobs.length} jobs (score >= ${MIN_SCORE}):`)
  topJobs.forEach((j, i) =>
    console.log(`  ${i + 1}. ${j.title} @ ${j.company} — ${j.fitScore}/100 (${j.fitAnalysis.verdict})`)
  )

  if (!topJobs.length) {
    console.log('\nNo jobs passed the minimum score threshold. Done.\n')
    return
  }

  // 8. Full processing — tailor + cover letter
  console.log('\n✨ Running tailor + cover letter for top jobs...')
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const results: { job: ScoredJob; appId: string; ok: boolean; err?: string }[] = []

  for (const job of topJobs) {
    process.stdout.write(`  ${job.title} @ ${job.company} ... `)
    try {
      // Insert application record
      const { data: app, error: ie } = await supabase
        .from('applications')
        .insert({
          company: job.company,
          role: job.title,
          job_url: job.normalizedUrl,
          job_description: job.jdText,
          status: 'applied',
          fit_analysis: job.fitAnalysis,
          user_id: USER_ID,
          notes: `Auto-added by daily-jd-recommend on ${today}`,
        })
        .select('id')
        .single()
      if (ie) throw ie

      const appId = (app as any).id as string

      // Tailor resume
      const tailored = await callProxy('tailorResume', {
        resumeRawText,
        jobDescription: job.jdText,
      })
      await sleep(500)

      // Generate cover letter
      const cl = await callProxy('generateCoverLetter', {
        company: job.company,
        role: job.title,
        jobDescription: job.jdText,
        header: resumeHeader,
        today,
      })

      // Save results
      await supabase
        .from('applications')
        .update({ tailored_resume: tailored, cover_letter: cl.text })
        .eq('id', appId)

      results.push({ job, appId, ok: true })
      console.log('done ✓')
    } catch (err: any) {
      results.push({ job, appId: '', ok: false, err: err.message })
      console.log(`failed: ${err.message}`)
    }
    await sleep(1000)
  }

  // 9. Summary
  const ok  = results.filter(r => r.ok)
  const bad = results.filter(r => !r.ok)

  console.log('\n' + '─'.repeat(50))
  console.log('📊 Summary')
  console.log(`  Emails processed:     ${messages.length}`)
  console.log(`  Job listings found:   ${uniqueJobs.length}`)
  console.log(`  New (not tracked):    ${newJobs.length}`)
  console.log(`  Fit-analyzed:         ${scored.length}`)
  console.log(`  Added to dashboard:   ${ok.length}`)
  if (bad.length) console.log(`  Failed:               ${bad.length}`)

  if (ok.length) {
    console.log('\n  Added:')
    ok.forEach(r =>
      console.log(`    ✓ ${r.job.title} @ ${r.job.company} (${r.job.fitScore}/100) → id: ${r.appId}`)
    )
  }
  if (bad.length) {
    console.log('\n  Failed:')
    bad.forEach(r =>
      console.log(`    ✗ ${r.job.title} @ ${r.job.company} — ${r.err}`)
    )
  }

  console.log('\n✅ Done. Check your ApplyMaster dashboard.\n')
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message)
  process.exit(1)
})
