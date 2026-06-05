import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify request comes from our app by checking the Supabase anon key
  const authHeader = req.headers.get('Authorization') || req.headers.get('apikey') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!authHeader.includes(anonKey)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, payload } = await req.json()
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    let result
    if (action === 'tailorResume')         result = await tailorResume(client, payload.resumeRawText, payload.jobDescription)
    else if (action === 'analyzeJobFit')   result = await analyzeJobFit(client, payload.resumeRawText, payload.jobDescription)
    else if (action === 'generateCoverLetter') result = await generateCoverLetter(client, payload.company, payload.role, payload.jobDescription, payload.header)
    else if (action === 'extractJobInfo')  result = await extractJobInfo(client, payload.content)
    else if (action === 'parseResumeStructure') result = await parseResumeStructure(client, payload.rawText)
    else return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function callClaude(client: Anthropic, prompt: string, maxTokens = 4096) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

async function tailorResume(client: Anthropic, resumeRawText: string, jobDescription: string) {
  const text = await callClaude(client, `You are an expert resume editor. Tailor the candidate's resume to match the job description.

RULES:
- Never fabricate experience, skills, or achievements
- Only rewrite/reorder existing content to better match the JD's language
- For skills: only include skills that already exist in the resume AND are relevant

MASTER RESUME:
${resumeRawText}

JOB DESCRIPTION:
${jobDescription}

Return JSON only:
{
  "diffs": [{ "section": "<company or project name>", "index": <0-based>, "original": "<text>", "tailored": "<text>" }],
  "tailoredSkills": { "languages": [], "tools": [] },
  "originalSkills": { "languages": [], "tools": [] }
}`)
  const parsed = JSON.parse(text)
  return { ...parsed, diffs: parsed.diffs.map((d: any) => ({ ...d, accepted: true })) }
}

async function analyzeJobFit(client: Anthropic, resumeRawText: string, jobDescription: string) {
  const text = await callClaude(client, `You are a career coach. Analyze how well this resume matches the job description.

RESUME:
${resumeRawText}

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
}`, 2048)
  return JSON.parse(text)
}

async function generateCoverLetter(client: Anthropic, company: string, role: string, jobDescription: string, header?: { name: string; contact: string }) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const headerName = header?.name ?? 'My Name'
  const headerContact = header?.contact ?? 'phone | email | linkedin'
  const TEMPLATE = `${headerName}
${headerContact}

[TODAY_DATE]

Dear Hiring Manager,

I am writing to express my interest in the [POSITION_NAME] position at [COMPANY_NAME]. With a Bachelor of Science in Computer Science from the University of Bridgeport and relevant professional experience, I believe my skills align well with this opportunity.

In my previous role at Catbotica, I collaborated with a team to develop an NFT Rendering Model Generator using TypeScript, which streamlined the creation and management of 12,000 digital assets in the blockchain ecosystem. I successfully connected backend systems and developed custom scripts to facilitate seamless data exchange. At Innerwave, I built an internal Java Spring Boot web application that enhanced accessibility for company developers, tracking over 5,000 medical terms through a CRUD dashboard.

My technical skills include Java, JavaScript, TypeScript, Python, C++, Spring Framework, React Native, Node.js, SQL, and experience with development tools such as Git, Jira, and Confluence.

I am particularly interested in [COMPANY_NAME] because of [SPECIFIC_ASPECT_OF_COMPANY]. My experience with [RELEVANT_SKILL] aligns well with your [SPECIFIC_PROJECT_OR_REQUIREMENT], and I am excited about the opportunity to contribute to your innovative projects. I am confident that my technical background and collaborative approach would make me a valuable addition to your team.

Thank you for considering my application. I look forward to discussing how my background would benefit your team.

Sincerely,
${headerName}`

  const text = await callClaude(client, `Fill in this cover letter template. Replace ONLY the placeholders.

COMPANY: ${company}
ROLE: ${role}
TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

TEMPLATE:
${TEMPLATE}

Return only the completed letter text, no markdown.`, 2048)

  return { text }
}

async function extractJobInfo(client: Anthropic, content: string) {
  const text = await callClaude(client, `Extract job information from this text.

TEXT:
${content}

Return JSON only:
{ "company": "", "role": "", "jobDescription": "" }`, 2048)
  return JSON.parse(text)
}

async function parseResumeStructure(client: Anthropic, rawText: string) {
  const text = await callClaude(client, `Parse this resume into structured JSON.

RESUME:
${rawText}

Return JSON only:
{
  "header": { "name": "", "contact": "" },
  "education": [{ "school": "", "location": "", "degree": "", "dates": "", "awards": "" }],
  "skills": { "languages": [], "tools": [] },
  "experience": [{ "company": "", "location": "", "title": "", "dates": "", "bullets": [] }],
  "projects": [{ "name": "", "tech": "", "bullets": [] }]
}`)
  return JSON.parse(text)
}
