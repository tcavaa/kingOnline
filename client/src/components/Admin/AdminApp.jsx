import { useState, useEffect, useCallback, useRef } from 'react'
import { Volume2, Trash2, Upload, Play, Square, Pencil, Check, X, LogOut } from 'lucide-react'
import { adminApi, API_BASE } from '../../lib/api'
import { voicePlayer } from '../../lib/voicePlayer'

// Where the passcode lives between renders. sessionStorage, not local: the
// latch should lift when the tab closes.
const PASS_KEY = 'king.admin.pass'

const readPass = () => {
  try { return sessionStorage.getItem(PASS_KEY) || '' } catch { return '' }
}
const writePass = (v) => {
  try {
    if (v) sessionStorage.setItem(PASS_KEY, v)
    else sessionStorage.removeItem(PASS_KEY)
  } catch { /* private mode — the code just won't survive a refresh */ }
}

// Same ceiling the server enforces, checked here so a too-big file fails
// instantly instead of after a multi-megabyte upload.
const MAX_BYTES = 2 * 1024 * 1024

/** File → `data:audio/...;base64,...`, the shape the API expects. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('ფაილის წაკითხვა ვერ მოხერხდა'))
    reader.readAsDataURL(file)
  })
}

/* ─── passcode gate ───────────────────────────────────────────────────── */

function PasscodeGate({ onUnlock }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const ok = await adminApi.login(code)
      if (!ok) { setError('არასწორი კოდი'); setCode(''); return }
      writePass(code)
      onUnlock(code)
    } catch (err) {
      setError(err.message || 'შეცდომა')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="saloon-bg flex flex-col items-center justify-center px-4 py-8 min-h-screen">
      <form onSubmit={submit} className="western-panel p-6 w-full max-w-xs text-center">
        <h1 className="text-2xl font-western mb-1" style={{ color: '#8e2b23' }}>ადმინი</h1>
        <p className="text-xs font-typewriter mb-4" style={{ color: 'rgba(59,35,20,0.6)' }}>
          შეიყვანე კოდი
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); setError('') }}
          className="w-full text-center text-2xl tracking-[0.5em] font-mono px-3 py-3 rounded-lg mb-3"
          style={{
            background: 'rgba(255,255,255,0.6)',
            border: '1px solid rgba(122,83,44,0.45)',
            color: '#3b2314',
          }}
        />
        {error && (
          <div className="text-xs font-typewriter mb-3" style={{ color: '#a5372b' }}>{error}</div>
        )}
        <button type="submit" disabled={busy || !code}
                className="western-pill w-full px-4 py-2.5 text-sm font-bold disabled:opacity-40"
                style={{ color: '#3b2314' }}>
          {busy ? 'მოწმდება…' : 'შესვლა'}
        </button>
      </form>
    </div>
  )
}

/* ─── one row in the catalogue ────────────────────────────────────────── */

function SoundRow({ sound, passcode, onChanged, onError }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(sound.label)
  const [glyph, setGlyph] = useState(sound.glyph)
  const [color, setColor] = useState(sound.color)
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)

  // The admin API returns raw catalogue urls (the registry's resolveUrl only
  // runs on the player-facing copy), so apply the same page-origin-vs-API
  // fix-up here: in dev the page is on :5173 while uploaded clips are served
  // from :3001. No-op in production, where API_BASE is ''.
  const url = sound.url.startsWith('/api/') ? `${API_BASE}${sound.url}` : sound.url

  useEffect(() => voicePlayer.subscribe((u) => setPlaying(u === url)), [url])

  const save = async () => {
    setBusy(true)
    try {
      await adminApi.updateSound(passcode, sound.id, { label, glyph, color })
      setEditing(false)
      onChanged()
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  const remove = async () => {
    if (!window.confirm(`წავშალოთ „${sound.label}"?`)) return
    setBusy(true)
    try {
      if (playing) voicePlayer.stop()
      await adminApi.deleteSound(passcode, sound.id)
      onChanged()
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl"
         style={{ background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(122,83,44,0.25)' }}>
      <span className="flex items-center justify-center rounded-full font-bold shrink-0"
            style={{
              width: 38, height: 38, background: '#f8efdd',
              border: `2px solid ${sound.color}`, color: '#3b2314', fontSize: 16,
            }}>
        {sound.glyph}
      </span>

      {editing ? (
        <div className="flex-1 flex flex-wrap items-center gap-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)}
                 className="flex-1 min-w-[8rem] px-2 py-1.5 rounded text-sm"
                 style={{ background: '#fff', border: '1px solid rgba(122,83,44,0.4)', color: '#3b2314' }} />
          <input value={glyph} onChange={(e) => setGlyph(e.target.value)} maxLength={2}
                 title="ნიშანი"
                 className="w-12 px-2 py-1.5 rounded text-sm text-center"
                 style={{ background: '#fff', border: '1px solid rgba(122,83,44,0.4)', color: '#3b2314' }} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                 title="ფერი"
                 className="w-10 h-8 rounded cursor-pointer"
                 style={{ border: '1px solid rgba(122,83,44,0.4)', background: 'transparent' }} />
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold truncate" style={{ color: '#3b2314' }}>{sound.label}</div>
          <div className="text-[10px] font-mono truncate" style={{ color: 'rgba(59,35,20,0.45)' }}>
            {sound.id}{sound.source === 'builtin' ? ' · ჩაშენებული' : ''}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => voicePlayer.toggle(url)} title="მოსმენა"
                className="p-2 rounded-lg transition-opacity hover:opacity-70"
                style={{ color: '#4c7a2f' }}>
          {playing ? <Square size={16} /> : <Play size={16} />}
        </button>
        {editing ? (
          <>
            <button onClick={save} disabled={busy || !label.trim()} title="შენახვა"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-30"
                    style={{ color: '#4c7a2f' }}>
              <Check size={16} />
            </button>
            <button onClick={() => {
                      setEditing(false)
                      setLabel(sound.label); setGlyph(sound.glyph); setColor(sound.color)
                    }} title="გაუქმება"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70"
                    style={{ color: 'rgba(59,35,20,0.5)' }}>
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setEditing(true)} title="რედაქტირება"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70"
                    style={{ color: '#31536b' }}>
              <Pencil size={16} />
            </button>
            <button onClick={remove} disabled={busy} title="წაშლა"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-30"
                    style={{ color: '#a5372b' }}>
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─── upload form ─────────────────────────────────────────────────────── */

function UploadForm({ passcode, onAdded, onError }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const pick = (e) => {
    const f = e.target.files?.[0] || null
    if (f && f.size > MAX_BYTES) {
      onError(`ფაილი ძალიან დიდია (მაქს. ${Math.round(MAX_BYTES / 1024)} KB)`)
      e.target.value = ''
      return
    }
    setFile(f)
    // Empty name → seed it from the filename so the common case is one field.
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ''))
  }

  const submit = async (e) => {
    e.preventDefault()
    if (busy || !file || !name.trim()) return
    setBusy(true)
    try {
      const audio = await fileToDataUrl(file)
      await adminApi.createSound(passcode, { label: name.trim(), audio })
      setName(''); setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      onAdded()
    } catch (err) { onError(err.message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="western-panel p-4 mb-5">
      <h2 className="text-sm font-western uppercase tracking-wider mb-3" style={{ color: '#3b2314' }}>
        ახალი ხმა
      </h2>
      <div className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="სახელი (მაგ. ბედი)"
          maxLength={64}
          className="px-3 py-2.5 rounded-lg text-sm"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(122,83,44,0.4)', color: '#3b2314' }}
        />
        <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
               style={{ background: 'rgba(255,255,255,0.4)', border: '1px dashed rgba(122,83,44,0.5)' }}>
          <Upload size={18} style={{ color: '#8e2b23' }} />
          <span className="text-sm font-typewriter truncate" style={{ color: file ? '#3b2314' : 'rgba(59,35,20,0.5)' }}>
            {file ? file.name : 'აირჩიე აუდიო ფაილი (mp3, ogg, wav, m4a)'}
          </span>
          <input ref={fileRef} type="file" accept="audio/*" onChange={pick} className="hidden" />
        </label>
        <button type="submit" disabled={busy || !file || !name.trim()}
                className="western-pill px-4 py-2.5 text-sm font-bold disabled:opacity-40"
                style={{ color: '#3b2314' }}>
          {busy ? 'იტვირთება…' : 'დამატება'}
        </button>
      </div>
      <p className="text-[10px] font-typewriter mt-3" style={{ color: 'rgba(59,35,20,0.45)' }}>
        ნიშანი და ფერი ავტომატურად შეირჩევა — დამატების შემდეგ შეგიძლია შეცვალო.
      </p>
    </form>
  )
}

/* ─── page ────────────────────────────────────────────────────────────── */

export default function AdminApp() {
  const [passcode, setPasscode] = useState(readPass)
  const [sounds, setSounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async (code) => {
    const pass = code || passcode
    if (!pass) return
    setLoading(true)
    try {
      setSounds(await adminApi.listSounds(pass))
      setError('')
    } catch (err) {
      // A stale sessionStorage code (server passcode changed) lands here —
      // drop it and fall back to the gate rather than showing an empty list.
      if ((err.message || '').includes('HTTP 401')) {
        writePass('')
        setPasscode('')
        return
      }
      setError(err.message)
    } finally { setLoading(false) }
  }, [passcode])

  useEffect(() => { if (passcode) reload(passcode) }, [passcode, reload])

  // Stop any preview when leaving the page — the player lives outside React.
  useEffect(() => () => voicePlayer.stop(), [])

  if (!passcode) {
    return <PasscodeGate onUnlock={(code) => setPasscode(code)} />
  }

  return (
    <div className="saloon-bg min-h-screen px-4 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-3xl font-western inline-flex items-center gap-2" style={{ color: '#8e2b23' }}>
            <Volume2 size={26} /> ხმები
          </h1>
          <div className="flex items-center gap-2">
            <a href="/" className="text-xs font-typewriter underline" style={{ color: 'rgba(59,35,20,0.6)' }}>
              მთავარი
            </a>
            <button onClick={() => { writePass(''); setPasscode('') }}
                    title="გასვლა"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70"
                    style={{ color: 'rgba(59,35,20,0.6)' }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>

        <UploadForm passcode={passcode} onAdded={() => reload()} onError={setError} />

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm font-typewriter"
               style={{ background: 'rgba(165,55,43,0.12)', border: '1px solid rgba(165,55,43,0.4)', color: '#a5372b' }}>
            {error}
          </div>
        )}

        <div className="western-panel p-4">
          <h2 className="text-sm font-western uppercase tracking-wider mb-3" style={{ color: '#3b2314' }}>
            კატალოგი {sounds.length > 0 && `(${sounds.length})`}
          </h2>
          {loading ? (
            <div className="text-sm font-typewriter py-3 text-center" style={{ color: 'rgba(59,35,20,0.55)' }}>
              იტვირთება…
            </div>
          ) : sounds.length === 0 ? (
            <div className="text-sm font-typewriter py-3 text-center" style={{ color: 'rgba(59,35,20,0.55)' }}>
              ჯერ არცერთი ხმა არ არის.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sounds.map(s => (
                <SoundRow key={s.id} sound={s} passcode={passcode}
                          onChanged={() => reload()} onError={setError} />
              ))}
            </div>
          )}
        </div>

        <p className="text-[10px] font-typewriter mt-4 text-center" style={{ color: 'rgba(59,35,20,0.4)' }}>
          ცვლილებები მოთამაშეებთან შემდეგი გვერდის გახსნისას გამოჩნდება.
        </p>
      </div>
    </div>
  )
}
