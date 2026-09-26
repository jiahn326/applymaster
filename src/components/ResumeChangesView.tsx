import { useState, useRef } from 'react'
import type { TailoredResume } from '../lib/tailorResume'
import type { ResumeStructure } from '../lib/parseResumeStructure'
import { resolveTailoring, skillGroups, sectionTitle, labeledLine, type DiffPlacement } from '../lib/resumeUtils'
import { wordDiff } from '../lib/wordDiff'

interface Props {
  tailored: TailoredResume
  structure: ResumeStructure
  rawText?: string
  // Turns one suggested change on/off; the preview and PDF follow `accepted`
  onToggleDiff?: (diffIndex: number) => void
}

type PlacementMap = Map<string, DiffPlacement>
const placementKey = (kind: DiffPlacement['kind'], entry: number, bullet: number) => `${kind}:${entry}:${bullet}`


// ─── Resume section renderer ──────────────────────────────────────────────────

function ResumeSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
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

// Undo shows on hover where a mouse is available and always on touch screens;
// Redo is always visible because an undone bullet has no highlight to point to it.
function ToggleButton({ label, onClick, alwaysVisible, title }: { label: string; onClick: () => void; alwaysVisible?: boolean; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className={`ml-1.5 align-baseline text-[10px] font-semibold text-gray-400 hover:text-gray-900 underline underline-offset-2 transition-opacity focus-visible:opacity-100 ${
        alwaysVisible ? '' : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/bullet:opacity-100'
      }`}>
      {label}
    </button>
  )
}

// A bullet that differs from its counterpart on the other side gets a colored rule on
// the left and only the changed words highlighted: removed words on the original side,
// added words on the tailored side. On the tailored side a change can be undone/redone.
function Bullet({ text, counterpart, side, placement, suggestion, onToggle }: {
  text: string
  counterpart?: string
  side: 'original' | 'tailored'
  placement?: DiffPlacement
  suggestion?: string
  onToggle?: (diffIndex: number) => void
}) {
  if (placement?.status === 'undone' && side === 'tailored') {
    return (
      <div className="pl-2 border-l-2 border-dashed border-gray-300 text-gray-700">
        ● {text}
        {onToggle && <ToggleButton label="Redo" alwaysVisible title={suggestion ? `Suggested: ${suggestion}` : undefined} onClick={() => onToggle(placement.diffIndex)} />}
      </div>
    )
  }
  if (counterpart === undefined || counterpart === text) {
    return <div className="pl-2 border-l-2 border-transparent text-gray-700">● {text}</div>
  }
  const parts = side === 'original' ? wordDiff(text, counterpart) : wordDiff(counterpart, text)
  const shown = side === 'original' ? 'removed' : 'added'
  return (
    <div className={`group/bullet pl-2 border-l-2 text-gray-700 ${side === 'original' ? 'border-red-300' : 'border-emerald-500'}`}>
      ●{' '}
      {parts.filter(p => p.type === 'same' || p.type === shown).map((p, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {p.type === 'same'
            ? p.text
            : side === 'original'
              ? <span className="bg-red-50 text-red-700 line-through decoration-red-300 rounded-sm px-0.5">{p.text}</span>
              : <span className="bg-emerald-100 text-emerald-900 font-medium rounded-sm px-0.5">{p.text}</span>}
        </span>
      ))}
      {side === 'tailored' && placement?.status === 'applied' && onToggle && (
        <ToggleButton label="Undo" onClick={() => onToggle(placement.diffIndex)} />
      )}
    </div>
  )
}

function ResumePreview({ structure, compareTo, side, rawText, placements, suggestions, onToggle, copyable = false, copiedKey, onCopy, scrollRef, onScroll }: {
  structure: ResumeStructure
  compareTo: ResumeStructure
  side: 'original' | 'tailored'
  rawText?: string
  placements?: PlacementMap
  suggestions?: string[]
  onToggle?: (diffIndex: number) => void
  copyable?: boolean
  copiedKey?: string | null
  onCopy?: (text: string, key: string) => void
  scrollRef?: React.RefObject<HTMLDivElement | null>
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void
}) {
  const skills = skillGroups(structure).map(g => labeledLine(g.label, g.items.join(', ')))
  const bulletProps = (kind: DiffPlacement['kind'], entry: number, bullet: number) => {
    const placement = placements?.get(placementKey(kind, entry, bullet))
    return { placement, suggestion: placement ? suggestions?.[placement.diffIndex] : undefined, onToggle }
  }
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
            {edu.awards && <div className="text-gray-600"><span className="font-semibold">Awards: </span>{labeledLine('Awards', edu.awards).text}</div>}
          </div>
        ))}
      </ResumeSection>

      {/* Skills */}
      <ResumeSection title={sectionTitle(structure, 'skills', rawText)}>
        <div className="group relative">
          {skills.map((g, i) => (
            <div key={i}><span className="font-bold">{g.label}: </span>{g.text}</div>
          ))}
          {copyable && onCopy && (
            <div className="absolute top-0 right-0">
              <CopyButton text={skills.map(g => `${g.label}: ${g.text}`).join('\n')} copyKey="skills" copiedKey={copiedKey ?? null} onCopy={onCopy} />
            </div>
          )}
        </div>
      </ResumeSection>

      {/* Experience — grouped by company */}
      <ResumeSection title={sectionTitle(structure, 'experience', rawText)}>
        {(() => {
          const groups: { company: string; location: string; roles: { title: string; dates: string; bullets: string[]; expIdx: number }[] }[] = []
          structure.experience.forEach((exp, i) => {
            const last = groups[groups.length - 1]
            if (last && last.company === exp.company) {
              last.roles.push({ title: exp.title, dates: exp.dates, bullets: exp.bullets, expIdx: i })
            } else {
              groups.push({ company: exp.company, location: exp.location, roles: [{ title: exp.title, dates: exp.dates, bullets: exp.bullets, expIdx: i }] })
            }
          })
          return groups.map((group, gi) => (
            <div key={gi} className="mb-3">
              <div className="flex justify-between"><span className="font-bold">{group.company}</span><span className="font-bold">{group.location}</span></div>
              {group.roles.map((role, ri) => (
                <div key={ri} className="flex justify-between text-gray-600">
                  <span className="italic">{role.title}</span><span className="italic">{role.dates}</span>
                </div>
              ))}
              {group.roles.map((role, ri) => (
                <div key={ri} className="group relative">
                  {role.bullets.map((b, j) => (
                    <Bullet key={j} text={b} counterpart={compareTo.experience[role.expIdx]?.bullets[j]} side={side} {...bulletProps('experience', role.expIdx, j)} />
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
          return (
            <div key={i} className="mb-3">
              <div className="flex justify-between">
                <span><span className="font-bold">{proj.name}</span>{proj.tech && <span className="text-gray-600"> ({proj.tech})</span>}</span>
                {proj.dates && <span className="text-gray-600 italic">{proj.dates}</span>}
              </div>
              <div className="group relative">
                {proj.bullets.map((b, j) => (
                  <Bullet key={j} text={b} counterpart={compareTo.projects[i]?.bullets[j]} side={side} {...bulletProps('projects', i, j)} />
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

export default function ResumeChangesView({ tailored, structure, rawText, onToggleDiff }: Props) {
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

  const resolution = resolveTailoring(structure, tailored)
  const tailoredStructure = resolution.structure
  const placements: PlacementMap = new Map(resolution.placements.map(p => [placementKey(p.kind, p.entry, p.bullet), p]))
  const suggestions = tailored.diffs.map(d => d.tailored)

  return (
    <div className="space-y-3">
      <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-500 leading-relaxed">
        Only the words that changed are highlighted: <span className="bg-red-50 text-red-700 line-through decoration-red-300 rounded-sm px-0.5">removed</span> on the left, <span className="bg-emerald-100 text-emerald-900 font-medium rounded-sm px-0.5">added</span> on the right. Don't want a change? Use <span className="font-semibold">Undo</span> on that bullet — the PDF follows your choices.
      </div>
      {/* Split preview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 text-center mb-2">Original</p>
          <ResumePreview structure={structure} compareTo={tailoredStructure} side="original" rawText={rawText} scrollRef={leftRef} onScroll={() => syncScroll('left')} />
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-600 text-center mb-2">Tailored</p>
          <ResumePreview
            structure={tailoredStructure}
            compareTo={structure}
            side="tailored"
            rawText={rawText}
            placements={placements}
            suggestions={suggestions}
            onToggle={onToggleDiff}
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
