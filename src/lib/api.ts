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

  generateCoverLetter: (company: string, role: string, jobDescription: string, header?: { name: string; contact: string }, template?: string, resumeText?: string, signal?: AbortSignal) => {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    return callProxy('generateCoverLetter', { company, role, jobDescription, header, today, template, resumeText }, signal).then(d => d.text as string)
  },

  analyzeAndExtract: (content: string, resumeRawText?: string, currentLocation?: string, signal?: AbortSignal) =>
    callProxy('analyzeAndExtract', { content, resumeRawText, currentLocation }, signal),

  parseResumeStructure: (rawText: string, signal?: AbortSignal) =>
    callProxy('parseResumeStructure', { rawText }, signal),

  answerQuestion: (company: string, role: string, jobDescription: string, question: string, resumeText: string | undefined, length: 'short' | 'medium' | 'long', maxChars: number | null, notes: string | undefined, signal?: AbortSignal) =>
    callProxy('answerQuestion', { company, role, jobDescription, question, resumeText, length, maxChars, notes }, signal).then(d => d.text as string),
}
