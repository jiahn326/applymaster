import type { ResumeStructure } from './parseResumeStructure'
import type { AppStatus } from './status'

// Row shapes for the Supabase tables the pages read directly

export interface ResumeContent {
  file_name?: string
  current_location?: string | null
  raw_text?: string
  structure?: ResumeStructure | null
}

export interface ResumeRow {
  id: string
  created_at: string
  content: ResumeContent
}

export interface UserSettingsRow {
  active_resume_id: string | null
}

// What the dashboard list needs for each application
export interface ApplicationSummary {
  id: string
  created_at: string
  company: string
  role: string
  job_url: string | null
  status: AppStatus
  notes: string | null
  applied_through: string | null
  cover_letter: string | null
  cover_letter_submitted: boolean
  fit_analysis: { verdict: 'Apply' | 'Maybe' | 'Skip'; overallScore: number } | null
}

// Errors come as Error instances or as Supabase error objects ({ message })
export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return fallback
}
