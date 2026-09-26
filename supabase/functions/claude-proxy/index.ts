import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

function corsHeaders(origin: string) {
  const allowed = ALLOWED_ORIGIN === '*' ? '*' : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

function json(body: unknown, status = 200, origin = '*') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

const REQUIRED: Record<string, string[]> = {
  tailorResume:         ['resumeRawText', 'jobDescription'],
  analyzeJobFit:        ['resumeRawText', 'jobDescription'],
  generateCoverLetter:  ['company', 'role', 'jobDescription'],
  extractJobInfo:       ['content'],
  analyzeAndExtract:    ['content'],
  parseResumeStructure: ['rawText'],
  generateWhyCompany:   ['company', 'role', 'jobDescription'],
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '*'

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  // Verify JWT via Supabase auth
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )
  const { error: authError } = await supabase.auth.getUser(token)
  if (authError) return json({ error: 'Unauthorized' }, 401, origin)

  try {
    const { action, payload } = await req.json()

    // Validate required fields
    const required = REQUIRED[action]
    if (!required) return json({ error: 'Unknown action' }, 400, origin)
    const missing = required.filter(k => !payload?.[k])
    if (missing.length) return json({ error: `Missing fields: ${missing.join(', ')}` }, 400, origin)

    // req.signal aborts when the browser cancels, which stops the Claude request too
    const client: Claude = { anthropic: new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! }), signal: req.signal }

    let result
    if (action === 'tailorResume')            result = await tailorResume(client, payload.resumeRawText, payload.jobDescription)
    else if (action === 'analyzeJobFit')      result = await analyzeJobFit(client, payload.resumeRawText, payload.jobDescription, payload.currentLocation)
    else if (action === 'generateCoverLetter') result = await generateCoverLetter(client, payload.company, payload.role, payload.jobDescription, payload.header, payload.today, payload.template)
    else if (action === 'extractJobInfo')     result = await extractJobInfo(client, payload.content)
    else if (action === 'analyzeAndExtract')  result = await analyzeAndExtract(client, payload.content, payload.resumeRawText, payload.currentLocation)
    else if (action === 'parseResumeStructure') result = await parseResumeStructure(client, payload.rawText)
    else if (action === 'generateWhyCompany') result = await generateWhyCompany(client, payload.company, payload.role, payload.jobDescription, payload.resumeRawText, payload.length)

    return json(result, 200, origin)
  } catch (err) {
    return json({ error: err.message }, 500, origin)
  }
})

type Claude = { anthropic: Anthropic; signal: AbortSignal }

async function callClaude(client: Claude, prompt: string, maxTokens = 16000) {
  const message = await client.anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
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
- Past-tense action verb to start
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
  const parsed = JSON.parse(text)
  return { ...parsed, diffs: parsed.diffs.map((d: any) => ({ ...d, accepted: true })) }
}

async function analyzeJobFit(client: Claude, resumeRawText: string, jobDescription: string, currentLocation?: string) {
  const text = await callClaude(client, `You are a career coach. Analyze how well this resume matches the job description.

RESUME:
${resumeRawText}
${currentLocation ? `\nCANDIDATE'S CURRENT LOCATION: ${currentLocation}\n` : ''}
JOB DESCRIPTION:
${jobDescription}

Return JSON only:
{
  "overallScore": <0-100>,
  "verdict": "Apply" | "Maybe" | "Skip",
  "verdictReason": "<one sentence>",
  "categories": [
    { "label": "Skills Match", "score": <0-100>, "verdict": "strong"|"good"|"reach"|"weak", "summary": "<1-2 sentences>" },
    { "label": "Experience Level", "score": <0-100>, "verdict": "strong"|"good"|"reach"|"weak", "summary": "<1-2 sentences>" },
    { "label": "Location", "score": <0-100>, "verdict": "strong"|"good"|"reach"|"weak", "summary": "<1-2 sentences>" }
  ]
}`, 8000)
  return JSON.parse(text)
}

async function generateCoverLetter(client: Claude, company: string, role: string, jobDescription: string, header?: { name: string; contact: string }, today?: string, customTemplate?: string) {
  today = today ?? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const headerName = header?.name ?? 'My Name'
  const headerContact = header?.contact ?? 'phone | email | linkedin'

  const DEFAULT_TEMPLATE = `${headerName}
${headerContact}

[TODAY_DATE]

Dear Hiring Manager,

[BODY]

Thank you for considering my application. I look forward to discussing how my background would benefit your team.

Sincerely,
${headerName}`

  const template = customTemplate
    ? customTemplate.replace('[NAME]', headerName).replace('[CONTACT]', headerContact)
    : DEFAULT_TEMPLATE

  const text = await callClaude(client, `Fill in this cover letter template for a job application. Replace placeholders with specific, relevant content based on the JD.

COMPANY: ${company}
ROLE: ${role}
TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

TEMPLATE:
${template}

Rules:
- Replace [TODAY_DATE] with today's date
- Replace [COMPANY_NAME] with the company name
- Replace [POSITION_NAME] with the role
- Replace [BODY] with 2-3 paragraphs connecting the candidate's background to the JD
- Keep the overall structure and tone of the template
- Return only the completed letter text, no markdown

Return only the completed letter text, no markdown.`, 8000)

  return { text }
}

async function extractJobInfo(client: Claude, content: string) {
  const text = await callClaude(client, `Extract job information from this text.

TEXT:
${content}

Return JSON only:
{ "company": "", "role": "", "jobDescription": "" }`, 8000)
  return JSON.parse(text)
}

async function analyzeAndExtract(client: Claude, content: string, resumeRawText?: string, currentLocation?: string) {
  const hasResume = !!resumeRawText
  const text = await callClaude(client, `You are a job application assistant. From the job posting below, do two things in one pass:

1. Extract the job info
2. ${hasResume ? 'Analyze how well the resume matches the job' : 'Skip fit analysis (no resume provided)'}

JOB POSTING:
${content}

${hasResume ? `RESUME:
${resumeRawText}
${currentLocation ? `\nCANDIDATE'S CURRENT LOCATION: ${currentLocation}` : ''}` : ''}

Return JSON only:
{
  "jobInfo": { "company": "", "role": "", "jobDescription": "" },
  "fitAnalysis": ${hasResume ? `{
    "overallScore": <0-100>,
    "verdict": "Apply" | "Maybe" | "Skip",
    "verdictReason": "<one sentence>",
    "categories": [
      { "label": "Skills Match", "score": <0-100>, "verdict": "strong"|"good"|"reach"|"weak", "summary": "<1-2 sentences>" },
      { "label": "Experience Level", "score": <0-100>, "verdict": "strong"|"good"|"reach"|"weak", "summary": "<1-2 sentences>" },
      { "label": "Location", "score": <0-100>, "verdict": "strong"|"good"|"reach"|"weak", "summary": "<1-2 sentences>" }
    ]
  }` : 'null'}
}`, 12000)
  return JSON.parse(text)
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
  return JSON.parse(text)
}
