/**
 * Compact top-anchored panel for the Spin King betting phases (auction /
 * pledge). Unlike ModalShell there is NO dimmed backdrop: the player must
 * be able to study their own hand while deciding how much to bet, so the
 * bottom of the table (the card fan) stays fully visible. Cards aren't
 * clickable outside the playing phase, so overlap is a non-issue for input.
 */
export default function FloatingPanel({ children, className = '' }) {
  return (
    <div className="absolute inset-x-0 z-40 flex justify-center pointer-events-none px-2"
         style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}>
      <div className={`pointer-events-auto rounded-2xl western-panel w-full overflow-y-auto p-3 lg:p-5 text-center ${className}`}
           style={{ maxHeight: '56vh', boxShadow: '0 10px 34px rgba(20,12,6,0.45)' }}>
        {children}
      </div>
    </div>
  )
}
