import { memo } from 'react'
import { Layers } from 'lucide-react'

/** Bottom-right: brushed-brass "Last Trick" call-to-action. */
function ActionPanel({ onLastTrick }) {
  return (
    // On phone landscape we bump the bottom-right inset (`bottom-3 right-3`)
    // a little further from the screen edge so the rounded screen corner
    // (~50 px radius on iPhone) can't visually clip the button.
    <div className="absolute bottom-3 lg:bottom-4 right-3 lg:right-4 z-20 flex flex-col gap-2 items-end pointer-events-auto">
      <button
        onClick={onLastTrick}
        className="last-trick-btn inline-flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-7 py-1.5 lg:py-3 rounded-xl lg:rounded-2xl text-xs lg:text-sm font-black tracking-wide font-western uppercase transition-all active:scale-95"
        title="ბოლოს გასულის ჩვენება"
      >
        {/* Text only on lg+; on phone landscape the button is icon-only so
            it can't push past the right edge of the safe area. */}
        <span className="hidden lg:inline">ბოლოს გასული</span>
        <Layers size={14} className="lg:hidden" />
        <Layers size={18} className="hidden lg:inline" />
      </button>
    </div>
  )
}

// Leaf HUD chrome: props are stable callbacks, so memo() shields it from
// GameLayout's unrelated re-renders (chat traffic, drawer toggles).
export default memo(ActionPanel)
