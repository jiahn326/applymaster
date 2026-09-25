import { api } from './api'

export interface BulletDiff {
  section: string
  index: number
  original: string
  tailored: string
  accepted: boolean
}

export interface TailoredResume {
  diffs: BulletDiff[]
  // Legacy fields from older tailoring results — no longer applied, skills always come from the original resume
  tailoredSkills?: { languages: string[]; tools: string[] }
  originalSkills?: { languages: string[]; tools: string[] }
}

export async function tailorResume(
  resumeRawText: string,
  jobDescription: string
): Promise<TailoredResume> {
  return api.tailorResume(resumeRawText, jobDescription)
}
