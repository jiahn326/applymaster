import type { TailoredResume } from './tailorResume'
import type { ResumeStructure, SkillGroup, SectionKey } from './parseResumeStructure'

export function applyTailoring(structure: ResumeStructure, tailored: TailoredResume): ResumeStructure {
  const result: ResumeStructure = JSON.parse(JSON.stringify(structure))

  for (const diff of tailored.diffs) {
    if (!diff.accepted) continue
    for (const exp of result.experience) {
      if (exp.company === diff.section || exp.title === diff.section) {
        if (exp.bullets[diff.index] !== undefined) exp.bullets[diff.index] = diff.tailored
      }
    }
    for (const proj of result.projects) {
      if (proj.name === diff.section || proj.name.startsWith(diff.section)) {
        if (proj.bullets[diff.index] !== undefined) proj.bullets[diff.index] = diff.tailored
      }
    }
  }

  for (const exp of result.experience) {
    exp.bullets = exp.bullets.map(b => b.replace(/\s*\[add metric:[^\]]*\]/gi, '').trim())
  }
  for (const proj of result.projects) {
    proj.bullets = proj.bullets.map(b => b.replace(/\s*\[add metric:[^\]]*\]/gi, '').trim())
  }

  return result
}

export function skillGroups(structure: ResumeStructure): SkillGroup[] {
  const { groups, languages, tools } = structure.skills ?? {}
  if (groups?.length) return groups
  return [
    { label: 'Languages', items: languages ?? [] },
    { label: 'Tools', items: tools ?? [] },
  ].filter(g => g.items.length)
}

const DEFAULT_TITLES: Record<SectionKey, string> = {
  education: 'EDUCATION',
  skills: 'SKILLS',
  experience: 'EXPERIENCE',
  projects: 'PROJECTS',
}

const TITLE_PATTERNS: Record<SectionKey, RegExp> = {
  education: /^education\b/i,
  skills: /skills\b/i,
  experience: /experience\b/i,
  projects: /projects?\b/i,
}

// Heading as written in the original resume. Older parses have no sectionTitles,
// so fall back to finding a short heading line in the raw text.
export function sectionTitle(structure: ResumeStructure, key: SectionKey, rawText?: string): string {
  const parsed = structure.sectionTitles?.[key]?.trim()
  if (parsed) return parsed
  const line = rawText?.split('\n')
    .map(l => l.trim())
    .find(l => l.length <= 40 && l === l.toUpperCase() && TITLE_PATTERNS[key].test(l))
  return line ?? DEFAULT_TITLES[key]
}
