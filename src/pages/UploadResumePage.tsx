import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { extractTextFromPdf } from '../lib/parsePdf'
import { extractTextFromDocx } from '../lib/parseDocx'
import { parseResumeStructure } from '../lib/parseResumeStructure'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

type UploadStatus = 'idle' | 'parsing' | 'structuring' | 'saving' | 'done' | 'error'

const STATE_ABBR: Record<string, string> = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
  Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA',
  Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
  'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN',
  Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA',
  'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
}

async function fetchCitySuggestions(query: string): Promise<string[]> {
  if (query.trim().length < 2) return []
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=us&format=json&limit=8&addressdetails=1&featuretype=city`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en-US', 'User-Agent': 'ApplyMaster/1.0' } })
  if (!res.ok) return []
  const data = await res.json()
  const seen = new Set<string>()
  const results: string[] = []
  for (const r of data) {
    if (r.type === 'county' || r.addresstype === 'county') continue
    const addr = r.address ?? {}
    const city = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb
    const stateFull = addr.state ?? ''
    const state = STATE_ABBR[stateFull] ?? stateFull
    if (!city || !state) continue
    const label = `${city}, ${state}`
    if (!seen.has(label)) { seen.add(label); results.push(label) }
  }
  return results
}

function LocationCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setSuggestions([]); setLoading(false); return }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const results = await fetchCitySuggestions(q)
      setSuggestions(results)
      setLoading(false)
    }, 300)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    onChange(v)
    setOpen(true)
    search(v)
  }

  function select(city: string) {
    setQuery(city)
    onChange(city)
    setOpen(false)
    setSuggestions([])
  }

  const showDropdown = open && (loading || suggestions.length > 0)

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={handleChange}
        onFocus={() => { setOpen(true); if (query.trim().length >= 2) search(query) }}
        placeholder="e.g. San Francisco, CA"
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
      {showDropdown && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto py-1">
          {loading ? (
            <li className="px-3 py-2 text-xs text-gray-400">Searching...</li>
          ) : suggestions.map(city => (
            <li key={city}>
              <button
                type="button"
                onMouseDown={() => select(city)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${city === value ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface ResumeVersion {
  id: string
  created_at: string
  content: { file_name?: string; current_location?: string; raw_text?: string; structure?: any }
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
  const [previewVersion, setPreviewVersion] = useState<ResumeVersion | null>(null)
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { user } = useAuth()

  useEffect(() => {
    Promise.all([
      supabase.from('resumes').select('id, created_at, content').order('created_at', { ascending: false }),
      supabase.from('user_settings').select('active_resume_id').single(),
    ]).then(([{ data: resumeData }, { data: settings }]) => {
      if (resumeData) {
        setVersions(resumeData as ResumeVersion[])
        const activeId = (settings as any)?.active_resume_id
        const active = resumeData.find((r: ResumeVersion) => r.id === activeId) ?? resumeData[0]
        if (active?.content?.current_location) {
          setCurrentLocation(active.content.current_location)
        }
        if (active) setActiveResumeId(active.id)
      } else if ((settings as any)?.active_resume_id) {
        setActiveResumeId((settings as any).active_resume_id)
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
      await handleSetActive((inserted as ResumeVersion).id)
      setStatus('done')
      setTimeout(() => navigate('/dashboard'), 1200)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong.')
      setStatus('error')
    }
  }

  async function handleSetActive(id: string) {
    setActiveResumeId(id)
    await supabase.from('user_settings').upsert(
      { user_id: user!.id, active_resume_id: id },
      { onConflict: 'user_id' }
    )
  }

  async function handleDeleteVersion(id: string) {
    if (versions.length === 1) {
      alert('You need at least one resume version.')
      return
    }
    if (!confirm('Delete this resume version?')) return
    await supabase.from('resumes').delete().eq('id', id)
    const remaining = versions.filter(v => v.id !== id)
    setVersions(remaining)
    if (activeResumeId === id && remaining.length > 0) {
      await handleSetActive(remaining[0].id)
    }
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
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-700 transition-colors">
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
          <LocationCombobox value={currentLocation} onChange={setCurrentLocation} />
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
              {versions.map((v) => {
                const isActive = v.id === activeResumeId
                return (
                  <div key={v.id} className={`flex items-center justify-between rounded-xl border px-4 py-3 ${isActive ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      {isActive && (
                        <span className="shrink-0 text-xs font-semibold bg-gray-900 text-white px-2 py-0.5 rounded-full">Active</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{v.content?.file_name ?? 'resume'}</p>
                        <p className="text-xs text-gray-400">{formatDate(v.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {!isActive && (
                        <button
                          onClick={() => handleSetActive(v.id)}
                          className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
                        >
                          Set as active
                        </button>
                      )}
                      <button
                        onClick={() => setPreviewVersion(v)}
                        className="text-xs text-gray-500 hover:text-gray-900 font-medium transition-colors"
                      >
                        View
                      </button>
                      {versions.length > 1 && !isActive && (
                        <button
                          onClick={() => handleDeleteVersion(v.id)}
                          className="text-xs text-gray-300 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* Preview modal */}
      {previewVersion && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setPreviewVersion(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="font-semibold text-gray-900 text-sm">{previewVersion.content?.file_name ?? 'resume'}</p>
                <p className="text-xs text-gray-400">{formatDate(previewVersion.created_at)}</p>
              </div>
              <button onClick={() => setPreviewVersion(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {previewVersion.content?.raw_text ? (
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{previewVersion.content.raw_text}</pre>
              ) : (
                <p className="text-sm text-gray-400">No preview available.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
