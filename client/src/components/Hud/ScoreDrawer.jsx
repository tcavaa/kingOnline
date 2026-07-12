import { lazy, Suspense } from 'react'
import { X } from 'lucide-react'
import ScoreTable     from '../ScoreTable'
import GameTypeMatrix from '../GameTypeMatrix'
import LastTrickView  from '../LastTrickView'
import WinProbability from '../WinProbability'

// ScoreChart is the only recharts consumer inside the game screen — loading
// it lazily keeps the ~80 kB (gzip) recharts chunk out of the GameLayout
// bundle until the player actually opens the chart tab.
const ScoreChart = lazy(() => import('../ScoreChart'))

const TITLES = {
  scores: 'ქულების დავთარი',
  matrix: 'ნათამაშები ხელები',
  chart:  'ქულების გრაფიკი',
  last:   'ბოლოს გასული',
}

/**
 * Right-side slide-in drawer that hosts the four data views.
 *
 * The Tally Sheet is given a wider width than the others because it hosts a
 * full per-round score table — at the previous 320 px the table itself
 * needed an inner horizontal scrollbar, which is awkward on mobile.
 */
export default function ScoreDrawer({ panel, onClose }) {
  if (!panel) return null
  // 'scores' and 'matrix' both host 3-player tables — at 320px the third
  // player's column fell off the edge, so they get the wide (~26rem) drawer.
  const widthClass = (panel === 'scores' || panel === 'matrix')
    ? 'w-[26rem] max-w-[95vw]'
    : 'w-80 max-w-[92vw]'
  return (
    <>
      {/* Backdrop scrim — clicking anywhere outside the drawer closes it. */}
      <div className="drawer-scrim" onClick={onClose} />
      <div className={`absolute top-0 right-0 bottom-0 ${widthClass} z-30 overflow-y-auto pointer-events-auto bg-leather`}
           style={{ borderLeft: '1px solid rgba(122,83,44,0.4)', backdropFilter: 'blur(16px)' }}>
        <div className="p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-western uppercase tracking-wider text-cream">{TITLES[panel] || ''}</h3>
            <button onClick={onClose} className="hover:opacity-80 text-cream-soft"><X size={18} /></button>
          </div>
          {panel === 'scores' && <ScoreTable />}
          {panel === 'scores' && <WinProbability />}
          {panel === 'matrix' && <GameTypeMatrix />}
          {panel === 'chart'  && (
            <Suspense fallback={
              <div className="text-center text-xs font-typewriter py-6"
                   style={{ color: 'rgba(59,35,20,0.55)' }}>
                იტვირთება…
              </div>
            }>
              <ScoreChart />
            </Suspense>
          )}
          {panel === 'last'   && <LastTrickView />}
        </div>
      </div>
    </>
  )
}
