import { useState } from 'react'
import type { TailoredResume } from '../lib/tailorResume'
import type { ResumeStructure } from '../lib/parseResumeStructure'

interface Props {
  tailored: TailoredResume
  structure: ResumeStructure
}


// Apply tailoring to structure
function applyTailoring(structure: ResumeStructure, tailored: TailoredResume): ResumeStructure {
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
  return result
}


// ─── Resume section renderer ──────────────────────────────────────────────────

function ResumeSection({ title, children, highlighted = false }: { title: string; children: React.ReactNode; highlighted?: boolean }) {
  return (
    <div className={`mb-4 ${highlighted ? 'bg-emerald-50 rounded-lg p-3 -mx-3' : ''}`}>
      <div className="text-center border-b border-gray-900 mb-2">
        <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  )
}

function CopyButton({ text, copyKey, copiedKey, onCopy }: { text: string; copyKey: string; copiedKey: string | null; onCopy: (t: string, k: string) => void }) {
  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5 rounded hover:bg-gray-200 shrink-0"
      title="복사"
    >
      {copiedKey === copyKey
        ? <span className="text-emerald-500 text-xs">✓</span>
        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      }
    </button>
  )
}

function ResumePreview({ structure, changedSections = [], copyable = false, copiedKey, onCopy }: {
  structure: ResumeStructure
  changedSections?: string[]
  copyable?: boolean
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
}) {
  return (
    <div className="text-xs leading-relaxed p-4 bg-white border border-gray-200 rounded-xl overflow-y-auto max-h-[600px]">
      {/* Header */}
      <div className="text-center mb-4">
        <div className="font-bold text-sm">{structure.header.name}</div>
        <div className="text-gray-500 text-xs">{structure.header.contact}</div>
      </div>

      {/* Education */}
      <ResumeSection title="EDUCATION">
        {structure.education.map((edu, i) => (
          <div key={i} className="mb-2">
            <div className="flex justify-between"><span className="font-bold">{edu.school}</span><span>{edu.location}</span></div>
            <div className="flex justify-between text-gray-600"><span className="italic">{edu.degree}</span><span className="italic">{edu.dates}</span></div>
            {edu.awards && <div className="text-gray-600"><span className="font-semibold">Awards: </span>{edu.awards}</div>}
          </div>
        ))}
      </ResumeSection>

      {/* Skills */}
      <ResumeSection title="SKILLS" highlighted={changedSections.includes('skills')}>
        <div className="group flex items-start gap-1">
          <div className="flex-1">
            <span className="font-bold">Languages: </span>{structure.skills.languages.join(', ')}
          </div>
          {copyable && onCopy && (
            <CopyButton text={`Languages: ${structure.skills.languages.join(', ')}\nTools: ${structure.skills.tools.join(', ')}`} copyKey="skills" copiedKey={copiedKey ?? null} onCopy={onCopy} />
          )}
        </div>
        <div><span className="font-bold">Tools: </span>{structure.skills.tools.join(', ')}</div>
      </ResumeSection>

      {/* Experience */}
      <ResumeSection title="EXPERIENCE">
        {structure.experience.map((exp, i) => {
          const isChanged = changedSections.includes(exp.company)
          return (
            <div key={i} className={`mb-3 ${isChanged ? 'bg-emerald-50 rounded p-2 -mx-2' : ''}`}>
              <div className="flex justify-between"><span className="font-bold">{exp.company}</span><span className="font-bold">{exp.location}</span></div>
              <div className="flex justify-between text-gray-600"><span className="italic">{exp.title}</span><span className="italic">{exp.dates}</span></div>
              <div className="group relative">
                {exp.bullets.map((b, j) => (
                  <div key={j} className="pl-2 text-gray-700">● {b}</div>
                ))}
                {copyable && onCopy && (
                  <div className="absolute top-0 right-0">
                    <CopyButton text={exp.bullets.join('\n')} copyKey={`exp-${i}`} copiedKey={copiedKey ?? null} onCopy={onCopy} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </ResumeSection>

      {/* Projects */}
      <ResumeSection title="PERSONAL PROJECTS">
        {structure.projects.map((proj, i) => {
          const isChanged = changedSections.includes(proj.name)
          return (
            <div key={i} className={`mb-3 ${isChanged ? 'bg-emerald-50 rounded p-2 -mx-2' : ''}`}>
              <div><span className="font-bold">{proj.name}</span>{proj.tech && <span className="text-gray-600"> ({proj.tech})</span>}</div>
              <div className="group relative">
                {proj.bullets.map((b, j) => (
                  <div key={j} className="pl-2 text-gray-700">● {b}</div>
                ))}
                {copyable && onCopy && (
                  <div className="absolute top-0 right-0">
                    <CopyButton text={proj.bullets.join('\n')} copyKey={`proj-${i}`} copiedKey={copiedKey ?? null} onCopy={onCopy} />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </ResumeSection>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ResumeChangesView({ tailored, structure }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function copyWithFeedback(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const tailoredStructure = applyTailoring(structure, tailored)
  const acceptedDiffs = tailored.diffs.filter(d => d.accepted)

  const experienceDiffs = acceptedDiffs.filter(d =>
    structure.experience.some(e => e.company === d.section || e.title === d.section)
  )
  const projectDiffs = acceptedDiffs.filter(d =>
    structure.projects.some(p => p.name === d.section || p.name.startsWith(d.section))
  )

  const changedSections = [
    ...(tailored.tailoredSkills.languages.length !== structure.skills.languages.length ||
        tailored.tailoredSkills.tools.length !== structure.skills.tools.length ? ['skills'] : []),
    ...experienceDiffs.map(d => d.section),
    ...projectDiffs.map(d => d.section),
  ]

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Green = changed · Hover to copy</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 text-center mb-2">Original</p>
          <ResumePreview structure={structure} />
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-600 text-center mb-2">Tailored</p>
          <ResumePreview
            structure={tailoredStructure}
            changedSections={changedSections}
            copyable
            copiedKey={copiedKey}
            onCopy={copyWithFeedback}
          />
        </div>
      </div>

      {acceptedDiffs.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">No changes — your resume already matches this JD well!</p>
      )}

    </div>
  )
}
