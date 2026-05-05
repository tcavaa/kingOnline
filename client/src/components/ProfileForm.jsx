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
      setPinErr('Set a 4-digit pass code so only you can saddle up.')
      return
    }
    if (!isNewProfile && pin.length > 0 && pin.length !== PIN_DIGITS) {
      setPinErr('PIN must be exactly 4 digits.')
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
      alert(`Couldn't save profile: ${err.message}`)
    } finally { setBusy(false) }
  }

  const onDelete = async () => {
    if (!editing?.id || busy) return
    setBusy(true)
    try {
      await deleteProfile(editing.id)
      onDone?.(null)
    } catch (err) {
      alert(`Couldn't delete profile: ${err.message}`)
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-western uppercase inline-flex items-center gap-2"
            style={{ color: '#fde9b8' }}>
          <User size={14} />
          {editing ? 'Edit Outlaw' : 'New Outlaw'}
        </h3>
        {onCancel && (
          <button type="button" onClick={onCancel}
                  className="text-gray-400 hover:text-amber-200"><X size={16} /></button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div
          onClick={() => fileRef.current?.click()}
          className="relative w-16 h-16 rounded-full flex items-center justify-center cursor-pointer overflow-hidden"
          style={{
            background: '#000',
            border: '2px solid rgba(218,165,32,0.55)',
          }}>
          <img src={avatar || '/avatar-default.png'} alt=""
               className="w-full h-full object-cover" />
          <span className="absolute bottom-0 inset-x-0 py-0.5 text-[9px] text-center font-bold font-typewriter"
                style={{ background: 'rgba(0,0,0,0.7)', color: '#fde9b8' }}>
            <Upload size={10} className="inline mr-1" />Upload
          </span>
        </div>
        <div className="flex-1">
          <label className="block text-[10px] uppercase tracking-widest mb-1 font-western"
                 style={{ color: 'rgba(218,165,32,0.7)' }}>Outlaw name</label>
          <input
            type="text" maxLength={20} value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Doc Holliday"
            className="casino-input w-full px-3 py-2 text-sm focus:outline-none"
          />
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />

      {/* PIN row */}
      <div>
        <label className="flex items-center justify-between text-[10px] uppercase tracking-widest mb-1 font-western"
               style={{ color: 'rgba(218,165,32,0.7)' }}>
          <span className="inline-flex items-center gap-1">
            <Lock size={10} /> 4-digit pass code
          </span>
          {!isNewProfile && hadPin && (
            <span className="normal-case tracking-normal text-[9px] font-typewriter"
                  style={{ color: 'rgba(245,233,207,0.55)' }}>
              leave blank to keep current
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
          <p className="text-[10px] font-typewriter mt-1" style={{ color: '#e8a097' }}>{pinErr}</p>
        )}
        {isNewProfile && !pinErr && (
          <p className="text-[10px] font-typewriter mt-1"
             style={{ color: 'rgba(245,233,207,0.45)' }}>
            You'll be asked for this every time you pick this profile on a new device.
          </p>
        )}
      </div>

      <div className="flex gap-2 mt-1">
        {editing && (
          <button type="button" onClick={onDelete}
                  className="px-3 py-2 rounded-lg text-xs font-western uppercase tracking-wider inline-flex items-center gap-1.5 transition-all active:scale-95"
                  style={{
                    background: 'linear-gradient(180deg, #6b1e1e 0%, #3a1010 100%)',
                    border: '1px solid rgba(218,165,32,0.5)',
                    color: '#fde9b8',
                    boxShadow: '0 2px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,170,0.15)',
                    textShadow: '0 1px 0 rgba(0,0,0,0.5)',
                  }}>
            <Trash2 size={12} /> Delete
          </button>
        )}
        <button type="submit" disabled={!name.trim()}
                className="flex-1 casino-btn-primary py-2 rounded-lg font-bold text-sm disabled:opacity-40 inline-flex items-center justify-center gap-1.5">
          <Plus size={14} /> {editing ? 'Save' : 'Create Profile'}
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
             style={{ color: 'rgba(218,165,32,0.75)' }}>
        Saddle up · Saved Outlaws
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
                        ? 'linear-gradient(180deg, #6f4e37 0%, #4a2e1a 100%)'
                        : 'linear-gradient(180deg, #3a2316 0%, #2c1a10 100%)',
                      border: active
                        ? '1px solid rgba(240,199,90,0.75)'
                        : '1px solid rgba(218,165,32,0.3)',
                      color: active ? '#fff8e6' : '#fde9b8',
                      boxShadow: active
                        ? '0 0 16px rgba(240,199,90,0.35), inset 0 1px 0 rgba(255,220,170,0.2)'
                        : '0 2px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,220,170,0.08)',
                      textShadow: '0 1px 0 rgba(0,0,0,0.45)',
                    }}>
              <span className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center"
                    style={{
                      background: '#000',
                      border: active ? '1px solid rgba(240,199,90,0.7)' : '1px solid rgba(218,165,32,0.4)',
                    }}>
                <img src={p.avatar || '/avatar-default.png'} alt=""
                     className="w-full h-full object-cover" />
              </span>
              <span>{p.name}</span>
              {onEdit && (
                <span onClick={(e) => { e.stopPropagation(); onEdit(p) }}
                      className="text-[10px] font-typewriter normal-case tracking-normal hover:underline"
                      style={{ color: active ? '#ffd980' : 'rgba(218,165,32,0.85)' }}>edit</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
