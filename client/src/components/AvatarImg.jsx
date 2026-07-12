/**
 * Round player avatar with the default-portrait fallback. One shared
 * implementation for every avatar circle in the app (chat rows, seats,
 * lobby profile, leaderboard panels…).
 *
 *  size — diameter in px
 *  ring — CSS color for the border ring (null = no ring); width scales
 *         with size (≥2px, ~size/16)
 */
export default function AvatarImg({ avatar, size = 24, ring = null, className = '' }) {
  const src = avatar || '/avatar-default.png'
  const border = ring ? `${Math.max(2, Math.round(size / 16))}px solid ${ring}` : undefined
  return (
    <div className={`rounded-full overflow-hidden flex items-center justify-center bg-black flex-shrink-0 ${className}`}
         style={{ width: size, height: size, border }}>
      <img src={src} alt="" className="w-full h-full object-cover" />
    </div>
  )
}
