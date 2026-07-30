import { useState, useEffect, lazy, Suspense } from 'react'
import { GameProvider, useGame } from './context/GameContext'
import Lobby        from './components/Lobby'
import WaitingRoom  from './components/WaitingRoom'
import RotatePrompt from './components/RotatePrompt'

// Heavy screens are code-split so the lobby doesn't pay for them up front:
// GameLayout drags in Phaser (~1.5 MB), GameOverScreen pulls canvas-confetti
// + recharts (via ScoreChart), Leaderboard pulls the recharts panels.
const GameLayout     = lazy(() => import('./components/GameLayout'))
const GameOverScreen = lazy(() => import('./components/GameOverScreen'))
const Leaderboard    = lazy(() => import('./components/Leaderboard'))
// ჩეხური დურაკა is a self-contained side game (own socket, own screens).
const DurakApp       = lazy(() => import('./durak/DurakApp'))

// A live durak session in localStorage means the user refreshed mid-game —
// reopen the durak section so the seat re-attaches automatically.
function hasDurakSession() {
  try { return !!localStorage.getItem('king.durak.session') } catch { return false }
}

/** Parchment-toned full-screen fallback shown while a lazy chunk loads.
    Background matches the GameLayout wrapper and the Phaser boot color so
    the transition into the game never flashes a different shade. */
function ScreenLoader() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3"
         style={{ background: '#e9d7b6' }}>
      <img src="/ornament.webp" alt=""
           className="w-12 h-12 object-contain select-none animate-spin"
           style={{ animationDuration: '1.4s' }} />
      <span className="text-sm font-typewriter" style={{ color: 'rgba(90,54,32,0.85)' }}>
        მაგიდა იშლება…
      </span>
    </div>
  )
}

const TOAST_STYLES = {
  error:   { bg: 'rgba(111,31,26,0.96)',  border: 'rgba(255,226,190,0.45)', color: '#fdf2df' },
  success: { bg: 'rgba(76,122,47,0.95)',  border: 'rgba(244,232,207,0.45)', color: '#f6ead0' },
  warning: { bg: 'rgba(192,138,38,0.96)', border: 'rgba(255,244,214,0.5)',  color: '#3b2314' },
  info:    { bg: 'rgba(248,239,221,0.97)',border: 'rgba(142,43,35,0.45)',   color: '#3b2314' },
}

function ToastContainer() {
  const { toasts } = useGame()
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        const s = TOAST_STYLES[toast.type] ?? TOAST_STYLES.info
        return (
          <div key={toast.id}
               className="toast-enter px-4 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-xs pointer-events-auto"
               style={{
                 background: s.bg,
                 border: `1px solid ${s.border}`,
                 color: s.color,
                 backdropFilter: 'blur(12px)',
                 boxShadow: `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${s.border}`,
               }}>
            {toast.message}
          </div>
        )
      })}
    </div>
  )
}

function AppInner() {
  const { appPhase } = useGame()
  const [view, setView] = useState(() => (hasDurakSession() ? 'durak' : 'main')) // 'main' | 'leaderboard' | 'durak'
  const [durakProfile, setDurakProfile] = useState(null)

  // Warm the game-screen chunks in the background once the lobby has painted
  // and the main thread is idle: a lobby visitor is about to play, so by the
  // time the 3rd seat fills the Phaser chunk is already cached and the
  // Suspense fallback never shows. Leaderboard stays cold — it's optional.
  useEffect(() => {
    const warm = () => {
      import('./components/GameLayout')
      import('./components/GameOverScreen')
    }
    let idleId = null
    let timerId = null
    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(warm, { timeout: 4000 })
    } else {
      timerId = setTimeout(warm, 2500) // Safari has no requestIdleCallback
    }
    return () => {
      if (idleId !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId)
      if (timerId !== null) clearTimeout(timerId)
    }
  }, [])

  return (
    <div className="min-h-screen text-ink"
         style={{ background: '#3a2418', minHeight: '100dvh' }}>
      <ToastContainer />
      <RotatePrompt />
      <Suspense fallback={<ScreenLoader />}>
        {view === 'durak' ? (
          <DurakApp profile={durakProfile} onExit={() => setView('main')} />
        ) : view === 'leaderboard' ? (
          <Leaderboard onBack={() => setView('main')} />
        ) : (
          <>
            {appPhase === 'lobby'    && (
              <Lobby
                onOpenLeaderboard={() => setView('leaderboard')}
                onOpenDurak={(profile) => { setDurakProfile(profile); setView('durak') }}
              />
            )}
            {appPhase === 'waiting'  && <WaitingRoom />}
            {appPhase === 'game'     && <GameLayout />}
            {appPhase === 'gameover' && <GameOverScreen onOpenLeaderboard={() => setView('leaderboard')} />}
          </>
        )}
      </Suspense>
    </div>
  )
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  )
}
