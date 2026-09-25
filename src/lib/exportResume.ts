import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import type { TailoredResume } from './tailorResume'
import type { ResumeStructure } from './parseResumeStructure'
import { applyTailoring, skillGroups, sectionTitle } from './resumeUtils'

// ─── DOCX Export (minimal OOXML, Google Docs compatible) ────────────────────

function esc(t: string) {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function p(content: string, opts: { center?: boolean; spBefore?: number; spAfter?: number; indent?: boolean; border?: boolean } = {}) {
  const pPr = [
    opts.center ? '<w:jc w:val="center"/>' : '',
    (opts.spBefore || opts.spAfter) ? `<w:spacing w:before="${opts.spBefore ?? 0}" w:after="${opts.spAfter ?? 0}"/>` : '',
    opts.indent ? '<w:ind w:left="360" w:hanging="200"/>' : '',
    opts.border ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>' : '',
  ].join('')
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${content}</w:p>`
}

function r(text: string, opts: { bold?: boolean; italic?: boolean; sz?: number } = {}) {
  const rPr = [
    opts.bold ? '<w:b/>' : '',
    opts.italic ? '<w:i/>' : '',
    opts.sz ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : '',
  ].join('')
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function twoColPara(left: string, right: string, bold = false, italic = false) {
  const rPr = [bold ? '<w:b/>' : '', italic ? '<w:i/>' : ''].join('')
  const rPrTag = rPr ? `<w:rPr>${rPr}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>` : `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
  return `<w:p>
    <w:pPr><w:spacing w:before="0" w:after="40"/><w:tabs><w:tab w:val="right" w:pos="9360"/></w:tabs></w:pPr>
    <w:r>${rPrTag}<w:t xml:space="preserve">${esc(left)}</w:t></w:r>
    <w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:tab/></w:r>
    <w:r>${rPrTag}<w:t xml:space="preserve">${esc(right)}</w:t></w:r>
  </w:p>`
}

function sectionHeader(title: string) {
  return p(r(title, { bold: true, sz: 22 }), { spBefore: 160, spAfter: 80, border: true })
}

function bullet(text: string) {
  return p(r(`-  ${text}`, { sz: 20 }), { spAfter: 60, indent: true })
}

export async function exportDocx(
  structure: ResumeStructure,
  tailored: TailoredResume,
  fileName: string,
  rawText?: string
): Promise<void> {
  const s = applyTailoring(structure, tailored)
  const paras: string[] = []

  // Header
  paras.push(p(r(s.header.name, { bold: true, sz: 28 }), { center: true, spAfter: 40 }))
  paras.push(p(r(s.header.contact, { sz: 20 }), { center: true, spAfter: 160 }))

  // Education
  paras.push(sectionHeader(sectionTitle(s, 'education', rawText)))
  for (const edu of s.education) {
    paras.push(twoColPara(edu.school, edu.location, true))
    paras.push(twoColPara(edu.degree, edu.dates, false, true))
    if (edu.awards) paras.push(p(r('Awards: ', { bold: true, sz: 20 }) + r(edu.awards, { sz: 20 }), { spAfter: 40 }))
  }

  // Skills
  paras.push(sectionHeader(sectionTitle(s, 'skills', rawText)))
  for (const g of skillGroups(s)) {
    paras.push(p(r(`${g.label}: `, { bold: true, sz: 20 }) + r(g.items.join(', '), { sz: 20 }), { spAfter: 60 }))
  }

  // Experience
  paras.push(sectionHeader(sectionTitle(s, 'experience', rawText)))
  for (const exp of s.experience) {
    paras.push(twoColPara(exp.company, exp.location, true))
    paras.push(twoColPara(exp.title, exp.dates, false, true))
    for (const b of exp.bullets) paras.push(bullet(b))
    paras.push(p('', { spAfter: 40 }))
  }

  // Projects
  paras.push(sectionHeader(sectionTitle(s, 'projects', rawText)))
  for (const proj of s.projects) {
    if (proj.dates) {
      paras.push(twoColPara(
        proj.name + (proj.tech ? ` (${proj.tech})` : ''),
        proj.dates,
        true
      ))
    } else {
      paras.push(p(
        r(proj.name, { bold: true, sz: 20 }) + (proj.tech ? r(` (${proj.tech})`, { sz: 20 }) : ''),
        { spAfter: 40 }
      ))
    }
    for (const b of proj.bullets) paras.push(bullet(b))
    paras.push(p('', { spAfter: 40 }))
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paras.join('\n    ')}
    <w:sectPr>
      <w:pgMar w:top="720" w:right="900" w:bottom="720" w:left="900"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', rels)
  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', wordRels)

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  downloadBlob(blob, `${fileName}.docx`)
}

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

    function boldLabel(label: string, value: string) {
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
      if (edu.awards) boldLabel('Awards: ', edu.awards)
    }
    y += 4 * ls

    // Skills
    sectionHeader(titles.skills)
    for (const g of skillGroups(s)) boldLabel(`${g.label}: `, g.items.join(', '))
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

// ─── Cover Letter DOCX Export ───────────────────────────────────────────────

export async function exportCoverLetterDocx(text: string, fileName: string, header?: { name: string; contact: string }): Promise<void> {
  const paras: string[] = []

  // Strip header lines from text
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

  // Header
  if (header) {
    paras.push(p(r(header.name, { bold: true, sz: 28 }), { center: true, spAfter: 40 }))
    paras.push(p(r(header.contact, { sz: 20 }), { center: true, spAfter: 0 }))
    // Divider line
    paras.push(p(r('_'.repeat(80), { sz: 20 }), { spBefore: 60, spAfter: 160 }))
  }

  // Body — group into paragraphs
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
    paras.push(p(r(para, { sz: 22 }), { spAfter: 160 }))
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paras.join('\n    ')}
    <w:sectPr>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/>
    </w:sectPr>
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const zip = new JSZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', rels)
  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  downloadBlob(blob, `${fileName}_cover_letter.docx`)
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

// ─── Google Docs Export ─────────────────────────────────────────────────────

export function exportGoogleDocs(
  structure: ResumeStructure,
  tailored: TailoredResume,
  rawText?: string
): void {
  const s = applyTailoring(structure, tailored)
  const e = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const rows: string[] = []

  const secHeader = (title: string) =>
    `<h2 style="font-size:11pt;border-bottom:1px solid #000;margin:12pt 0 4pt;">${e(title)}</h2>`

  const twoCol = (left: string, right: string, bold = false, italic = false) => {
    const tag = bold ? 'strong' : italic ? 'em' : 'span'
    return `<p style="margin:1pt 0;font-size:10pt;"><${tag}>${e(left)}</${tag}><span style="float:right"><${tag}>${e(right)}</${tag}></span></p>`
  }

  rows.push(`<h1 style="text-align:center;font-size:16pt;margin:0 0 2pt;">${e(s.header.name)}</h1>`)
  rows.push(`<p style="text-align:center;font-size:10pt;margin:0 0 10pt;">${e(s.header.contact)}</p>`)

  rows.push(secHeader(sectionTitle(s, 'education', rawText)))
  for (const edu of s.education) {
    rows.push(twoCol(edu.school, edu.location, true))
    rows.push(twoCol(edu.degree, edu.dates, false, true))
    if (edu.awards) rows.push(`<p style="font-size:10pt;margin:1pt 0;"><strong>Awards: </strong>${e(edu.awards)}</p>`)
  }

  rows.push(secHeader(sectionTitle(s, 'skills', rawText)))
  for (const g of skillGroups(s)) {
    rows.push(`<p style="font-size:10pt;margin:1pt 0;"><strong>${e(g.label)}: </strong>${e(g.items.join(', '))}</p>`)
  }

  rows.push(secHeader(sectionTitle(s, 'experience', rawText)))
  for (const exp of s.experience) {
    rows.push(twoCol(exp.company, exp.location, true))
    rows.push(twoCol(exp.title, exp.dates, false, true))
    for (const b of exp.bullets) rows.push(`<p style="font-size:10pt;margin:1pt 0 1pt 18pt;">-&nbsp; ${e(b)}</p>`)
    rows.push('<p style="margin:6pt 0;"></p>')
  }

  rows.push(secHeader(sectionTitle(s, 'projects', rawText)))
  for (const proj of s.projects) {
    rows.push(`<p style="font-size:10pt;margin:2pt 0;"><strong>${e(proj.name)}</strong>${proj.tech ? ` <span style="font-size:9pt;">(${e(proj.tech)})</span>` : ''}</p>`)
    for (const b of proj.bullets) rows.push(`<p style="font-size:10pt;margin:1pt 0 1pt 18pt;">-&nbsp; ${e(b)}</p>`)
    rows.push('<p style="margin:6pt 0;"></p>')
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 40px;}p,h1,h2{margin:0;}
</style></head><body>${rows.join('\n')}</body></html>`

  const blob = new Blob([html], { type: 'text/html' })
  downloadBlob(blob, 'resume.html')
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
