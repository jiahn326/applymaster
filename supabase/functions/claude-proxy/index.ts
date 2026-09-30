import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { validateDiffs } from './validateDiffs.ts'
import { FIT_RULES, FIT_SCHEMA, computeFit } from './fit.ts'
import { fillFixedPlaceholders, splitTemplate, assembleLetter, middleWordRange, jdOnlyTerms, unsupportedTerms, LETTER_RULES, LETTER_TARGET_CHARS } from './coverLetter.ts'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

const REQUIRED: Record<string, string[]> = {
  tailorResume:         ['resumeRawText', 'jobDescription'],
  analyzeJobFit:        ['resumeRawText', 'jobDescription'],
  generateCoverLetter:  ['company', 'role', 'jobDescription'],
  analyzeAndExtract:    ['content'],
  parseResumeStructure: ['rawText'],
  generateWhyCompany:   ['company', 'role', 'jobDescription'],
}

Deno.serve(async (req) => {

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() })
  }

  // Verify JWT via Supabase auth
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )
  const { error: authError } = await supabase.auth.getUser(token)
  if (authError) return json({ error: 'Unauthorized' }, 401)

  try {
    const { action, payload } = await req.json()

    // Validate required fields
    const required = REQUIRED[action]
    if (!required) return json({ error: 'Unknown action' }, 400)
    const missing = required.filter(k => !payload?.[k])
    if (missing.length) return json({ error: `Missing fields: ${missing.join(', ')}` }, 400)

    // req.signal aborts when the browser cancels, which stops the Claude request too
    const client: Claude = { anthropic: new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! }), signal: req.signal }

    let result
    if (action === 'tailorResume')            result = await tailorResume(client, payload.resumeRawText, payload.jobDescription)
    else if (action === 'analyzeJobFit')      result = await analyzeJobFit(client, payload.resumeRawText, payload.jobDescription, payload.currentLocation)
    else if (action === 'generateCoverLetter') result = await generateCoverLetter(client, payload.company, payload.role, payload.jobDescription, payload.header, payload.today, payload.template, payload.resumeText)
    else if (action === 'analyzeAndExtract')  result = await analyzeAndExtract(client, payload.content, payload.resumeRawText, payload.currentLocation)
    else if (action === 'parseResumeStructure') result = await parseResumeStructure(client, payload.rawText)
    else if (action === 'generateWhyCompany') result = await generateWhyCompany(client, payload.company, payload.role, payload.jobDescription, payload.resumeRawText, payload.length)

    return json(result, 200)
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

type Claude = { anthropic: Anthropic; signal: AbortSignal }

// The model occasionally adds a sentence before or after the JSON (e.g. when a page
// has no job posting). Parse the object itself instead of failing the whole request.
function parseJsonReply(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{'), end = text.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1))
    throw new Error('Claude returned an unreadable response')
  }
}

// `noThinking` is for plain copy/extract tasks where reasoning only adds latency
async function callClaude(client: Claude, prompt: string, maxTokens = 16000, opts: { noThinking?: boolean } = {}) {
  const message = await client.anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
    ...(opts.noThinking ? { thinking: { type: 'disabled' as const } } : {}),
  }, { signal: client.signal })
  if (message.stop_reason === 'max_tokens') throw new Error('Claude response was truncated (max_tokens reached)')
  // Sonnet 5 runs adaptive thinking by default, so content[0] may be a thinking block
  const textBlock = message.content.find(b => b.type === 'text')
  const raw = textBlock?.type === 'text' ? textBlock.text : ''
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

async function tailorResume(client: Claude, resumeRawText: string, jobDescription: string) {
  const text = await callClaude(client, `You are a resume editor for a software engineer. Your only job is to swap terminology to mirror the job description — nothing else.

WHEN TO REWRITE A BULLET:
Only include a bullet in diffs if you can make a concrete terminology swap. Examples of valid rewrites:
- JD says "distributed systems" → resume says "large-scale backend" → swap to "distributed systems"
- JD says "CI/CD pipelines" → resume says "automated deployments" → swap to "CI/CD pipelines"
- JD says "cross-functional teams" → resume says "multiple teams" → swap to "cross-functional teams"

DO NOT rewrite a bullet if:
- It already uses the same terms as the JD
- You can only make it longer or more detailed
- The only change would be cosmetic

LENGTH RULE (strict):
The rewritten bullet must be the same length or shorter than the original. Do not add clauses, context, or elaboration. Swap words, don't expand sentences.

TONE:
- Plain, direct — like an engineer wrote it
- Start with an action verb, keeping the original bullet's tense (ongoing work like "Migrating" or "Building" stays in present tense; never turn it into a finished claim)
- No periods at the end

BANNED WORDS (never use):
seamless, robust, leveraged, spearheaded, ensured, passionate, detail-oriented, results-driven, collaborated closely, worked closely, across the stack, fast-paced, took ownership

FABRICATION:
Never invent metrics, technologies, or experience not in the original bullet.

MASTER RESUME:
${resumeRawText}

JOB DESCRIPTION:
${jobDescription}

Return JSON only:
{
  "diffs": [{ "section": "<company or project name>", "index": <0-based>, "original": "<text>", "tailored": "<text>" }]
}`)
  const parsed = parseJsonReply(text)
  // Drop diffs that break the rules above (longer, changed numbers or names, tense, banned words)
  const { kept, rejected } = validateDiffs(parsed.diffs ?? [])
  if (rejected.length) console.log('tailorResume dropped diffs:', rejected.map(r => r.reason).join(', '))
  return { ...parsed, diffs: kept.map(d => ({ ...d, accepted: true })) }
}

async function analyzeJobFit(client: Claude, resumeRawText: string, jobDescription: string, currentLocation?: string) {
  const today = new Date().toISOString().slice(0, 10)
  const text = await callClaude(client, `You are a career coach. Analyze how well this resume matches the job description.

TODAY: ${today}

RESUME:
${resumeRawText}
${currentLocation ? `\nCANDIDATE'S CURRENT LOCATION: ${currentLocation}\n` : ''}
JOB DESCRIPTION:
${jobDescription}

${FIT_RULES}

Return JSON only:
${FIT_SCHEMA}`, 8000)
  return computeFit(parseJsonReply(text))
}

async function generateCoverLetter(client: Claude, company: string, role: string, jobDescription: string, header?: { name: string; contact: string }, today?: string, customTemplate?: string, resumeText?: string) {
  today = today ?? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const headerName = header?.name ?? 'My Name'
  const headerContact = header?.contact ?? 'phone | email | linkedin'

  const DEFAULT_TEMPLATE = `[NAME]
[CONTACT]

[TODAY_DATE]

Dear Hiring Manager,

[BODY]

Thank you for considering my application. I look forward to discussing how my background would benefit your team.

Sincerely,
[NAME]`

  // Code fills the fixed placeholders and keeps greeting/closing verbatim; the model writes the middle
  const template = fillFixedPlaceholders(customTemplate || DEFAULT_TEMPLATE, { company, role, today, name: headerName, contact: headerContact })
  const parts = splitTemplate(template)
  const [minWords, maxWords] = middleWordRange(parts)
  // JD tools the resume never mentions: named up front so they're never claimed as experience
  const known = `${template} ${company} ${role}`
  const notOnResume = resumeText ? jdOnlyTerms(jobDescription, resumeText, known) : []
  const context = `COMPANY: ${company}
ROLE: ${role}

JOB DESCRIPTION:
${jobDescription}

${resumeText ? `CANDIDATE'S RESUME (the only source of facts about the candidate):\n${resumeText}` : '(No resume provided — keep the draft\'s facts as written and add no new claims about the candidate.)'}

${LETTER_RULES}${notOnResume.length ? `

NOT ON THE RESUME: ${notOnResume.join(', ')}.
The job description mentions these, but the resume doesn't. Never present any of them as something the candidate has used, knows, or has experience with. Mention one only as part of what the role involves, or leave it out.` : ''}`

  if (parts) {
    const bodyPrompt = `You are writing the body of a cover letter for this job. The greeting and closing are handled separately — write only the body paragraphs.

${context}

THE CANDIDATE'S DRAFT OF THE BODY (their voice and structure; tailor it to this job):
${parts.middle}

LENGTH: ${minWords}-${maxWords} words in total. Keep sentences tight and don't pad.

Return only the body paragraphs, separated by blank lines. No greeting, no sign-off, no markdown.`
    const middle = await callClaude(client, bodyPrompt, 8000)
    // Log (not retry) when the letter still names one, so it can be spotted in the logs
    const named = resumeText ? unsupportedTerms(middle, jobDescription, resumeText, known) : []
    if (named.length) console.log('generateCoverLetter names terms not on resume (check framing):', named.join(', '))
    return { text: assembleLetter(parts, middle) }
  }

  // Templates without a recognizable greeting/closing: the model fills the whole thing
  const text = await callClaude(client, `Complete this cover letter template for a job application.

${context}

TEMPLATE:
${template}

- Keep the template's greeting, closing, and sign-off lines exactly as written; tailor the rest.
- LENGTH: about ${LETTER_TARGET_CHARS} characters for the whole letter.

Return only the completed letter text, no markdown.`, 8000)

  return { text }
}

// Fetched pages can be huge (menus, other listings); the posting itself fits well within this
const MAX_POSTING_CHARS = 20000

// The saved job description feeds fit analysis, tailoring and cover letters, so it
// must be the posting's own text, not a summary
const JD_EXTRACTION_RULES = `"jobDescription": copy this posting's own text verbatim — role overview, responsibilities, requirements/qualifications, preferred/nice-to-have skills, tech stack, about the team or company, location/work arrangement, and compensation if stated.
- Keep the original wording and order. Put each bullet point on its own line starting with "- ".
- Leave out only text that isn't part of this posting: site navigation, cookie notices, sign-in prompts, other job listings, share buttons, generic legal/EEO statements, and page footers.
- Do not summarize, shorten, or rephrase anything that belongs to the posting.`

// Extracting the posting (long verbatim output, no reasoning needed) and scoring fit
// (reasoning, short output) run as two parallel calls, so the wait is the slower of
// the two instead of both back to back
async function analyzeAndExtract(client: Claude, content: string, resumeRawText?: string, currentLocation?: string) {
  const posting = content.slice(0, MAX_POSTING_CHARS)
  const [jobInfo, fitAnalysis] = await Promise.all([
    extractPosting(client, posting),
    resumeRawText ? analyzeJobFit(client, resumeRawText, posting, currentLocation) : Promise.resolve(null),
  ])
  return { jobInfo, fitAnalysis }
}

async function extractPosting(client: Claude, posting: string) {
  const text = await callClaude(client, `Extract the job information from this job posting page.

JOB POSTING:
${posting}

${JD_EXTRACTION_RULES}

Return JSON only:
{ "company": "", "role": "", "jobDescription": "" }`, 12000, { noThinking: true })
  return parseJsonReply(text)
}

async function generateWhyCompany(client: Claude, company: string, role: string, jobDescription: string, resumeRawText?: string, length: 'short' | 'medium' | 'long' = 'medium') {
  const lengthGuide = {
    short: '2-3 sentences',
    medium: '1 paragraph (4-6 sentences)',
    long: '2 paragraphs',
  }[length]

  const text = await callClaude(client, `Write a genuine answer to "Why do you want to work at ${company}?" for a ${role} application.

STRICT RULES — violations make the answer unusable:
- ONLY reference experience, skills, and background that exist in the resume
- NEVER claim to have used ${company}'s product, been a customer, or admired the company for years unless it's in the resume
- NEVER fabricate personal stories or anecdotes
- Focus on: what in the JD aligns with the candidate's actual skills/experience, what specifically about the role or tech stack is a natural next step, what the candidate genuinely brings
- No generic filler: "innovative", "passionate", "fast-paced", "excited to contribute", "make an impact"
- Sound like a real engineer wrote it, not a career coach
- The candidate is a non-native English speaker — write naturally but not overly polished. Avoid complex sentence structures, fancy vocabulary, or native-sounding idioms. Simple, clear, direct sentences only.
- First person, plain text, no bullet points
- Length: ${lengthGuide}

JOB DESCRIPTION:
${jobDescription}

${resumeRawText ? `CANDIDATE'S RESUME (only use what's actually here):\n${resumeRawText}` : '(No resume provided — base answer only on the JD and the candidate\'s likely background for this role)'}

Return only the answer text, nothing else.`, 4000)

  return { text }
}

async function parseResumeStructure(client: Claude, rawText: string) {
  const text = await callClaude(client, `Parse this resume into structured JSON.

Copy text exactly as written. Do not drop, merge, rename, or reorder anything.
- sectionTitles: each section heading exactly as it appears (e.g. "PROJECTS", "Personal Projects", "Technical Skills")
- skills.groups: one entry per skill line in the original, in original order, with the label as written (e.g. "Languages", "Frameworks", "Tools") and every item on that line

RESUME:
${rawText}

Return JSON only:
{
  "header": { "name": "", "contact": "" },
  "sectionTitles": { "education": "", "skills": "", "experience": "", "projects": "" },
  "education": [{ "school": "", "location": "", "degree": "", "dates": "", "awards": "" }],
  "skills": { "groups": [{ "label": "", "items": [] }] },
  "experience": [{ "company": "", "location": "", "title": "", "dates": "", "bullets": [] }],
  "projects": [{ "name": "", "tech": "", "dates": "", "bullets": [] }]
}`)
  return parseJsonReply(text)
}
