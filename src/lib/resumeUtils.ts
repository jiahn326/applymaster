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

// Where a diff lands in the resume: experience/projects entry index + bullet index.
// `diffIndex` points into tailored.diffs so the UI can toggle that diff.
export interface DiffPlacement {
  diffIndex: number
  kind: 'experience' | 'projects'
  entry: number
  bullet: number
  status: 'applied' | 'undone'
}

export interface TailoringResolution {
  structure: ResumeStructure
  applied: BulletDiff[]
  notApplied: BulletDiff[]   // accepted, but no bullet in the resume matches its original text
  undone: BulletDiff[]       // turned off by the user (accepted: false)
  placements: DiffPlacement[]
}

// Applies accepted diffs only where the original text is actually in the resume:
//   1. the bullet at diff.index in a matching section, or
//   2. if not there, a bullet with that text that appears exactly once in the section.
// Anything else is reported as not applied instead of overwriting a different bullet.
// Diffs the user turned off are located the same way (so they can be turned back on)
// but leave the bullet unchanged.
export function resolveTailoring(structure: ResumeStructure, tailored: TailoredResume): TailoringResolution {
  const result: ResumeStructure = JSON.parse(JSON.stringify(structure))
  const applied: BulletDiff[] = [], notApplied: BulletDiff[] = [], undone: BulletDiff[] = []
  const placements: DiffPlacement[] = []
  // Bullets already claimed by a diff, so two diffs never land on the same bullet
  const claimed = new Set<string>()
  const key = (kind: string, entry: number, bullet: number) => `${kind}:${entry}:${bullet}`

  ;(tailored.diffs ?? []).forEach((diff, diffIndex) => {
    const on = diff.accepted !== false
    const original = normalizeBullet(diff.original ?? '')
    const entries = [
      ...result.experience.map((e, entry) => ({ kind: 'experience' as const, entry, bullets: e.bullets, match: e.company === diff.section || e.title === diff.section })),
      ...result.projects.map((p, entry) => ({ kind: 'projects' as const, entry, bullets: p.bullets, match: p.name === diff.section || p.name.startsWith(diff.section) })),
    ].filter(e => e.match)
    const free = (e: typeof entries[number], i: number) =>
      e.bullets[i] !== undefined && !claimed.has(key(e.kind, e.entry, i)) && normalizeBullet(e.bullets[i]) === original

    let targets: { e: typeof entries[number]; i: number }[] = []
    if (original && entries.length) {
      // 1. At the saved index (every matching entry — identical bullets get the same edit)
      targets = entries.filter(e => free(e, diff.index)).map(e => ({ e, i: diff.index }))
      // 2. Moved within the section: only when the text appears exactly once
      if (!targets.length) {
        const hits = entries.flatMap(e => e.bullets.map((_, i) => ({ e, i }))).filter(h => free(h.e, h.i))
        if (hits.length === 1) targets = hits
      }
    }

    if (!on) undone.push(diff)
    else if (targets.length) applied.push(diff)
    else notApplied.push(diff)

    for (const { e, i } of targets) {
      claimed.add(key(e.kind, e.entry, i))
      if (on) e.bullets[i] = diff.tailored
      placements.push({ diffIndex, kind: e.kind, entry: e.entry, bullet: i, status: on ? 'applied' : 'undone' })
    }
  })

  for (const exp of result.experience) {
    exp.bullets = exp.bullets.map(b => b.replace(/\s*\[add metric:[^\]]*\]/gi, '').trim())
  }
  for (const proj of result.projects) {
    proj.bullets = proj.bullets.map(b => b.replace(/\s*\[add metric:[^\]]*\]/gi, '').trim())
  }

  return { structure: result, applied, notApplied, undone, placements }
}

// Re-tailoring replaces the diff list. Keep a diff turned off if the user already
// turned off the same edit (same original bullet, same tailored text) before.
export function carryOverUndone(previous: TailoredResume | null | undefined, next: TailoredResume): TailoredResume {
  const off = new Set(
    (previous?.diffs ?? [])
      .filter(d => d.accepted === false)
      .map(d => `${normalizeBullet(d.original)}\u0000${normalizeBullet(d.tailored)}`)
  )
  if (!off.size) return next
  return {
    ...next,
    diffs: next.diffs.map(d =>
      off.has(`${normalizeBullet(d.original)}\u0000${normalizeBullet(d.tailored)}`) ? { ...d, accepted: false } : d),
  }
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
