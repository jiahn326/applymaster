import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractTextFromPdf } from '../lib/parsePdf'
import { extractTextFromDocx } from '../lib/parseDocx'
import { parseResumeStructure } from '../lib/parseResumeStructure'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type UploadStatus = 'idle' | 'parsing' | 'structuring' | 'saving' | 'done' | 'error'

interface ResumeVersion {
  id: string
  created_at: string
  content: { file_name?: string; current_location?: string }
}

const STATUS_MESSAGES: Record<UploadStatus, string> = {
  idle:        '',
  parsing:     'Reading file...',
  structuring: '✨ Structuring with AI...',
  saving:      'Saving...',
  done:        '✓ Resume saved!',
  error:       'Upload failed. Try again.',
}

export default function UploadResumePage() {
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [currentLocation, setCurrentLocation] = useState('')
  const [versions, setVersions] = useState<ResumeVersion[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    supabase
      .from('resumes')
      .select('id, created_at, content')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setVersions(data as ResumeVersion[])
          if (data[0]?.content?.current_location) {
            setCurrentLocation(data[0].content.current_location)
          }
        }
      })
  }, [])

  async function handleFile(file: File) {
    const isPdf = file.name.toLowerCase().endsWith('.pdf')
    const isDocx = file.name.toLowerCase().endsWith('.docx')
    if (!isPdf && !isDocx) {
      setError('Please upload a PDF or DOCX file.')
      return
    }

    try {
      setError(null)
      setStatus('parsing')
      const text = isPdf ? await extractTextFromPdf(file) : await extractTextFromDocx(file)

      setStatus('structuring')
      const structure = await parseResumeStructure(text)

      setStatus('saving')
      const { data: inserted, error: insertError } = await supabase.from('resumes').insert({
        content: { raw_text: text, file_name: file.name, structure, current_location: currentLocation || null },
        user_id: user?.id,
      }).select('id, created_at, content').single()
      if (insertError) throw insertError

      setVersions(prev => [inserted as ResumeVersion, ...prev])
      setStatus('done')
      setTimeout(() => navigate('/'), 1200)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong.')
      setStatus('error')
    }
  }

  async function handleDeleteVersion(id: string) {
    if (versions.length === 1) {
      alert('You need at least one resume version.')
      return
    }
    if (!confirm('Delete this resume version?')) return
    await supabase.from('resumes').delete().eq('id', id)
    setVersions(prev => prev.filter(v => v.id !== id))
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const isProcessing = ['parsing', 'structuring', 'saving'].includes(status)

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-700 transition-colors">
            ←
          </button>
          <span className="text-base font-semibold text-gray-900">Upload Resume</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-16">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Master Resume</h2>
          <p className="text-gray-500 text-sm mt-1.5">
            Upload your base resume once. We'll tailor it for each job description using AI.
          </p>
        </div>

        {/* Current Location */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Current Location
          </label>
          <input
            value={currentLocation}
            onChange={e => setCurrentLocation(e.target.value)}
            placeholder="e.g. San Francisco, CA"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <p className="text-gray-400 text-xs mt-1">Used for accurate location matching in fit analysis</p>
        </div>

        {/* Drop zone */}
        <div
          onClick={() => !isProcessing && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative border-2 border-dashed rounded-2xl p-14 text-center transition-all
            ${isProcessing ? 'cursor-default' : 'cursor-pointer'}
            ${dragging
              ? 'border-gray-900 bg-gray-50'
              : status === 'done'
              ? 'border-emerald-400 bg-emerald-50'
              : status === 'error'
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
            }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={onFileChange}
            onClick={(e) => e.stopPropagation()}
          />

          {status === 'idle' && (
            <>
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-gray-500">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-gray-700 font-semibold text-sm">Drop your resume here</p>
              <p className="text-gray-400 text-xs mt-1">PDF or DOCX · or click to browse</p>
            </>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
              <p className="text-gray-600 font-medium text-sm">{STATUS_MESSAGES[status]}</p>
            </div>
          )}

          {status === 'done' && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M4 10l4.5 4.5L16 7" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-emerald-700 font-semibold text-sm">Resume saved! Redirecting...</p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-red-500 font-semibold text-sm">Upload failed</p>
              <p className="text-gray-400 text-xs">Click to try again</p>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-3 text-red-500 text-xs text-center">{error}</p>
        )}

        <p className="mt-4 text-center text-gray-400 text-xs">PDF or DOCX · Max ~10 pages</p>

        {/* Version history */}
        {versions.length > 0 && (
          <div className="mt-10">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Version History</h3>
            <div className="space-y-2">
              {versions.map((v, i) => (
                <div key={v.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${i === 0 ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                  <div className="flex items-center gap-3">
                    {i === 0 && (
                      <span className="text-xs font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-full">Current</span>
                    )}
                    <div>
                      <p className="text-sm font-medium text-gray-800">{v.content?.file_name ?? 'resume'}</p>
                      <p className="text-xs text-gray-400">{formatDate(v.created_at)}</p>
                    </div>
                  </div>
                  {i !== 0 && (
                    <button
                      onClick={() => handleDeleteVersion(v.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-xs"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
