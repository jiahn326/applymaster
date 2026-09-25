import { api } from './api'
import { supabase } from './supabase'

export async function generateCoverLetter(
  company: string,
  role: string,
  jobDescription: string,
  header?: { name: string; contact: string }
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  let template: string | undefined
  if (user) {
    const { data } = await supabase
      .from('user_settings')
      .select('cover_letter_template')
      .eq('user_id', user.id)
      .maybeSingle()
    template = data?.cover_letter_template ?? undefined
  }
  return api.generateCoverLetter(company, role, jobDescription, header, template)
}
