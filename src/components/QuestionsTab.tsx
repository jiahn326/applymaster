import { useState } from 'react'
import { api } from '../lib/api'
import { errorMessage } from '../lib/records'
import { useAbortable } from '../hooks/useAbortable'
import { useSlowFlag } from '../hooks/useSlowFlag'
import {
  LENGTH_LABELS, whyQuestion, newAnswer, updateAnswer, parseMaxChars, isOverLimit,
  type ApplicationAnswer, type AnswerLength,
} from '../lib/answers'

interface Props {
  company: string
  role: string
  jobDescription: string | null
  answers: ApplicationAnswer[]
  // The resume actually being sent (tailored, undone changes excluded)
  resumeText?: string
  // Takes an updater so answers finishing late apply to the latest list
  onChange: (update: (prev: ApplicationAnswer[]) => ApplicationAnswer[]) => void
  onAddJobDescription: () => void
}

const LENGTHS: AnswerLength[] = ['short', 'medium', 'long']

export default function QuestionsTab({ company, role, jobDescription, answers, resumeText, onChange, onAddJobDescription }: Props) {
  const job = useAbortable()
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const slow = useSlowFlag(generatingId !== null)
  const [question, setQuestion] = useState('')
  const [length, setLength] = useState<AnswerLength>('medium')
  const [limit, setLimit] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const hasWhy = answers.some(a => a.question.trim().toLowerCase() === whyQuestion(company).toLowerCase())

  async function generate(entry: ApplicationAnswer) {
    if (!jobDescription) return
    const signal = job.start()
    setGeneratingId(entry.id)
    try {
      const text = await api.answerQuestion(company, role, jobDescription, entry.question, resumeText, entry.length, entry.maxChars, signal)
      if (signal.aborted) return
      onChange(prev => updateAnswer(prev, entry.id, { answer: text.trim() }))
    } catch (err) {
      if (!signal.aborted) alert('Could not write the answer: ' + errorMessage(err))
    } finally {
      if (job.isCurrent(signal)) setGeneratingId(null)
    }
  }

  function add(text: string) {
    if (!text.trim()) return
    const entry = newAnswer(text, length, parseMaxChars(limit))
    onChange(prev => [...prev, entry])
    setQuestion('')
    generate(entry)
  }

  function remove(id: string) {
    if (!confirm('Delete this question and its answer?')) return
    if (generatingId === id) job.cancel()
    onChange(prev => prev.filter(a => a.id !== id))
  }

  function saveEdit(id: string) {
    onChange(prev => updateAnswer(prev, id, { answer: editValue.trim() }))
    setEditingId(null)
  }

  async function copy(a: ApplicationAnswer) {
    await navigator.clipboard.writeText(a.answer)
    setCopiedId(a.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  if (!jobDescription) {
    return (
      <button onClick={onAddJobDescription} className="block mx-auto text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2">
        Add a job description to answer application questions
      </button>
    )
  }

  return (
    <div className="space-y-4">
      {answers.map(a => {
        const busy = generatingId === a.id
        const over = isOverLimit(a)
        return (
          <div key={a.id} className="border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900">{a.question}</p>
              <button onClick={() => remove(a.id)} aria-label="Delete question" className="shrink-0 text-gray-300 hover:text-red-400 text-sm leading-none">×</button>
            </div>

            {busy && !a.answer ? (
              <div className="flex items-center gap-3 py-2">
                <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Writing your answer…</p>
                {slow && <p className="text-amber-500 text-xs">Taking longer than usual</p>}
                <button onClick={() => { job.cancel(); setGeneratingId(null) }} className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-900">Cancel</button>
              </div>
            ) : editingId === a.id ? (
              <div className="space-y-2">
                <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y h-40" />
                <div className="flex items-center gap-2">
                  <button onClick={() => saveEdit(a.id)} className="text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700 px-3 py-1.5 rounded-lg">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5">Cancel</button>
                  <span className={`ml-auto text-xs ${a.maxChars !== null && editValue.trim().length > a.maxChars ? 'text-red-500 font-semibold' : 'text-gray-400'}`}>
                    {editValue.trim().length}{a.maxChars !== null ? ` / ${a.maxChars}` : ''} chars
                  </span>
                </div>
              </div>
            ) : a.answer ? (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{a.answer}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No answer yet.</p>
            )}

            {editingId !== a.id && (
              <div className="flex flex-wrap items-center gap-2">
                {a.answer && (
                  <>
                    <button onClick={() => copy(a)} className="text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg">
                      {copiedId === a.id ? <span className="text-emerald-600">✓ Copied</span> : 'Copy'}
                    </button>
                    <button onClick={() => { setEditValue(a.answer); setEditingId(a.id) }} className="text-xs font-medium text-gray-500 hover:text-gray-900 px-2 py-1.5">Edit</button>
                  </>
                )}
                <select value={a.length} onChange={e => onChange(prev => updateAnswer(prev, a.id, { length: e.target.value as AnswerLength }))}
                  aria-label="Answer length" className="border border-gray-200 rounded-md pl-2 pr-6 py-1 text-xs bg-white text-gray-600">
                  {LENGTHS.map(l => <option key={l} value={l}>{LENGTH_LABELS[l]}</option>)}
                </select>
                <button onClick={() => generate(a)} disabled={generatingId !== null}
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 px-2 py-1.5 disabled:opacity-40">
                  {busy ? '✨ Writing…' : a.answer ? '↺ Regenerate' : '✨ Generate'}
                </button>
                {busy && a.answer && (
                  <button onClick={() => { job.cancel(); setGeneratingId(null) }} className="text-xs font-medium text-gray-500 hover:text-gray-900 px-2 py-1.5">Cancel</button>
                )}
                {a.answer && (
                  <span className={`ml-auto text-xs ${over ? 'text-red-500 font-semibold' : 'text-gray-400'}`}
                    title={over ? 'Over the limit — shorten it or regenerate' : undefined}>
                    {a.answer.length}{a.maxChars !== null ? ` / ${a.maxChars}` : ''} chars
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add a question */}
      <div className="border border-dashed border-gray-300 rounded-xl p-4 space-y-3">
        {!hasWhy && (
          <button onClick={() => add(whyQuestion(company))} disabled={generatingId !== null}
            className="text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 hover:bg-gray-100 px-3 py-1.5 rounded-full disabled:opacity-40">
            + {whyQuestion(company)}
          </button>
        )}
        <textarea value={question} onChange={e => setQuestion(e.target.value)}
          placeholder="Paste a question from the application, e.g. “What part of this role energizes you most, and why?”"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-900 resize-y h-20" />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1">
            {LENGTHS.map(l => (
              <button key={l} onClick={() => setLength(l)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                  length === l ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}>
                {LENGTH_LABELS[l]}
              </button>
            ))}
          </div>
          <input value={limit} onChange={e => setLimit(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric"
            placeholder="Char limit (optional)" aria-label="Character limit"
            className="w-36 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900" />
          <button onClick={() => add(question)} disabled={!question.trim() || generatingId !== null}
            className="ml-auto text-xs font-semibold bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300 text-white px-3 py-1.5 rounded-lg">
            ✨ Add & answer
          </button>
        </div>
      </div>
    </div>
  )
}
