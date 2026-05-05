import { Layers } from 'lucide-react'

/** Bottom-right: brushed-brass "Last Trick" call-to-action. */
export default function ActionPanel({ onLastTrick }) {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 items-end pointer-events-auto">
      <button
        onClick={onLastTrick}
        className="last-trick-btn inline-flex items-center gap-2 px-7 py-3 rounded-2xl text-sm font-black tracking-wide font-western uppercase transition-all active:scale-95"
        title="Show last trick"
      >
        <span>Last Trick</span>
        <Layers size={18} />
      </button>
    </div>
  )
}
