/**
 * Tiny pill that hovers above the table when we're stuck waiting for another
 * player to do something (play a card, choose a game type, etc.).
 */
export default function WaitingChip({ label, name }) {
  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-15 pointer-events-none">
      <div className="western-pill px-5 py-2 text-xs font-typewriter">
        Waiting for <span className="font-western font-bold text-amber">{name ?? '…'}</span> {label}
      </div>
    </div>
  )
}
