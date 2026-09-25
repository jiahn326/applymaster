import { api } from './api'

export interface SkillGroup { label: string; items: string[] }

export type SectionKey = 'education' | 'skills' | 'experience' | 'projects'

export interface ResumeStructure {
  header: { name: string; contact: string }
  // Headings exactly as written in the original resume (older parses don't have this)
  sectionTitles?: Partial<Record<SectionKey, string>>
  education: { school: string; location: string; degree: string; dates: string; awards?: string }[]
  // `groups` keeps every skill line in original order; `languages`/`tools` are the legacy shape
  skills: { groups?: SkillGroup[]; languages?: string[]; tools?: string[] }
  experience: { company: string; location: string; title: string; dates: string; bullets: string[] }[]
  projects: { name: string; tech: string; dates?: string; bullets: string[] }[]
}

export async function parseResumeStructure(rawText: string): Promise<ResumeStructure> {
  return api.parseResumeStructure(rawText)
}
