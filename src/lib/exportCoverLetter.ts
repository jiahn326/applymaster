import { jsPDF } from 'jspdf'
import { splitLetter, contactRuns } from './letterLayout'

// Laid out like the user's Word template: US Letter, 1" margins, Arial 11pt
// (Helvetica has Arial's metrics), the name at 20pt centered over a centered
// contact line and a rule, then the letter at 1.5 line spacing with its own
// blank lines between paragraphs.
export function exportCoverLetterPdf(letter: string, fileName: string, resumeHeader?: { name: string; contact: string }): void {
  const { name, contact, body } = splitLetter(letter, resumeHeader)
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 72
  const contentWidth = pageWidth - margin * 2
  const fontSize = 11
  const lineHeight = fontSize * 1.15 * 1.5 // Word's single line for Arial ≈ 1.15em; template uses 1.5 lines

  let y = margin
  doc.setFont('helvetica', 'normal')

  if (name) {
    doc.setFontSize(20)
    y += 20 // Heading 1: 20pt before
    doc.text(name, pageWidth / 2, y, { align: 'center' })
    y += 6 + fontSize * 1.15 // 6pt after, then the contact line
  }
  doc.setFontSize(fontSize)
  if (contact) {
    if (doc.getTextWidth(contact) <= contentWidth) {
      // One centered line; links in the template's blue, underlined and clickable
      let x = (pageWidth - doc.getTextWidth(contact)) / 2
      for (const run of contactRuns(contact)) {
        const w = doc.getTextWidth(run.text)
        if (run.url) {
          doc.setTextColor('#1155cc')
          doc.textWithLink(run.text, x, y, { url: run.url })
          doc.setDrawColor('#1155cc')
          doc.setLineWidth(0.5)
          doc.line(x, y + 1.5, x + w, y + 1.5)
          doc.setTextColor('#000000')
          doc.setDrawColor('#000000')
        } else {
          doc.text(run.text, x, y)
        }
        x += w
      }
      y += fontSize * 1.15
    } else {
      const wrapped: string[] = doc.splitTextToSize(contact, contentWidth)
      wrapped.forEach(line => { doc.text(line, pageWidth / 2, y, { align: 'center' }); y += fontSize * 1.15 })
    }
  }
  if (name || contact) {
    y += 2
    doc.setLineWidth(0.75)
    doc.line(margin, y, pageWidth - margin, y)
    y += lineHeight * 1.5
  }

  for (const raw of body) {
    const wrapped: string[] = raw.trim() ? doc.splitTextToSize(raw.trim(), contentWidth) : ['']
    for (const line of wrapped) {
      if (y > pageHeight - margin) { doc.addPage(); y = margin + fontSize }
      if (line) doc.text(line, margin, y)
      y += lineHeight
    }
  }

  doc.save(`${fileName}.pdf`)
}
