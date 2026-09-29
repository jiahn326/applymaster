import { api } from './api'

export interface FitCategory {
  label: string
  score: number
  verdict: 'strong' | 'good' | 'reach' | 'weak'
  summary: string
  // Added later — older saved analyses only have `summary`, and some have plain-string reasons
  strengths?: FitReason[]
  gaps?: FitReason[]
}

export type FitReason = string | { item: string; note?: string }

export interface JobFitAnalysis {
  overallScore: number
  verdict: 'Apply' | 'Maybe' | 'Skip'
  verdictReason: string
  categories: FitCategory[]
  // A JD requirement the candidate clearly can't meet; forces Skip. Newer analyses only.
  dealbreaker?: string | null
}

export async function analyzeJobFit(
  resumeRawText: string,
  jobDescription: string,
  currentLocation?: string
): Promise<JobFitAnalysis> {
  return api.analyzeJobFit(resumeRawText, jobDescription, currentLocation)
}
