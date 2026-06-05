import { api } from './api'

export interface FitCategory {
  label: string
  score: number
  verdict: 'strong' | 'good' | 'reach' | 'weak'
  summary: string
}

export interface JobFitAnalysis {
  overallScore: number
  verdict: 'Apply' | 'Maybe' | 'Skip'
  verdictReason: string
  categories: FitCategory[]
}

export async function analyzeJobFit(
  resumeRawText: string,
  jobDescription: string,
  currentLocation?: string
): Promise<JobFitAnalysis> {
  return api.analyzeJobFit(resumeRawText, jobDescription, currentLocation)
}
