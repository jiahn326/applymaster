export type DiffPart = { text: string; type: 'same' | 'added' | 'removed' }

// Word-level diff (LCS over whitespace-separated words). Bullets are short, so the
// O(n·m) table is trivial. Consecutive words of the same type are merged.
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean)
  const b = after.split(/\s+/).filter(Boolean)
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const parts: DiffPart[] = []
  const push = (text: string, type: DiffPart['type']) => {
    const last = parts[parts.length - 1]
    if (last?.type === type) last.text += ' ' + text
    else parts.push({ text, type })
  }
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { push(a[i], 'same'); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push(a[i++], 'removed')
    else push(b[j++], 'added')
  }
  while (i < a.length) push(a[i++], 'removed')
  while (j < b.length) push(b[j++], 'added')
  return parts
}
