import { Flag, DoorOpen, Check, X } from 'lucide-react'
import { useGame } from '../../context/GameContext'

/**
 * Quit-round / surrender coordination UI. Three faces:
 *  1. Local confirm dialog before the proposal is sent (confirmKind set).
 *  2. Vote dialog shown to the two other players while a proposal is live.
 *  3. "Waiting for votes" pill for the proposer (and for a voter who
 *     already accepted while the third player decides).
 */
export default function QuitModal({ confirmKind, onCloseConfirm }) {
  const { quitProposal, proposeQuit, voteQuit, mySeat, chosenGameType } = useGame()

  const isPositiveRound = typeof chosenGameType === 'string' && chosenGameType.startsWith('P')

  // ── 2/3: a proposal is live ──────────────────────────────────────────────
  if (quitProposal) {
    const { kind, proposerSeat, proposerName, acceptedSeats = [] } = quitProposal
    const isMine    = proposerSeat === mySeat
    const iAccepted = acceptedSeats.includes(mySeat)
    const agreed    = Math.max(0, acceptedSeats.length - 1) // proposer doesn't count as a vote

    if (isMine || iAccepted) {
      return (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
          <div className="western-pill px-5 py-2 text-xs font-typewriter">
            {kind === 'game' ? 'Surrender' : 'Fold the hand'} — waiting for the table to agree… ({agreed}/2)
          </div>
        </div>
      )
    }

    const Icon = kind === 'game' ? Flag : DoorOpen
    const title = kind === 'game' ? 'Surrender?' : 'Fold This Hand?'
    const body = kind === 'game'
      ? `${proposerName} wants to surrender — the game ends now and whoever tops the tally sheet takes the win.`
      : isPositiveRound
        ? `${proposerName} wants to fold this hand — they forfeit it, and you and the other player split the +80.`
        : `${proposerName} wants to fold this hand — they take the full -40 and the table moves on to the next hand.`

    return (
      <div
        className="absolute inset-0 flex items-center justify-center z-40 px-4"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(28,16,10,0.75) 0%, rgba(10,5,2,0.92) 100%)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div className="w-full max-w-sm rounded-2xl p-4 lg:p-5 western-panel">
          <div className="flex items-center gap-2 mb-2">
            <Icon size={18} style={{ color: '#f0c75a' }} />
            <h2 className="text-sm lg:text-base font-western uppercase tracking-wide" style={{ color: '#fde9b8' }}>
              {title}
            </h2>
          </div>
          <p className="text-xs lg:text-sm font-typewriter mb-4" style={{ color: 'rgba(245,233,207,0.85)' }}>
            {body}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => voteQuit(true)}
              className="flex-1 py-2 rounded-lg font-western uppercase text-[11px] lg:text-sm tracking-wider transition-all active:scale-95 casino-btn-gold inline-flex items-center justify-center gap-1.5"
            >
              <Check size={14} /> Agree
            </button>
            <button
              onClick={() => voteQuit(false)}
              className="flex-1 py-2 rounded-lg font-western uppercase text-[11px] lg:text-sm tracking-wider transition-all active:scale-95 inline-flex items-center justify-center gap-1.5"
              style={{
                background: 'linear-gradient(180deg, rgba(74,46,26,0.85), rgba(44,26,16,0.85))',
                border: '1px solid rgba(218,165,32,0.35)',
                color: '#fde9b8',
              }}
            >
              <X size={14} /> Refuse
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 1: local confirmation before sending the proposal ───────────────────
  if (!confirmKind) return null

  const Icon = confirmKind === 'game' ? Flag : DoorOpen
  const title = confirmKind === 'game' ? 'Surrender the Game?' : 'Fold This Hand?'
  const body = confirmKind === 'game'
    ? 'The game ends immediately and whoever leads the tally sheet takes the win. Both other players must agree.'
    : isPositiveRound
      ? 'You forfeit this hand — the other two players split the +80 between them. Both must agree.'
      : 'You take this hand’s full -40 and the table moves on to the next hand. Both other players must agree.'

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-40 px-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(28,16,10,0.75) 0%, rgba(10,5,2,0.92) 100%)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div className="w-full max-w-sm rounded-2xl p-4 lg:p-5 western-panel">
        <div className="flex items-center gap-2 mb-2">
          <Icon size={18} style={{ color: '#f0c75a' }} />
          <h2 className="text-sm lg:text-base font-western uppercase tracking-wide" style={{ color: '#fde9b8' }}>
            {title}
          </h2>
        </div>
        <p className="text-xs lg:text-sm font-typewriter mb-4" style={{ color: 'rgba(245,233,207,0.85)' }}>
          {body}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { proposeQuit(confirmKind); onCloseConfirm() }}
            className="flex-1 py-2 rounded-lg font-western uppercase text-[11px] lg:text-sm tracking-wider transition-all active:scale-95 casino-btn-gold"
          >
            {confirmKind === 'game' ? 'Propose Surrender' : 'Propose Fold'}
          </button>
          <button
            onClick={onCloseConfirm}
            className="flex-1 py-2 rounded-lg font-western uppercase text-[11px] lg:text-sm tracking-wider transition-all active:scale-95"
            style={{
              background: 'linear-gradient(180deg, rgba(74,46,26,0.85), rgba(44,26,16,0.85))',
              border: '1px solid rgba(218,165,32,0.35)',
              color: '#fde9b8',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
