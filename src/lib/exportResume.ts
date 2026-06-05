import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  BorderStyle, TabStopType
} from 'docx'
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

// ─── DOCX Export ────────────────────────────────────────────────────────────

export async function exportDocx(
  structure: ResumeStructure,
  tailored: TailoredResume,
  fileName: string
): Promise<void> {
  const s = applyTailoring(structure, tailored)
  const children: Paragraph[] = []

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: s.header.name, bold: true, size: 28, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: s.header.contact, size: 20, font: 'Calibri' })],
    })
  )

  // Section helper
  function sectionHeader(title: string) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 160, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
      children: [new TextRun({ text: title, bold: true, size: 22, font: 'Calibri' })],
    })
  }

  function bullet(text: string) {
    return new Paragraph({
      indent: { left: 360, hanging: 200 },
      spacing: { after: 60 },
      children: [new TextRun({ text: `●  ${text}`, size: 20, font: 'Calibri' })],
    })
  }

  // EDUCATION
  children.push(sectionHeader('EDUCATION'))
  for (const edu of s.education) {
    children.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        spacing: { after: 40 },
        children: [
          new TextRun({ text: edu.school, bold: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: '\t', size: 20 }),
          new TextRun({ text: edu.location, bold: true, size: 20, font: 'Calibri' }),
        ],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        spacing: { after: 40 },
        children: [
          new TextRun({ text: edu.degree, italics: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: '\t', size: 20 }),
          new TextRun({ text: edu.dates, italics: true, size: 20, font: 'Calibri' }),
        ],
      })
    )
    if (edu.awards) {
      children.push(new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: 'Awards: ', bold: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: edu.awards, size: 20, font: 'Calibri' }),
        ],
      }))
    }
  }

  // SKILLS
  children.push(sectionHeader('SKILLS'))
  children.push(
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Languages: ', bold: true, size: 20, font: 'Calibri' }),
        new TextRun({ text: s.skills.languages.join(', '), size: 20, font: 'Calibri' }),
      ],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: 'Tools: ', bold: true, size: 20, font: 'Calibri' }),
        new TextRun({ text: s.skills.tools.join(', '), size: 20, font: 'Calibri' }),
      ],
    })
  )

  // EXPERIENCE
  children.push(sectionHeader('EXPERIENCE'))
  for (const exp of s.experience) {
    children.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        spacing: { after: 40 },
        children: [
          new TextRun({ text: exp.company, bold: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: '\t', size: 20 }),
          new TextRun({ text: exp.location, bold: true, size: 20, font: 'Calibri' }),
        ],
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
        spacing: { after: 60 },
        children: [
          new TextRun({ text: exp.title, italics: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: '\t', size: 20 }),
          new TextRun({ text: exp.dates, italics: true, size: 20, font: 'Calibri' }),
        ],
      })
    )
    for (const b of exp.bullets) children.push(bullet(b))
  }

  // PROJECTS
  children.push(sectionHeader('PERSONAL PROJECTS'))
  for (const proj of s.projects) {
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: proj.name, bold: true, size: 20, font: 'Calibri' }),
          new TextRun({ text: proj.tech ? ` (${proj.tech})` : '', size: 20, font: 'Calibri' }),
        ],
      })
    )
    for (const b of proj.bullets) children.push(bullet(b))
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } }
      },
      children
    }]
  })

  const blob = await Packer.toBlob(doc)
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
