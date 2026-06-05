import { api } from './api'

export async function generateCoverLetter(
  company: string,
  role: string,
  jobDescription: string,
  header?: { name: string; contact: string }
): Promise<string> {
  return api.generateCoverLetter(company, role, jobDescription, header)
}
