import * as pdfjsLib from 'pdfjs-dist'

// Use local worker to avoid CDN issues
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Group text items by y-position (rounded) to reconstruct lines
    const lineMap = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round((item as any).transform[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push(item.str)
    }

    // Sort by y descending (top of page first in PDF coords)
    const sortedLines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, words]) => words.join(' ').trim())
      .filter(Boolean)

    pages.push(sortedLines.join('\n'))
  }

  return pages.join('\n')
}
