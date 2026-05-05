import { useState } from 'react'
import { GameProvider, useGame } from './context/GameContext'
import Lobby        from './components/Lobby'
import WaitingRoom  from './components/WaitingRoom'
import GameLayout   from './components/GameLayout'
import GameOverScreen from './components/GameOverScreen'
import Leaderboard  from './components/Leaderboard'
import RotatePrompt from './components/RotatePrompt'

const TOAST_STYLES = {
  error:   { bg: 'rgba(127,29,29,0.95)',  border: 'rgba(239,68,68,0.45)',   color: '#fca5a5' },
  success: { bg: 'rgba(20,83,45,0.95)',   border: 'rgba(74,222,128,0.4)',   color: '#86efac' },
  warning: { bg: 'rgba(120,53,15,0.95)',  border: 'rgba(251,191,36,0.4)',   color: '#fde68a' },
  info:    { bg: 'rgba(26,11,46,0.95)',   border: 'rgba(147,51,234,0.4)',   color: '#c4b5fd' },
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
    <div className="min-h-screen text-[#e6edf3]"
         style={{ background: '#0d0a1a', minHeight: '100dvh' }}>
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
