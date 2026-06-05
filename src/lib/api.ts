import { supabase } from './supabase'

async function callProxy(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('claude-proxy', {
    body: { action, payload },
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

export const api = {
  tailorResume: (resumeRawText: string, jobDescription: string) =>
    callProxy('tailorResume', { resumeRawText, jobDescription }),

  analyzeJobFit: (resumeRawText: string, jobDescription: string, currentLocation?: string) =>
    callProxy('analyzeJobFit', { resumeRawText, jobDescription, currentLocation }),

  generateCoverLetter: (company: string, role: string, jobDescription: string, header?: { name: string; contact: string }) =>
    callProxy('generateCoverLetter', { company, role, jobDescription, header }).then(d => d.text as string),

  extractJobInfo: (content: string) =>
    callProxy('extractJobInfo', { content }),

  parseResumeStructure: (rawText: string) =>
    callProxy('parseResumeStructure', { rawText }),
}
