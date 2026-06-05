import { api } from './api'

export interface ResumeStructure {
  header: { name: string; contact: string }
  education: { school: string; location: string; degree: string; dates: string; awards?: string }[]
  skills: { languages: string[]; tools: string[] }
  experience: { company: string; location: string; title: string; dates: string; bullets: string[] }[]
  projects: { name: string; tech: string; bullets: string[] }[]
}

export async function parseResumeStructure(rawText: string): Promise<ResumeStructure> {
  return api.parseResumeStructure(rawText)
}
