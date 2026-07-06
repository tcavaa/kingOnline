import { useState } from 'react'
import { GameProvider, useGame } from './context/GameContext'
import Lobby        from './components/Lobby'
import WaitingRoom  from './components/WaitingRoom'
import GameLayout   from './components/GameLayout'
import GameOverScreen from './components/GameOverScreen'
import Leaderboard  from './components/Leaderboard'
import RotatePrompt from './components/RotatePrompt'

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
  const [view, setView] = useState('main') // 'main' | 'leaderboard'

  return (
    <div className="min-h-screen text-ink"
         style={{ background: '#3a2418', minHeight: '100dvh' }}>
      <ToastContainer />
      <RotatePrompt />
      {view === 'leaderboard' ? (
        <Leaderboard onBack={() => setView('main')} />
      ) : (
        <>
          {appPhase === 'lobby'    && <Lobby onOpenLeaderboard={() => setView('leaderboard')} />}
          {appPhase === 'waiting'  && <WaitingRoom />}
          {appPhase === 'game'     && <GameLayout />}
          {appPhase === 'gameover' && <GameOverScreen onOpenLeaderboard={() => setView('leaderboard')} />}
        </>
      )}
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
