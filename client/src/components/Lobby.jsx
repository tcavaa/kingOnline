import { useEffect, useState, useCallback } from 'react'
import { Layers, Trophy, User, Plus, LogOut, Lock } from 'lucide-react'
import { useGame } from '../context/GameContext'
import {
  listProfiles, getActiveProfileId, clearActiveProfile, markProfileVerified,
} from '../lib/profiles'
import ProfileForm, { ProfilePicker } from './ProfileForm'
import PinPromptModal from './PinPromptModal'
import PublicRoomPanel from './PublicRoomPanel'

function StarBar({ children }) {
  return (
    <div className="western-divider font-western text-xs uppercase">
      <span className="px-2">{children}</span>
    </div>
  )
}

export default function Lobby({ onOpenLeaderboard }) {
  const { createRoom, joinRoom, connected, publicSeat } = useGame()

  const [profiles, setProfiles] = useState([])
  // The "locked-in" profile id (the one the user has already verified on
  // this device, persisted in localStorage). Never auto-set by the lobby —
  // it only changes when the user successfully types a PIN.
  const [activeId, setActiveId] = useState(() => getActiveProfileId())
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState(null)
  // Pre-fill the room code from the last successful join so a quick refresh
  // or an accidental tab close doesn't force the player to retype it.
  const [joinCode, setJoinCode] = useState(() => {
    try { return localStorage.getItem('king.lastRoom') || '' }
    catch { return '' }
  })
  const [loading, setLoading] = useState(true)

  // The profile the user is trying to lock in to (PIN modal in flight).
  // null means no modal. Once the modal succeeds we promote `pinPending`
  // into `activeId`.
  const [pinPending, setPinPending] = useState(null)

  // Load profiles from the server every time the lobby mounts. We
  // intentionally do NOT auto-pick the first one — on a fresh visit, the
  // user has to actively choose (and unlock) someone.
  const reload = useCallback(async () => {
    try {
      const list = await listProfiles()
      const arr  = Array.isArray(list) ? list : []
      setProfiles(arr)
      // Only keep `activeId` if it still resolves to a real profile. If the
      // saved profile was deleted on another device, drop the lock-in.
      setActiveId(prev => {
        if (prev && arr.some(p => p.id === prev)) return prev
        if (prev) clearActiveProfile()
        return null
      })
      // First-time visitors with no saved profiles land straight in the
      // "create profile" form. Otherwise we always start by showing the
      // picker, even if there's a lock-in (the lock-in shows up there as
      // the highlighted entry).
      setShowForm(arr.length === 0)
      return arr
    } catch (err) {
      console.warn('[lobby] could not load profiles:', err.message)
      setProfiles([])
      setShowForm(true)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const active = activeId ? profiles.find(p => p.id === activeId) : null

  const onProfileSaved = async (saved) => {
    await reload()
    // Newly-created or just-edited profile: the user proved knowledge of
    // the PIN inside the form (they had to type it on create), so we can
    // skip the prompt and lock them straight in.
    if (saved?.id) {
      markProfileVerified(saved.id)
      setActiveId(saved.id)
    }
    setShowForm(false)
    setEditing(null)
  }

  // Picking a *different* profile pops the PIN prompt. Clicking the
  // already-active one is a no-op (no need to re-authenticate). Profiles
  // without a PIN are promoted instantly.
  const pickProfile = (profile) => {
    if (!profile?.id) return
    if (profile.id === activeId) return
    if (!profile.has_pin) {
      markProfileVerified(profile.id)
      setActiveId(profile.id)
      return
    }
    setPinPending(profile)
  }

  const switchProfile = () => {
    clearActiveProfile()
    setActiveId(null)
  }

  // Action buttons no longer need their own PIN prompt — `activeId` being
  // truthy already implies "verified on this device", so we just fire the
  // socket call directly.
  const handleCreate = () => {
    if (!active) return
    createRoom(active.name, active.avatar)
  }

  const handleJoin = () => {
    if (!active) return
    const code = joinCode.trim().toUpperCase()
    if (!code) return
    try { localStorage.setItem('king.lastRoom', code) } catch { /* ignore quota */ }
    joinRoom(code, active.name, active.avatar)
  }

  return (
    <div className="saloon-bg flex flex-col items-center justify-center px-4 py-8 relative overflow-hidden">
      {/* Top-right: Leaderboard */}
      <button onClick={onOpenLeaderboard}
              className="absolute top-4 right-4 z-20 western-pill inline-flex items-center gap-2 px-4 py-2 text-sm font-bold transition-all active:scale-95"
              style={{ color: '#3b2314' }}>
        <Trophy size={16} style={{ color: '#8e2b23' }} /> <span className="font-western">რეიტინგი</span>
      </button>

      <div className="relative z-10 mb-6 text-center select-none">
        <div className="text-[11px] uppercase tracking-[0.55em] text-amber-dim font-western mb-2">
          ✦ &nbsp; კეთილი იყოს შენი მობრძანება &nbsp; ✦
        </div>
        <h1 className="text-7xl font-western"
            style={{
              color: '#8e2b23',
              textShadow: '0 2px 0 rgba(255,255,255,0.35), 0 4px 14px rgba(58,36,24,0.25), 0 0 36px rgba(142,43,35,0.18)',
              letterSpacing: '0.08em',
            }}>
          კინგი
        </h1>
        <div className="mt-1 text-[11px] uppercase tracking-[0.4em] font-western"
             style={{ color: 'rgba(142,43,35,0.85)' }}>
          ✦ &nbsp; დუქნის კარტის თამაში &nbsp; ✦
        </div>

        <div className="mt-4 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-typewriter"
             style={{
               background: connected ? 'rgba(76,122,47,0.12)' : 'rgba(165,55,43,0.12)',
               border: connected ? '1px solid rgba(76,122,47,0.4)' : '1px solid rgba(165,55,43,0.4)',
               color: connected ? '#4c7a2f' : '#a5372b',
             }}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`} />
          {connected ? 'კავშირი გამართულია' : 'ვემზადებით…'}
        </div>
      </div>

      {/* Profile section */}
      <div className="relative z-10 w-full max-w-xl mb-5">
        <div className="western-panel p-5">
          {showForm ? (
            <ProfileForm
              editing={editing}
              onDone={onProfileSaved}
              onCancel={profiles.length ? () => { setShowForm(false); setEditing(null) } : null}
            />
          ) : loading ? (
            <div className="text-center text-sm font-typewriter py-3"
                 style={{ color: 'rgba(59,35,20,0.55)' }}>
              პროფილების ჩატვირთვა…
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-western text-ink inline-flex items-center gap-2 uppercase">
                  <User size={14} />
                  <span className="inline-flex flex-col leading-tight">
                    <span>{active ? 'მოთამაშე' : 'აირჩიე პროფილი'}</span>
                  </span>
                </h3>
                <button onClick={() => { setEditing(null); setShowForm(true) }}
                        className="text-xs inline-flex items-center gap-1 font-typewriter"
                        style={{ color: '#8e2b23' }}>
                  <Plus size={12} /> ახალი პროფილი
                </button>
              </div>

              {active ? (
                <div className="flex items-center gap-3 p-3 rounded-xl"
                     style={{ background: 'rgba(142,43,35,0.07)', border: '1px solid rgba(122,83,44,0.3)' }}>
                  <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center"
                       style={{ background: '#000', border: '2px solid rgba(142,43,35,0.55)' }}>
                    <img src={active.avatar || '/avatar-default.png'} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold font-western inline-flex items-center gap-1.5"
                         style={{ color: '#3b2314' }}>
                      {active.name}
                      {active.has_pin && (
                        <Lock size={11} style={{ color: 'rgba(142,43,35,0.85)' }} />
                      )}
                    </div>
                    <div className="text-[10px] font-typewriter" style={{ color: 'rgba(142,43,35,0.7)' }}>
                      ამ სახელით თამაშობ
                    </div>
                  </div>
                  <button onClick={() => { setEditing(active); setShowForm(true) }}
                          className="text-xs px-2 font-typewriter" style={{ color: '#8e2b23' }}>შეცვლა</button>
                  <button onClick={switchProfile}
                          title="პროფილის გადართვა"
                          className="text-xs px-2 font-typewriter inline-flex items-center gap-1"
                          style={{ color: 'rgba(59,35,20,0.65)' }}>
                    <LogOut size={11} /> გადართვა
                  </button>
                </div>
              ) : (
                <p className="text-xs font-typewriter"
                   style={{ color: 'rgba(59,35,20,0.6)' }}>
                  აირჩიე პროფილი ქვემოთ — დაგჭირდება მისი 4-ციფრიანი კოდი.
                </p>
              )}

              {/* Always show the picker so the user can switch outlaws.
                  When `active` is null this is the only way in.
                  When there's only one saved profile and nobody is locked
                  in yet, we still show the single-button picker so the
                  user can click it to enter their PIN. */}
              {profiles.length > 0 && (
                <ProfilePicker
                  profiles={profiles}
                  value={activeId}
                  onChange={pickProfile}
                  onEdit={(p) => { setEditing(p); setShowForm(true) }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {!showForm && !loading && (
        <div className="relative z-10 w-full max-w-xl mb-5">
          <PublicRoomPanel active={active} />
        </div>
      )}

      {!showForm && !loading && (
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-xl">
          <div className="western-panel p-6 flex flex-col">
            <div className="mb-4 flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Layers size={18} style={{ color: '#8e2b23' }} />
                  <h2 className="text-lg font-western text-ink uppercase inline-flex flex-col leading-tight">
                    <span>გახსენი დუქანი</span>
                  </h2>
                </div>
                <p className="text-xs font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>
                  დაიწყე ახალი თამაში და მოიწვიე 2 მეგობარი.
                </p>
              </div>
              {/* Old-Tbilisi balcony house with a wine table in front */}
              <div className="relative flex-shrink-0 w-28 h-24 pointer-events-none select-none">
                <img src="/home.png" alt=""
                     className="absolute inset-0 w-full h-full object-contain" />
                <img src="/wine.png" alt=""
                     className="absolute -bottom-2 -left-5 w-16 h-16 object-contain"
                     style={{ filter: 'drop-shadow(0 2px 3px rgba(58,36,24,0.3))' }} />
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!connected || !active || publicSeat !== null}
              className="casino-btn-primary mt-auto w-full py-2.5 text-sm tracking-wider uppercase active:scale-95"
            >
              {publicSeat !== null ? 'ზიხარ საჯარო მაგიდასთან' : (
                <span className="inline-flex items-center justify-center gap-3">
                  <img src="/ornament-2.png" alt=""
                       className="w-5 h-5 object-contain pointer-events-none select-none"
                       style={{ opacity: 0.8, filter: 'brightness(1.6)' }} />
                  <span className="inline-flex flex-col items-center leading-tight">
                    <span>დამირიგე</span>
                  </span>
                  <img src="/ornament-2.png" alt=""
                       className="w-5 h-5 object-contain pointer-events-none select-none"
                       style={{ opacity: 0.8, filter: 'brightness(1.6)' }} />
                </span>
              )}
            </button>
          </div>

          <div className="western-panel p-6 flex flex-col">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <img src="/door.png" alt=""
                     className="w-11 h-11 object-contain pointer-events-none select-none flex-shrink-0"
                     style={{ filter: 'drop-shadow(0 1px 2px rgba(58,36,24,0.25))' }} />
                <h2 className="text-lg font-western text-ink uppercase inline-flex flex-col leading-tight">
                  <span>შედი დუქანში</span>
                </h2>
              </div>
              <p className="text-xs font-typewriter" style={{ color: 'rgba(59,35,20,0.55)' }}>
                გაქვს კოდი? შემოდი.
              </p>
            </div>
            <div className="mb-3">
              <label className="block text-xs mb-1.5 uppercase font-western tracking-widest"
                     style={{ color: 'rgba(142,43,35,0.7)' }}>ოთახის კოდი</label>
              <input type="text" maxLength={6} value={joinCode}
                     onChange={e => setJoinCode(e.target.value.toUpperCase())}
                     placeholder="XXXXXX"
                     className="casino-input font-typewriter tracking-[0.3em] uppercase text-center" />
            </div>
            <button
              onClick={handleJoin}
              disabled={!connected || !active || !joinCode.trim() || publicSeat !== null}
              className="casino-btn-gold w-full py-2.5 text-sm tracking-wider uppercase active:scale-95"
            >
              <span className="inline-flex items-center justify-center gap-3">
                <img src="/ornament.png" alt=""
                     className="w-5 h-5 object-contain pointer-events-none select-none"
                     style={{ opacity: 0.85 }} />
                <span className="inline-flex flex-col items-center leading-tight">
                  <span>შეუერთდი თამაშს</span>
                </span>
                <img src="/ornament.png" alt=""
                     className="w-5 h-5 object-contain pointer-events-none select-none"
                     style={{ opacity: 0.85 }} />
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="relative z-10 mt-8 max-w-xl w-full">
        <img src="/line-ornament.png" alt=""
             className="mx-auto mb-1 h-8 object-contain pointer-events-none select-none"
             style={{ opacity: 0.9 }} />
        <StarBar>სმა-ჭამა — დიდად შესარგი ✦ შოთა რუსთაველი</StarBar>
        <div className="mt-2 text-center text-[10px] font-typewriter uppercase tracking-widest"
             style={{ color: 'rgba(59,35,20,0.55)' }}>
          3 მოთამაშე · 27 ხელი · კლასიკური კინგის წესები
        </div>
      </div>

      {pinPending && (
        <PinPromptModal
          profile={pinPending}
          onSuccess={({ profile }) => {
            // Successful PIN → this profile becomes the new lock-in,
            // overwriting whatever was there before.
            markProfileVerified(profile.id)
            setActiveId(profile.id)
            setPinPending(null)
          }}
          onCancel={() => setPinPending(null)}
        />
      )}
    </div>
  )
}
