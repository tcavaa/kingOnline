import { useRef, useState } from 'react'
import { User, Upload, Trash2, Plus, X, Lock } from 'lucide-react'
import { saveProfile, fileToDataURL, deleteProfile, setActiveProfileId } from '../lib/profiles'

const PIN_DIGITS = 4

/**
 * Inline form for creating or editing a profile (username + avatar + PIN).
 * `editing` is the profile object (or null to create new). Calls onDone(profile|null).
 *
 * PIN behaviour
 *   - On *create*, the PIN is required (4 digits).
 *   - On *edit*, leaving the PIN field empty leaves the existing PIN
 *     untouched. Typing a new 4-digit PIN replaces it. There is no UI for
 *     "remove PIN" — easier mental model for casual users.
 */
export default function ProfileForm({ editing, onDone, onCancel }) {
  const [name, setName]     = useState(editing?.name || '')
  const [avatar, setAvatar] = useState(editing?.avatar || null)
  const [pin, setPin]       = useState('')
  const [pinErr, setPinErr] = useState('')
  const fileRef = useRef(null)

  const isNewProfile = !editing
  const hadPin       = !!editing?.has_pin

  const onPickPin = (e) => {
    const cleaned = (e.target.value || '').replace(/\D/g, '').slice(0, PIN_DIGITS)
    setPin(cleaned)
    if (pinErr) setPinErr('')
  }

  const onPick = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    try {
      const dataURL = await fileToDataURL(f, 256)
      setAvatar(dataURL)
    } catch { /* ignore */ }
  }

  const [busy, setBusy] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return

    // PIN validation. New profiles must set one; edits may keep the existing
    // one by leaving the field blank, but if they type *anything* it has to
    // be 4 digits.
    if (isNewProfile && pin.length !== PIN_DIGITS) {
      setPinErr('დააყენე 4-ციფრიანი კოდი, რომ მხოლოდ შენ შეძლო ამ პროფილით შესვლა.')
      return
    }
    if (!isNewProfile && pin.length > 0 && pin.length !== PIN_DIGITS) {
      setPinErr('PIN-კოდი ზუსტად 4 ციფრი უნდა იყოს.')
      return
    }

    setBusy(true)
    try {
      const saved = await saveProfile({
        id: editing?.id,
        name,
        avatar,
        // Send PIN only when the user actually typed one; otherwise keep
        // the existing hash on the server.
        ...(pin.length === PIN_DIGITS ? { pin } : {}),
      })
      setActiveProfileId(saved.id)
      onDone?.(saved)
    } catch (err) {
      alert(`პროფილის შენახვა ვერ მოხერხდა: ${err.message}`)
    } finally { setBusy(false) }
  }

  const onDelete = async () => {
    if (!editing?.id || busy) return
    setBusy(true)
    try {
      await deleteProfile(editing.id)
      onDone?.(null)
    } catch (err) {
      alert(`პროფილის წაშლა ვერ მოხერხდა: ${err.message}`)
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-western uppercase inline-flex items-center gap-2"
            style={{ color: '#3b2314' }}>
          <User size={14} />
          {editing ? 'პროფილის შეცვლა' : 'ახალი პროფილი'}
        </h3>
        {onCancel && (
          <button type="button" onClick={onCancel}
                  className="text-cream-dim hover:text-rust"><X size={16} /></button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          onClick={() => fileRef.current?.click()}
          className="relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer overflow-hidden"
          style={{
            background: '#000',
            border: '2px solid rgba(142,43,35,0.55)',
          }}>
          <img src={avatar || '/avatar-default.png'} alt=""
               className="w-full h-full object-cover" />
          <span className="absolute bottom-0 inset-x-0 py-0.5 text-[9px] text-center font-bold font-typewriter"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#f2e4c8' }}>
            <Upload size={10} className="inline mr-1" />ატვირთვა
          </span>
        </div>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-widest mb-1 font-western"
                 style={{ color: 'rgba(142,43,35,0.7)' }}>სახელი</label>
          <input
            type="text" maxLength={20} value={name}
            onChange={e => setName(e.target.value)}
            placeholder="მაგ. ფიროსმანი"
            className="casino-input w-full px-3 py-2 text-sm focus:outline-none"
          />
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />

      {/* PIN row */}
      <div>
        <label className="flex items-center justify-between text-[10px] uppercase tracking-widest mb-1 font-western"
               style={{ color: 'rgba(142,43,35,0.7)' }}>
          <span className="inline-flex items-center gap-1">
            <Lock size={10} /> 4-ციფრიანი PIN-კოდი
          </span>
          {!isNewProfile && hadPin && (
            <span className="normal-case tracking-normal text-[9px] font-typewriter"
                  style={{ color: 'rgba(59,35,20,0.55)' }}>
              დატოვე ცარიელი, რომ არსებული შენარჩუნდეს
            </span>
          )}
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={PIN_DIGITS}
          value={pin}
          onChange={onPickPin}
          placeholder={isNewProfile ? '••••' : (hadPin ? '••••' : '••••')}
          className="casino-input font-typewriter tracking-[0.5em] text-center"
          style={{ letterSpacing: '0.5em' }}
        />
        {pinErr && (
          <p className="text-[10px] font-typewriter mt-1" style={{ color: '#a5372b' }}>{pinErr}</p>
        )}
        {isNewProfile && !pinErr && (
          <p className="text-[10px] font-typewriter mt-1"
             style={{ color: 'rgba(59,35,20,0.45)' }}>
            ამ კოდს ყოველ ჯერზე მოგთხოვენ, როცა ამ პროფილს ახალ მოწყობილობაზე აირჩევ.
          </p>
        )}
      </div>

      <div className="flex gap-2 mt-1">
        {editing && (
          <button type="button" onClick={onDelete}
                  className="px-3 py-2 rounded-lg text-xs font-western uppercase tracking-wider inline-flex items-center gap-1.5 transition-all active:scale-95"
                  style={{
                    background: 'linear-gradient(180deg, #a5372b 0%, #7e2a20 100%)',
                    border: '1px solid rgba(122,83,44,0.5)',
                    color: '#f8efdd',
                    boxShadow: '0 2px 0 rgba(58,36,24,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
                    textShadow: '0 1px 0 rgba(58,36,24,0.45)',
                  }}>
            <Trash2 size={12} /> წაშლა
          </button>
        )}
        <button type="submit" disabled={!name.trim()}
                className="flex-1 casino-btn-primary py-2 rounded-lg font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
          <Plus size={14} /> {editing ? 'შენახვა' : 'პროფილის შექმნა'}
        </button>
      </div>
    </form>
  )
}

/**
 * Stateless profile picker — receives the live list from its parent (which
 * loads it from the server). Avoids the previous bug where this component
 * had its own `useState(() => listProfiles())` snapshot of an empty
 * localStorage cache and never updated when the server data arrived.
 */
export function ProfilePicker({ profiles = [], value, onChange, onEdit }) {
  if (!profiles.length) return null
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest mb-1.5 font-western"
             style={{ color: 'rgba(142,43,35,0.75)' }}>
        <span className="inline-flex items-center gap-2">
          შენახული პროფილები
          <img src="/line-ornament.webp" alt=""
               className="h-4 w-12 object-contain pointer-events-none select-none"
               style={{ opacity: 0.8 }} />
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {profiles.map(p => {
          const active = p.id === value
          return (
            <button key={p.id} type="button"
                    onClick={() => onChange(p)}
                    className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full text-xs font-western uppercase tracking-wide transition-all active:scale-95"
                    style={{
                      background: active
                        ? 'linear-gradient(180deg, #f3e2be 0%, #e6cd9a 100%)'
                        : 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
                      border: active
                        ? '1px solid rgba(142,43,35,0.75)'
                        : '1px solid rgba(122,83,44,0.3)',
                      color: '#3b2314',
                      boxShadow: active
                        ? '0 0 16px rgba(142,43,35,0.25), inset 0 1px 0 rgba(255,255,255,0.2)'
                        : '0 2px 0 rgba(58,36,24,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
                      textShadow: '0 1px 0 rgba(255,255,255,0.45)',
                    }}>
              <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center"
                    style={{
                      background: '#000',
                      border: active ? '1px solid rgba(142,43,35,0.7)' : '1px solid rgba(142,43,35,0.4)',
                    }}>
                <img src={p.avatar || '/avatar-default.png'} alt=""
                     className="w-full h-full object-cover" />
              </span>
              <span>{p.name}</span>
              {onEdit && (
                <span onClick={(e) => { e.stopPropagation(); onEdit(p) }}
                      className="text-[10px] font-typewriter normal-case tracking-normal hover:underline"
                      style={{ color: active ? '#8e2b23' : 'rgba(142,43,35,0.85)' }}>შეცვლა</span>
              )}
              <img src="/ornament.webp" alt=""
                   className="w-3.5 h-3.5 object-contain pointer-events-none select-none"
                   style={{ opacity: active ? 0.95 : 0.6 }} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
