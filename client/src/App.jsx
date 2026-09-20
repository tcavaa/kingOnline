import { useState, lazy, Suspense } from 'react'
import { GameProvider, useGame } from './context/GameContext'
import Lobby        from './components/Lobby'
import WaitingRoom  from './components/WaitingRoom'
// A *recent* durak session in localStorage means the user refreshed mid-game
// — reopen the durak section so the seat re-attaches automatically. The
// marker expires (see durak/session), so an old one no longer hijacks a
// later visit to the homepage. Kept in its own tiny module so this check
// doesn't pull the lazily-split durak chunk into the main bundle.
import { readDurakSession } from './durak/session'

// Heavy screens are code-split so the lobby doesn't pay for them up front:
// GameLayout drags in Phaser (~1.5 MB), GameOverScreen pulls canvas-confetti
// + recharts (via ScoreChart), Leaderboard pulls the recharts panels.
const GameLayout     = lazy(() => import('./components/GameLayout'))
const GameOverScreen = lazy(() => import('./components/GameOverScreen'))
const Leaderboard    = lazy(() => import('./components/Leaderboard'))
// ჩეხური დურაკა is a self-contained side game (own socket, own screens).
const DurakApp       = lazy(() => import('./durak/DurakApp'))
// The /admin sound-management page. Lazy so ordinary players never download
// it, and mounted outside GameProvider — it has no business opening a socket.
const AdminApp       = lazy(() => import('./components/Admin/AdminApp'))

// The app has no router: the server's SPA fallback serves index.html for any
// path, so a single pathname check is all the routing /admin needs.
function isAdminPath() {
  if (typeof window === 'undefined') return false
  return /^\/admin\/?$/.test(window.location.pathname)
}

/** Parchment-toned full-screen fallback shown while a lazy chunk loads.
    Background matches the GameLayout wrapper and the Phaser boot color so
    the transition into the game never flashes a different shade. */
function ScreenLoader() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-3"
         style={{ background: '#0b1615' }}>

      <span className="text-sm font-typewriter" style={{ color: 'rgba(90,54,32,0.85)' }}>
        თამაში იტვირთება…
      </span>
    </div>
  )
}

const TOAST_STYLES = {
  error:   { bg: 'rgba(111,31,26,0.96)',  border: 'rgba(255,226,190,0.45)', color: '#f5f2e9' },
  success: { bg: 'rgba(122,199,165,0.95)',  border: 'rgba(244,232,207,0.45)', color: '#10211d' },
  warning: { bg: '#262e22', border: '#a4ba7e', color: '#edf2e2' },
  info:    { bg: 'rgba(23,39,35,0.97)',border: 'rgba(213,185,130,0.45)',   color: '#eeeae1' },
}

function ToastContainer() {
  const { toasts } = useGame()
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => {
        const s = TOAST_STYLES[toast.type] ?? TOAST_STYLES.info
        return (
          <div key={toast.id}
               className="toast-enter px-4 py-3 rounded-sm shadow-lg text-xs font-medium max-w-xs pointer-events-auto"
               style={{
                 background: s.bg,
                 border: `1px solid ${s.border}`,
                 color: s.color,
                 backdropFilter: 'blur(12px)',
                 boxShadow: '0 8px 30px #0003',
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
  const [view, setView] = useState(() => (readDurakSession() ? 'durak' : 'main')) // 'main' | 'leaderboard' | 'durak'
  const [durakProfile, setDurakProfile] = useState(null)

  return (
    <div className="min-h-screen text-ink"
         style={{ background: '#091211', minHeight: '100dvh' }}>
      <ToastContainer />
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
  // Checked once at module-render time — /admin is a full page load, never a
  // client-side transition, so there's nothing to re-evaluate.
  if (isAdminPath()) {
    return (
      <div className="min-h-screen text-ink" style={{ background: '#091211', minHeight: '100dvh' }}>
        <Suspense fallback={<ScreenLoader />}>
          <AdminApp />
        </Suspense>
      </div>
    )
  }

  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  )
}
