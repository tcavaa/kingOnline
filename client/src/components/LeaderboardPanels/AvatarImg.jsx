/** Round avatar with the cowboy default fallback. */
export default function AvatarImg({ avatar, size = 24, ring = null }) {
  const src = avatar || '/avatar-default.png'
  const border = ring ? `${Math.max(2, Math.round(size / 16))}px solid ${ring}` : undefined
  return (
    <div className="rounded-full overflow-hidden flex items-center justify-center bg-black"
         style={{ width: size, height: size, border }}>
      <img src={src} alt="" className="w-full h-full object-cover" />
    </div>
  )
}
