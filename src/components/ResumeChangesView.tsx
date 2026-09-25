import { useState, useRef, useEffect } from 'react'
import type { TailoredResume } from '../lib/tailorResume'
import type { ResumeStructure } from '../lib/parseResumeStructure'
import { applyTailoring, skillGroups, sectionTitle } from '../lib/resumeUtils'

interface Props {
  tailored: TailoredResume
  structure: ResumeStructure
  rawText?: string
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
      title="Copy"
    >
      {copiedKey === copyKey
        ? <span className="text-emerald-500 text-xs">✓</span>
        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      }
    </button>
  )
}

function ResumePreview({ structure, rawText, changedSections = [], copyable = false, copiedKey, onCopy, scrollRef, onScroll }: {
  structure: ResumeStructure
  rawText?: string
  changedSections?: string[]
  copyable?: boolean
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
  scrollRef?: React.RefObject<HTMLDivElement>
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
}) {
  const skills = skillGroups(structure)
  return (
    <div ref={scrollRef} onScroll={onScroll} className="text-xs leading-relaxed p-4 bg-white border border-gray-200 rounded-xl overflow-y-auto max-h-[600px]">
      {/* Header */}
      <div className="text-center mb-4">
        <div className="font-bold text-sm">{structure.header.name}</div>
        <div className="text-gray-500 text-xs">{structure.header.contact}</div>
      </div>

      {/* Education */}
      <ResumeSection title={sectionTitle(structure, 'education', rawText)}>
        {structure.education.map((edu, i) => (
          <div key={i} className="mb-2">
            <div className="flex justify-between"><span className="font-bold">{edu.school}</span><span>{edu.location}</span></div>
            <div className="flex justify-between text-gray-600"><span className="italic">{edu.degree}</span><span className="italic">{edu.dates}</span></div>
            {edu.awards && <div className="text-gray-600"><span className="font-semibold">Awards: </span>{edu.awards}</div>}
          </div>
        ))}
      </ResumeSection>

      {/* Skills */}
      <ResumeSection title={sectionTitle(structure, 'skills', rawText)}>
        <div className="group relative">
          {skills.map((g, i) => (
            <div key={i}><span className="font-bold">{g.label}: </span>{g.items.join(', ')}</div>
          ))}
          {copyable && onCopy && (
            <div className="absolute top-0 right-0">
              <CopyButton text={skills.map(g => `${g.label}: ${g.items.join(', ')}`).join('\n')} copyKey="skills" copiedKey={copiedKey ?? null} onCopy={onCopy} />
            </div>
          )}
        </div>
      </ResumeSection>

      {/* Experience — grouped by company */}
      <ResumeSection title={sectionTitle(structure, 'experience', rawText)}>
        {(() => {
          const groups: { company: string; location: string; isChanged: boolean; roles: { title: string; dates: string; bullets: string[]; expIdx: number }[] }[] = []
          structure.experience.forEach((exp, i) => {
            const last = groups[groups.length - 1]
            if (last && last.company === exp.company) {
              last.roles.push({ title: exp.title, dates: exp.dates, bullets: exp.bullets, expIdx: i })
              if (changedSections.includes(exp.company)) last.isChanged = true
            } else {
              groups.push({ company: exp.company, location: exp.location, isChanged: changedSections.includes(exp.company), roles: [{ title: exp.title, dates: exp.dates, bullets: exp.bullets, expIdx: i }] })
            }
          })
          return groups.map((group, gi) => (
            <div key={gi} className={`mb-3 ${group.isChanged ? 'bg-emerald-50 rounded p-2 -mx-2' : ''}`}>
              <div className="flex justify-between"><span className="font-bold">{group.company}</span><span className="font-bold">{group.location}</span></div>
              {group.roles.map((role, ri) => (
                <div key={ri} className="flex justify-between text-gray-600">
                  <span className="italic">{role.title}</span><span className="italic">{role.dates}</span>
                </div>
              ))}
              {group.roles.map((role, ri) => (
                <div key={ri} className="group relative">
                  {role.bullets.map((b, j) => (
                    <div key={j} className="pl-2 text-gray-700">● {b}</div>
                  ))}
                  {copyable && onCopy && (
                    <div className="absolute top-0 right-0">
                      <CopyButton text={role.bullets.join('\n')} copyKey={`exp-${role.expIdx}`} copiedKey={copiedKey ?? null} onCopy={onCopy} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        })()}
      </ResumeSection>

      {/* Projects */}
      <ResumeSection title={sectionTitle(structure, 'projects', rawText)}>
        {structure.projects.map((proj, i) => {
          const isChanged = changedSections.includes(proj.name)
          return (
            <div key={i} className={`mb-3 ${isChanged ? 'bg-emerald-50 rounded p-2 -mx-2' : ''}`}>
              <div className="flex justify-between">
                <span><span className="font-bold">{proj.name}</span>{proj.tech && <span className="text-gray-600"> ({proj.tech})</span>}</span>
                {proj.dates && <span className="text-gray-600 italic">{proj.dates}</span>}
              </div>
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

export default function ResumeChangesView({ tailored, structure, rawText }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  function syncScroll(source: 'left' | 'right') {
    if (syncing.current) return
    syncing.current = true
    const from = source === 'left' ? leftRef.current : rightRef.current
    const to   = source === 'left' ? rightRef.current : leftRef.current
    if (from && to) to.scrollTop = from.scrollTop
    syncing.current = false
  }

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
    ...experienceDiffs.map(d => d.section),
    ...projectDiffs.map(d => d.section),
  ]

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed">
        Highlighted sections were rewritten to better match the job description. Copy any bullet you want to use, or export the full tailored resume below.
      </div>
      {/* Split preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 text-center mb-2">Original</p>
          <ResumePreview structure={structure} rawText={rawText} scrollRef={leftRef} onScroll={() => syncScroll('left')} />
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-600 text-center mb-2">Tailored</p>
          <ResumePreview
            structure={tailoredStructure}
            rawText={rawText}
            changedSections={changedSections}
            copyable
            copiedKey={copiedKey}
            onCopy={copyWithFeedback}
            scrollRef={rightRef}
            onScroll={() => syncScroll('right')}
          />
        </div>
      </div>

      {tailored.diffs.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">No changes. Your resume already matches this job well.</p>
      )}

    </div>
  )
}
