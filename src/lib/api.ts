import { supabase } from './supabase'

// Every call takes an optional AbortSignal so the UI can cancel a slow request.
async function callProxy(action: string, payload: Record<string, unknown>, signal?: AbortSignal) {
  const { data, error } = await supabase.functions.invoke('claude-proxy', {
    body: { action, payload },
    signal,
  })
  if (error) throw new Error(error.message)
  if (data?.error) throw new Error(data.error)
  return data
}

export const api = {
  tailorResume: (resumeRawText: string, jobDescription: string, signal?: AbortSignal) =>
    callProxy('tailorResume', { resumeRawText, jobDescription }, signal),

  analyzeJobFit: (resumeRawText: string, jobDescription: string, currentLocation?: string, signal?: AbortSignal) =>
    callProxy('analyzeJobFit', { resumeRawText, jobDescription, currentLocation }, signal),

  generateCoverLetter: (company: string, role: string, jobDescription: string, header?: { name: string; contact: string }, template?: string, signal?: AbortSignal) => {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return callProxy('generateCoverLetter', { company, role, jobDescription, header, today, template }, signal).then(d => d.text as string)
  },

  extractJobInfo: (content: string, signal?: AbortSignal) =>
    callProxy('extractJobInfo', { content }, signal),

  analyzeAndExtract: (content: string, resumeRawText?: string, currentLocation?: string, signal?: AbortSignal) =>
    callProxy('analyzeAndExtract', { content, resumeRawText, currentLocation }, signal),

  parseResumeStructure: (rawText: string, signal?: AbortSignal) =>
    callProxy('parseResumeStructure', { rawText }, signal),

  generateWhyCompany: (company: string, role: string, jobDescription: string, resumeRawText?: string, length?: 'short' | 'medium' | 'long', signal?: AbortSignal) =>
    callProxy('generateWhyCompany', { company, role, jobDescription, resumeRawText, length }, signal).then(d => d.text as string),
}
