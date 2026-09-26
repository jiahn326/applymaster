import { api } from './api'
import type { ResumeStructure } from './parseResumeStructure'

export interface BulletDiff {
  section: string
  index: number
  original: string
  tailored: string
  accepted: boolean
}

// The resume a result was tailored from, saved with the result so later resume
// uploads don't change how it's applied. Older results don't have it.
export interface TailoringBase {
  resumeId?: string
  structure: ResumeStructure
  rawText?: string
}

export interface TailoredResume {
  diffs: BulletDiff[]
  base?: TailoringBase
  // Legacy fields from older tailoring results — no longer applied, skills always come from the original resume
  tailoredSkills?: { languages: string[]; tools: string[] }
  originalSkills?: { languages: string[]; tools: string[] }
}

export interface ResumeSource {
  id?: string
  rawText: string
  structure?: ResumeStructure | null
}

export async function tailorResume(
  resume: ResumeSource,
  jobDescription: string,
  signal?: AbortSignal
): Promise<TailoredResume> {
  const result: TailoredResume = await api.tailorResume(resume.rawText, jobDescription, signal)
  return resume.structure
    ? { ...result, base: { resumeId: resume.id, structure: resume.structure, rawText: resume.rawText } }
    : result
}
