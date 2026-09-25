import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify request includes a Supabase JWT (anon or user token)
  const authHeader = req.headers.get('Authorization') || req.headers.get('apikey') || ''
  if (!authHeader.startsWith('Bearer ') && !authHeader.startsWith('eyJ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { action, payload } = await req.json()
    const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    let result
    if (action === 'tailorResume')         result = await tailorResume(client, payload.resumeRawText, payload.jobDescription)
    else if (action === 'analyzeJobFit')   result = await analyzeJobFit(client, payload.resumeRawText, payload.jobDescription, payload.currentLocation)
    else if (action === 'generateCoverLetter') result = await generateCoverLetter(client, payload.company, payload.role, payload.jobDescription, payload.header, payload.today, payload.template)
    else if (action === 'extractJobInfo')  result = await extractJobInfo(client, payload.content)
    else if (action === 'analyzeAndExtract') result = await analyzeAndExtract(client, payload.content, payload.resumeRawText, payload.currentLocation)
    else if (action === 'parseResumeStructure') result = await parseResumeStructure(client, payload.rawText)
    else if (action === 'generateWhyCompany') result = await generateWhyCompany(client, payload.company, payload.role, payload.jobDescription, payload.resumeRawText, payload.length)
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
  const text = await callClaude(client, `You are a resume rewriter for a software engineer. Rewrite experience bullets to match the job description provided. Follow these rules strictly:

TONE & STYLE:
- Write like a real engineer wrote it, not a career coach
- Plain, direct language only
- 1-2 lines per bullet max
- Always start bullets with a past-tense action verb

BANNED WORDS & PHRASES (never use these):
- seamless / seamlessly
- robust
- leveraged
- spearheaded
- ensured
- passionate / passion
- from start to finish
- plan, shape, and build
- improving performance and reliability
- improving team productivity
- critical technical decisions
- across the stack
- owning / took ownership of
- enhancing the process of
- in a fast-paced environment
- detail-oriented
- results-driven
- collaborated closely
- worked closely

BULLET RULES:
- If the original bullet already has a metric or number, lead with the outcome first, then explain how. Example: "Reduced errors by 40% by automating data validation checks" not "Built a validation system that reduced errors by 40%"
- If the original bullet has NO metric, rewrite it as clearly as possible without inventing numbers
- Include specific tech, numbers, or scale when available in the original
- Don't repeat the same verb more than once per section
- Do NOT end bullets with a period
- Never fabricate experience, skills, or achievements
- Only rewrite existing content to better match the JD's language

SKILLS RULES:
- Only include skills that already exist in the resume AND are relevant to the JD

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

async function analyzeJobFit(client: Anthropic, resumeRawText: string, jobDescription: string, currentLocation?: string) {
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
}`, 2048)
  return JSON.parse(text)
}

async function generateCoverLetter(client: Anthropic, company: string, role: string, jobDescription: string, header?: { name: string; contact: string }, today?: string, customTemplate?: string) {
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

async function analyzeAndExtract(client: Anthropic, content: string, resumeRawText?: string, currentLocation?: string) {
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
}`, 3072)
  return JSON.parse(text)
}

async function generateWhyCompany(client: Anthropic, company: string, role: string, jobDescription: string, resumeRawText?: string, length: 'short' | 'medium' | 'long' = 'medium') {
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

Return only the answer text, nothing else.`, 1024)

  return { text }
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
