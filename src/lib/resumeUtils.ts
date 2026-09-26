import type { TailoredResume, BulletDiff } from './tailorResume'
import type { ResumeStructure, SkillGroup, SectionKey } from './parseResumeStructure'

// Normalized form used to compare a diff's `original` with a resume bullet:
// ignores bullet markers, curly vs straight quotes, dash variants, spacing, case,
// and a trailing period. Never fuzzy — a changed fact ("40%" → "50%") must not match.
export function normalizeBullet(text: string): string {
  let t = (text ?? '').normalize('NFKC').replace(/^[\s•●○■▪◦‣∙·*–—-]+/, '')
  t = t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  return t.replace(/\s+/g, ' ').trim().replace(/\.$/, '').toLowerCase()
}

export interface TailoringResolution {
  structure: ResumeStructure
  applied: BulletDiff[]
  notApplied: BulletDiff[]   // accepted, but no bullet in the resume matches its original text
  undone: BulletDiff[]       // turned off by the user (accepted: false)
}

// Applies accepted diffs only where the original text is actually in the resume:
//   1. the bullet at diff.index in a matching section, or
//   2. if not there, a bullet with that text that appears exactly once in the section.
// Anything else is reported as not applied instead of overwriting a different bullet.
export function resolveTailoring(structure: ResumeStructure, tailored: TailoredResume): TailoringResolution {
  const result: ResumeStructure = JSON.parse(JSON.stringify(structure))
  const applied: BulletDiff[] = [], notApplied: BulletDiff[] = [], undone: BulletDiff[] = []
  // Bullets already replaced, so two diffs never land on the same bullet
  const usedAt = new Map<string[], Set<number>>()
  const isUsed = (b: string[], i: number) => usedAt.get(b)?.has(i) ?? false
  const markUsed = (b: string[], i: number) => { usedAt.set(b, (usedAt.get(b) ?? new Set()).add(i)) }

  for (const diff of tailored.diffs ?? []) {
    if (!diff.accepted) { undone.push(diff); continue }
    const original = normalizeBullet(diff.original ?? '')
    const lists: string[][] = [
      ...result.experience.filter(e => e.company === diff.section || e.title === diff.section).map(e => e.bullets),
      ...result.projects.filter(p => p.name === diff.section || p.name.startsWith(diff.section)).map(p => p.bullets),
    ]
    if (!original || !lists.length) { notApplied.push(diff); continue }

    // 1. At the saved index (every matching entry — identical bullets get the same edit)
    const atIndex = lists.filter(b => b[diff.index] !== undefined && !isUsed(b, diff.index) && normalizeBullet(b[diff.index]) === original)
    if (atIndex.length) {
      for (const b of atIndex) { b[diff.index] = diff.tailored; markUsed(b, diff.index) }
      applied.push(diff)
      continue
    }
    // 2. Moved within the section: only when the text appears exactly once
    const hits = lists.flatMap(b => b.map((text, i) => ({ b, i, text })))
      .filter(h => !isUsed(h.b, h.i) && normalizeBullet(h.text) === original)
    if (hits.length === 1) {
      hits[0].b[hits[0].i] = diff.tailored
      markUsed(hits[0].b, hits[0].i)
      applied.push(diff)
    } else {
      notApplied.push(diff)
    }
  }

  for (const exp of result.experience) {
    exp.bullets = exp.bullets.map(b => b.replace(/\s*\[add metric:[^\]]*\]/gi, '').trim())
  }
  for (const proj of result.projects) {
    proj.bullets = proj.bullets.map(b => b.replace(/\s*\[add metric:[^\]]*\]/gi, '').trim())
  }

  return { structure: result, applied, notApplied, undone }
}

export function applyTailoring(structure: ResumeStructure, tailored: TailoredResume): ResumeStructure {
  return resolveTailoring(structure, tailored).structure
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

// Renderers draw the label in bold and the value after it. Parsed values sometimes
// repeat the label ("Awards: Dean's List"), and parsed labels sometimes carry their
// own colon, so normalize both to avoid "Awards: Awards:" or "Tools::".
export function labeledLine(label: string, value: string): { label: string; text: string } {
  const clean = label.trim().replace(/\s*[:：]\s*$/, '')
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefix = new RegExp(`^\\s*${escaped}\\s*[:：\\-–—]\\s*`, 'i')
  let text = value.trim()
  while (prefix.test(text)) text = text.replace(prefix, '')
  return { label: clean, text }
}

// Download name recruiters see, e.g. "Jane_Doe_Resume". No company name, so the same
// file can't reveal (or mislabel) where else you're applying. Characters that are
// invalid in file names are dropped; falls back to "Resume" when there's no name.
export function resumeFileName(name?: string): string {
  const base = [...(name ?? '')]
    .map(c => (c < ' ' ? ' ' : c))
    .filter(c => !'\\/:*?"<>|'.includes(c))
    .join('')
    .trim()
    .replace(/\s+/g, '_')
  return base ? `${base}_Resume` : 'Resume'
}
