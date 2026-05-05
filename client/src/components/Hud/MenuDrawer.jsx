import { ClipboardList, Map, LineChart, Layers, X } from 'lucide-react'

const ITEMS = [
  { id: 'scores', Icon: ClipboardList, label: 'Tally Sheet'  },
  { id: 'matrix', Icon: Map,           label: 'Hands Played' },
  { id: 'chart',  Icon: LineChart,     label: 'Tally Trail'  },
  { id: 'last',   Icon: Layers,        label: 'Last Trick'   },
]

/** Left-side slide-in drawer triggered by the hamburger pill. */
export default function MenuDrawer({ open, onClose, onPick }) {
  if (!open) return null
  return (
    <>
      <div className="drawer-scrim left" onClick={onClose} />
      <div className="absolute top-0 left-0 bottom-0 w-64 max-w-[80vw] z-30 overflow-y-auto pointer-events-auto bg-leather"
           style={{ borderRight: '1px solid rgba(218,165,32,0.4)', backdropFilter: 'blur(16px)' }}>
        <div className="p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-western uppercase tracking-wider text-cream">Menu</h3>
            <button onClick={onClose} className="hover:opacity-80 text-cream-soft"><X size={18} /></button>
          </div>
          {ITEMS.map(({ id, Icon, label }) => (
            <button
              key={id}
              onClick={() => { onPick(id); onClose() }}
              className="menu-drawer-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-western uppercase tracking-wide transition-all active:scale-95"
            >
              <Icon size={18} className="text-amber" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
