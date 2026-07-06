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
        <p className="font-western text-xl tracking-wider uppercase mb-1">მოაბრუნე ტელეფონი გვერდულად</p>
        <p className="font-typewriter text-sm" style={{ color: 'rgba(59,35,20,0.7)' }}>
          თამაში ლანდშაფტურ რეჟიმშია.
        </p>
      </div>
    </div>
  )
}
