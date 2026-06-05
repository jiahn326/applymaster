import { api } from './api'

export interface ExtractedJobInfo {
  company: string
  role: string
  jobDescription: string
}

export async function extractJobInfo(pastedText: string): Promise<ExtractedJobInfo> {
  const trimmed = pastedText.trim()
  let content = trimmed

  // Fetch URL content via Jina if it's a URL
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const res = await fetch(`https://r.jina.ai/${trimmed}`, { headers: { 'Accept': 'text/plain' } })
      if (res.ok) content = await res.text()
    } catch { /* fall back to raw URL */ }
  }

  return api.extractJobInfo(content)
}
