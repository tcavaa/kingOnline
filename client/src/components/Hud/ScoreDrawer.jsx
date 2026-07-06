import { X } from 'lucide-react'
import ScoreTable     from '../ScoreTable'
import ScoreChart     from '../ScoreChart'
import GameTypeMatrix from '../GameTypeMatrix'
import LastTrickView  from '../LastTrickView'
import WinProbability from '../WinProbability'

const TITLES = {
  scores: 'ქულების დავთარი',
  matrix: 'ნათამაშები ხელები',
  chart:  'ქულების გრაფიკი',
  last:   'ბოლო აღება',
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
  // 'scores' is the wide one (~26rem ≈ 416px). The other panels stay at the
  // original 20rem ≈ 320px.
  const widthClass = panel === 'scores' ? 'w-[26rem] max-w-[92vw]' : 'w-80 max-w-[92vw]'
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
          {panel === 'chart'  && <ScoreChart />}
          {panel === 'last'   && <LastTrickView />}
        </div>
      </div>
    </>
  )
}
