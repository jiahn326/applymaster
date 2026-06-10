import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import type { TailoredResume } from './tailorResume'
import type { ResumeStructure } from './parseResumeStructure'

// Apply accepted diffs and skill overrides to the structure
function applyTailoring(structure: ResumeStructure, tailored: TailoredResume): ResumeStructure {
  const result: ResumeStructure = JSON.parse(JSON.stringify(structure))

  // Apply skill overrides
  result.skills.languages = tailored.tailoredSkills.languages
  result.skills.tools = tailored.tailoredSkills.tools

  // Apply accepted bullet rewrites
  for (const diff of tailored.diffs) {
    if (!diff.accepted) continue

    // Search experience
    for (const exp of result.experience) {
      if (exp.company === diff.section || exp.title === diff.section) {
        if (exp.bullets[diff.index] !== undefined) {
          exp.bullets[diff.index] = diff.tailored
        }
      }
    }

    // Search projects
    for (const proj of result.projects) {
      if (proj.name === diff.section || proj.name.startsWith(diff.section)) {
        if (proj.bullets[diff.index] !== undefined) {
          proj.bullets[diff.index] = diff.tailored
        }
      }
    }
  }

  return result
}

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
  return p(r(title, { bold: true, sz: 22 }), { center: true, spBefore: 160, spAfter: 80, border: true })
}

function bullet(text: string) {
  return p(r(`-  ${text}`, { sz: 20 }), { spAfter: 60, indent: true })
}

export async function exportDocx(
  structure: ResumeStructure,
  tailored: TailoredResume,
  fileName: string
): Promise<void> {
  const s = applyTailoring(structure, tailored)
  const paras: string[] = []

  // Header
  paras.push(p(r(s.header.name, { bold: true, sz: 28 }), { center: true, spAfter: 40 }))
  paras.push(p(r(s.header.contact, { sz: 20 }), { center: true, spAfter: 160 }))

  // Education
  paras.push(sectionHeader('EDUCATION'))
  for (const edu of s.education) {
    paras.push(twoColPara(edu.school, edu.location, true))
    paras.push(twoColPara(edu.degree, edu.dates, false, true))
    if (edu.awards) paras.push(p(r('Awards: ', { bold: true, sz: 20 }) + r(edu.awards, { sz: 20 }), { spAfter: 40 }))
  }

  // Skills
  paras.push(sectionHeader('SKILLS'))
  paras.push(p(r('Languages: ', { bold: true, sz: 20 }) + r(s.skills.languages.join(', '), { sz: 20 }), { spAfter: 60 }))
  paras.push(p(r('Tools: ', { bold: true, sz: 20 }) + r(s.skills.tools.join(', '), { sz: 20 }), { spAfter: 60 }))

  // Experience
  paras.push(sectionHeader('EXPERIENCE'))
  for (const exp of s.experience) {
    paras.push(twoColPara(exp.company, exp.location, true))
    paras.push(twoColPara(exp.title, exp.dates, false, true))
    for (const b of exp.bullets) paras.push(bullet(b))
    paras.push(p('', { spAfter: 40 }))
  }

  // Projects
  paras.push(sectionHeader('PERSONAL PROJECTS'))
  for (const proj of s.projects) {
    paras.push(p(
      r(proj.name, { bold: true, sz: 20 }) + (proj.tech ? r(` (${proj.tech})`, { sz: 20 }) : ''),
      { spAfter: 40 }
    ))
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

export function exportPdf(
  structure: ResumeStructure,
  tailored: TailoredResume,
  fileName: string
): void {
  const s = applyTailoring(structure, tailored)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const ml = 50, mr = 50
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - ml - mr
  let y = 50

  function checkBreak(needed: number) {
    if (y + needed > pageHeight - 40) { doc.addPage(); y = 50 }
  }

  function sectionHeader(title: string) {
    checkBreak(24)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(title, pageWidth / 2, y, { align: 'center' })
    y += 4
    doc.setLineWidth(0.5)
    doc.line(ml, y, pageWidth - mr, y)
    y += 10
  }

  function twoCol(left: string, right: string, bold = false, italic = false) {
    checkBreak(16)
    doc.setFont('helvetica', bold ? 'bold' : italic ? 'italic' : 'normal')
    doc.setFontSize(10)
    doc.text(left, ml, y)
    doc.text(right, pageWidth - mr, y, { align: 'right' })
    y += 14
  }

  function boldLabel(label: string, value: string) {
    checkBreak(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    const labelWidth = doc.getTextWidth(label)
    doc.text(label, ml, y)
    doc.setFont('helvetica', 'normal')
    const wrapped = doc.splitTextToSize(value, contentWidth - labelWidth)
    doc.text(wrapped[0], ml + labelWidth, y)
    if (wrapped.length > 1) {
      y += 13
      doc.text(wrapped.slice(1).join(' '), ml + labelWidth, y)
    }
    y += 14
  }

  function bulletLine(text: string) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    const wrapped = doc.splitTextToSize(`•  ${text}`, contentWidth - 15)
    checkBreak(wrapped.length * 13)
    doc.text(wrapped, ml + 10, y)
    y += wrapped.length * 13
  }

  // Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(s.header.name, pageWidth / 2, y, { align: 'center' })
  y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(s.header.contact, pageWidth / 2, y, { align: 'center' })
  y += 20

  // Education
  sectionHeader('EDUCATION')
  for (const edu of s.education) {
    twoCol(edu.school, edu.location, true)
    twoCol(edu.degree, edu.dates, false, true)
    if (edu.awards) boldLabel('Awards: ', edu.awards)
  }

  // Skills
  sectionHeader('SKILLS')
  boldLabel('Languages: ', s.skills.languages.join(', '))
  boldLabel('Tools: ', s.skills.tools.join(', '))

  // Experience
  sectionHeader('EXPERIENCE')
  for (const exp of s.experience) {
    twoCol(exp.company, exp.location, true)
    twoCol(exp.title, exp.dates, false, true)
    for (const b of exp.bullets) bulletLine(b)
    y += 4
  }

  // Projects
  sectionHeader('PERSONAL PROJECTS')
  for (const proj of s.projects) {
    checkBreak(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(proj.name, ml, y)
    if (proj.tech) {
      const nameWidth = doc.getTextWidth(proj.name)
      doc.setFont('helvetica', 'normal')
      doc.text(` (${proj.tech})`, ml + nameWidth, y)
    }
    y += 14
    for (const b of proj.bullets) bulletLine(b)
    y += 4
  }

  doc.save(`${fileName}.pdf`)
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
