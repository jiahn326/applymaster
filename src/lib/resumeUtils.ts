import type { TailoredResume } from './tailorResume'
import type { ResumeStructure } from './parseResumeStructure'

export function applyTailoring(structure: ResumeStructure, tailored: TailoredResume): ResumeStructure {
  const result: ResumeStructure = JSON.parse(JSON.stringify(structure))
  result.skills.languages = tailored.tailoredSkills.languages
  result.skills.tools = tailored.tailoredSkills.tools

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
