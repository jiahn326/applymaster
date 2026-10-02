// Splits a cover letter into the letterhead (name + contact line) and the rest,
// so the PDF can set the letterhead apart like the user's Word template.

export interface LetterParts {
  name: string
  contact: string
  body: string[] // lines after the letterhead; '' is a blank line
}

const looksLikeContact = (line: string) => /@|\||\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}|linkedin\.|github\./i.test(line)
const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase()

// The letter usually starts with the name and contact line (the template's
// [NAME] / [CONTACT]). If it doesn't, the resume's header is used instead.
export function splitLetter(letter: string, resumeHeader?: { name: string; contact: string }): LetterParts {
  const lines = letter.replace(/\r/g, '').split('\n').map(l => l.trimEnd())
  let i = lines.findIndex(l => l.trim())
  if (i < 0) return { name: resumeHeader?.name ?? '', contact: resumeHeader?.contact ?? '', body: [] }

  let name = resumeHeader?.name ?? ''
  let contact = resumeHeader?.contact ?? ''
  const first = lines[i].trim()
  const second = lines[i + 1]?.trim() ?? ''
  const startsWithName = (resumeHeader && same(first, resumeHeader.name))
    || (first.length <= 60 && !/[.,:;!?]$/.test(first) && looksLikeContact(second))
  if (startsWithName) {
    name = first
    i++
    if (second && looksLikeContact(second)) { contact = second; i++ }
  }

  const body = lines.slice(i)
  while (body.length && !body[0].trim()) body.shift()
  while (body.length && !body[body.length - 1].trim()) body.pop()
  return { name, contact, body }
}

// The contact line as text runs, with emails and web addresses carrying a link
// (the template shows them as blue underlined links)
export function contactRuns(contact: string): { text: string; url?: string }[] {
  return contact.split(/(\s*[|•·]\s*)/).filter(Boolean).map(text => {
    const t = text.trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { text, url: `mailto:${t}` }
    if (/^(https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t) && !/^\d/.test(t)) {
      return { text, url: /^https?:\/\//i.test(t) ? t : `https://${t}` }
    }
    return { text }
  })
}
