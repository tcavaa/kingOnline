/**
 * Mobile-only "please rotate" overlay. The CSS in `.rotate-banner` hides it
 * automatically on landscape or any viewport >= 600 px wide, so desktop and
 * tablets never see it.
 */
export default function RotatePrompt() {
  return (
    <div className="rotate-banner">
      <div className="text-center">
        <div className="text-5xl mb-3" aria-hidden="true">↻</div>
        <p className="font-western text-xl tracking-wider uppercase mb-1">Turn yer device</p>
        <p className="font-typewriter text-sm" style={{ color: 'rgba(245,233,207,0.7)' }}>
          The saloon plays best in landscape.
        </p>
      </div>
    </div>
  )
}
