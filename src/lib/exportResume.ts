import { jsPDF } from 'jspdf'
import type { TailoredResume } from './tailorResume'
import type { ResumeStructure } from './parseResumeStructure'
import { applyTailoring, skillGroups, sectionTitle, labeledLine } from './resumeUtils'

// ─── PDF Export ─────────────────────────────────────────────────────────────

// Lato (OFL, Latin subset from Google Fonts) is embedded so the PDF matches the
// original resume font and runs narrower than Helvetica. Falls back to Helvetica
// if the font files can't be loaded.
const LATO_FILES: [style: string, file: string][] = [
  ['normal', 'Lato-Regular.ttf'],
  ['bold', 'Lato-Bold.ttf'],
  ['italic', 'Lato-Italic.ttf'],
]
let latoCache: Promise<[string, string, string][] | null> | null = null

function loadLato() {
  latoCache ??= Promise.all(LATO_FILES.map(async ([style, file]) => {
    const res = await fetch(`${import.meta.env?.BASE_URL ?? '/'}fonts/lato/${file}`)
    if (!res.ok) throw new Error(`Failed to load ${file}`)
    const bytes = new Uint8Array(await res.arrayBuffer())
    // SPA rewrites serve index.html with 200 for missing files — require the TrueType signature
    if (bytes[0] !== 0 || bytes[1] !== 1 || bytes[2] !== 0 || bytes[3] !== 0) throw new Error(`${file} is not a TTF`)
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return [style, file, btoa(bin)] as [string, string, string]
  })).catch(() => { latoCache = null; return null })
  return latoCache
}

function registerFont(doc: jsPDF, lato: [string, string, string][] | null): string {
  if (!lato) return 'helvetica'
  for (const [style, file, data] of lato) {
    doc.addFileToVFS(file, data)
    doc.addFont(file, 'Lato', style)
  }
  return 'Lato'
}

// Body font size at which every bullet that was a single line in the original
// resume also fits on a single line here. Helvetica runs wider than most resume
// fonts, so a fixed 11pt pushes original one-line bullets onto a second line.
function fitBodyFontSize(doc: jsPDF, font: string, structure: ResumeStructure, rawText: string | undefined, bulletWidthAt: (size: number) => number): number {
  const MAX = 11, MIN = 10
  if (!rawText) return MAX
  const norm = (t: string) => t.replace(/^[\s•●○■□▪◦‣∙·*–—-]+/, '').replace(/\s+/g, '').toLowerCase()
  const rawLines = new Set(rawText.split('\n').map(norm).filter(Boolean))
  const bullets = [...structure.experience, ...structure.projects].flatMap(e => e.bullets)
  const oneLiners = bullets.filter(b => rawLines.has(norm(b)))
  if (!oneLiners.length) return MAX

  doc.setFont(font, 'normal')
  let size = MAX
  while (size > MIN && oneLiners.some(b => doc.getStringUnitWidth(b) * size > bulletWidthAt(size))) size -= 0.25
  return size
}

// Symbols missing from both embedded Lato (Latin subset) and Helvetica render as
// nothing, so swap them for characters the fonts do have.
const PDF_GLYPH_FALLBACKS: [RegExp, string][] = [
  [/[→⟶➔➜]/g, '->'],
  [/[←⟵]/g, '<-'],
  [/[●○■□▪▫◦‣∙⦁]/g, '•'],
]

function withPdfGlyphs<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (_k, v) =>
    typeof v === 'string' ? PDF_GLYPH_FALLBACKS.reduce((t, [re, sub]) => t.replace(re, sub), v) : v)
}

export async function exportPdf(
  structure: ResumeStructure,
  tailored: TailoredResume,
  fileName: string,
  rawText?: string
): Promise<void> {
  const s = withPdfGlyphs(applyTailoring(structure, tailored))
  const lato = await loadLato()
  const ml = 50, mr = 50
  const pageWidth = 612  // US Letter width in pt
  const letterHeight = 792 // US Letter height in pt
  const contentWidth = pageWidth - ml - mr
  const bulletIndent = 10
  const bulletMarker = '-  '
  const titles = {
    education: sectionTitle(s, 'education', rawText),
    skills: sectionTitle(s, 'skills', rawText),
    experience: sectionTitle(s, 'experience', rawText),
    projects: sectionTitle(s, 'projects', rawText),
  }

  // ls = line scale. All vertical spacing is multiplied by ls so content
  // fills the letter page regardless of how much text there is.
  function renderTo(doc: jsPDF, font: string, ls: number, body: number): number {
    const lineH = 13 * body / 11
    let y = 50

    function checkBreak(needed: number) {
      if (y + needed * ls > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 50 }
    }

    function sectionHeader(title: string) {
      checkBreak(22)
      y += 8 * ls
      doc.setFont(font, 'bold')
      doc.setFontSize(body + 0.5)
      doc.text(title, ml, y)
      y += 4
      doc.setLineWidth(0.5)
      doc.line(ml, y, pageWidth - mr, y)
      y += 10 * ls
    }

    function twoCol(left: string, right: string, bold = false, italic = false) {
      checkBreak(14)
      doc.setFont(font, bold ? 'bold' : italic ? 'italic' : 'normal')
      doc.setFontSize(body)
      doc.text(left, ml, y)
      doc.text(right, pageWidth - mr, y, { align: 'right' })
      y += 14 * ls
    }

    function boldLabel(rawLabel: string, rawValue: string) {
      const line = labeledLine(rawLabel, rawValue)
      const label = `${line.label}: `, value = line.text
      doc.setFont(font, 'bold')
      doc.setFontSize(body)
      const labelWidth = doc.getTextWidth(label)
      doc.setFont(font, 'normal')
      const wrapped: string[] = doc.splitTextToSize(value, contentWidth - labelWidth)
      checkBreak(lineH * wrapped.length)
      doc.setFont(font, 'bold')
      doc.text(label, ml, y)
      doc.setFont(font, 'normal')
      wrapped.forEach((line, i) => doc.text(line, ml + labelWidth, y + i * lineH * ls))
      y += (wrapped.length - 1) * lineH * ls + 14 * ls
    }

    // Hanging indent: wrapped lines start under the first letter, not under the dash
    function bulletLine(text: string) {
      doc.setFont(font, 'normal')
      doc.setFontSize(body)
      const markerWidth = doc.getTextWidth(bulletMarker)
      const wrapped: string[] = doc.splitTextToSize(text, contentWidth - bulletIndent - markerWidth)
      checkBreak(lineH * wrapped.length)
      doc.text(bulletMarker, ml + bulletIndent, y)
      wrapped.forEach((line, i) => doc.text(line, ml + bulletIndent + markerWidth, y + i * lineH * ls))
      y += wrapped.length * lineH * ls
    }

    // Header
    doc.setFont(font, 'bold')
    doc.setFontSize(16.5)
    doc.text(s.header.name, pageWidth / 2, y, { align: 'center' })
    y += 18 * ls
    doc.setFont(font, 'normal')
    doc.setFontSize(body)
    doc.text(s.header.contact, pageWidth / 2, y, { align: 'center' })
    y += 20 * ls

    // Education
    sectionHeader(titles.education)
    for (const edu of s.education) {
      twoCol(edu.school, edu.location, true)
      twoCol(edu.degree, edu.dates, false, true)
      if (edu.awards) boldLabel('Awards', edu.awards)
    }
    y += 4 * ls

    // Skills
    sectionHeader(titles.skills)
    for (const g of skillGroups(s)) boldLabel(g.label, g.items.join(', '))
    y += 4 * ls

    // Experience — group consecutive entries by company
    sectionHeader(titles.experience)
    const expGroups: { company: string; location: string; roles: { title: string; dates: string; bullets: string[] }[] }[] = []
    for (const exp of s.experience) {
      const last = expGroups[expGroups.length - 1]
      if (last && last.company === exp.company) {
        last.roles.push({ title: exp.title, dates: exp.dates, bullets: exp.bullets })
      } else {
        expGroups.push({ company: exp.company, location: exp.location, roles: [{ title: exp.title, dates: exp.dates, bullets: exp.bullets }] })
      }
    }
    for (const group of expGroups) {
      twoCol(group.company, group.location, true)
      for (const role of group.roles) {
        twoCol(role.title, role.dates, false, true)
      }
      for (const role of group.roles) {
        for (const b of role.bullets) bulletLine(b)
      }
      y += 6 * ls
    }

    // Projects
    sectionHeader(titles.projects)
    for (const proj of s.projects) {
      checkBreak(14)
      doc.setFont(font, 'bold')
      doc.setFontSize(body)
      doc.text(proj.name, ml, y)
      if (proj.tech) {
        const nameWidth = doc.getTextWidth(proj.name)
        doc.setFont(font, 'normal')
        doc.text(` (${proj.tech})`, ml + nameWidth, y)
      }
      if (proj.dates) {
        doc.setFont(font, 'italic')
        doc.text(proj.dates, pageWidth - mr, y, { align: 'right' })
      }
      y += 14 * ls
      for (const b of proj.bullets) bulletLine(b)
      y += 6 * ls
    }

    return y
  }

  // Pass 1: measure with no scaling on a tall virtual page
  const measureDoc = new jsPDF({ unit: 'pt', format: [pageWidth, 10000] })
  const font = registerFont(measureDoc, lato)
  const body = fitBodyFontSize(measureDoc, font, structure, rawText, size => {
    measureDoc.setFont(font, 'normal')
    measureDoc.setFontSize(size)
    return contentWidth - bulletIndent - measureDoc.getTextWidth(bulletMarker)
  })
  const finalY = renderTo(measureDoc, font, 1, body)

  // Scale spacing to fill the page (min 0.85 — slight compression ok, max 1.4 — don't over-stretch)
  const ls = Math.max(Math.min((letterHeight - 100) / (finalY - 50), 1.4), 0.85)

  // Pass 2: render on letter page with scaled spacing
  const realDoc = new jsPDF({ unit: 'pt', format: [pageWidth, letterHeight] })
  registerFont(realDoc, lato)
  renderTo(realDoc, font, ls, body)
  realDoc.save(`${fileName}.pdf`)
}

// ─── Cover Letter PDF Export ────────────────────────────────────────────────

export function exportCoverLetterPdf(text: string, fileName: string, header?: { name: string; contact: string }): void {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const ml = 72, mr = 72
  const pageWidth = 612
  const pageHeight = 792
  const contentWidth = pageWidth - ml - mr
  let y = 64

  // Strip header lines from cover letter text to avoid duplication
  let bodyLines = text.split('\n')
  if (header) {
    let skip = 0
    for (let i = 0; i < Math.min(5, bodyLines.length); i++) {
      const l = bodyLines[i].trim()
      if (l === '' || l === header.name.trim() || header.contact.split('|').some(part => l.includes(part.trim()))) {
        skip = i + 1
      } else break
    }
    bodyLines = bodyLines.slice(skip)
  }

  // Header: centered name + contact + divider line
  if (header) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(header.name, pageWidth / 2, y, { align: 'center' })
    y += 20

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(80)
    doc.text(header.contact, pageWidth / 2, y, { align: 'center' })
    y += 16

    doc.setDrawColor(40)
    doc.setLineWidth(0.6)
    doc.line(ml, y, pageWidth - mr, y)
    y += 24
    doc.setTextColor(0)
  }

  // Body — 11pt, 1.4× line height, extra space between paragraphs
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const lineH = 16
  const paraGap = 10

  // Group into paragraphs (split on blank lines)
  const paragraphs: string[] = []
  let current = ''
  for (const line of bodyLines) {
    if (line.trim() === '') {
      if (current.trim()) { paragraphs.push(current.trim()); current = '' }
    } else {
      current += (current ? ' ' : '') + line.trim()
    }
  }
  if (current.trim()) paragraphs.push(current.trim())

  for (const para of paragraphs) {
    const wrapped = doc.splitTextToSize(para, contentWidth)
    const needed = wrapped.length * lineH + paraGap
    if (y + needed > pageHeight - 60) { doc.addPage(); y = 64 }
    for (const wl of wrapped) {
      doc.text(wl, ml, y)
      y += lineH
    }
    y += paraGap
  }

  doc.save(`${fileName}_cover_letter.pdf`)
}
