import { Mic, MicOff, PhoneOff, Phone } from 'lucide-react'
import { useGame } from '../../context/GameContext'

/**
 * Top-left voice-chat panel — icon-only buttons + a small participant row.
 *
 * Two visual states:
 *   1. Not joined → single circular phone icon. Press = browser mic
 *      permission prompt + handshake to existing voice peers.
 *   2. Joined → two icons (leave + mute toggle), followed by a horizontal
 *      row of small avatars for every seat currently in voice (incl. own).
 *      Muted seats get a red mic-off badge.
 *
 * The panel is anchored below the TopBar (top-left) so it never collides
 * with the bottom-left Score Board even when all three players are in
 * voice. The label text was dropped in favour of icons + `title=` /
 * `aria-label=` because the previous wide pills doubled the panel's
 * width and made it overlap the table on phones.
 */
const CONNECTION_LABEL = {
  connecting:   'Connecting…',
  reconnecting: 'Reconnecting…',
  failed:       'Connection failed — tap anywhere to retry',
}

export default function VoicePanel() {
  const { voiceState, voiceRoster, voiceSpeaking, joinVoice, leaveVoice, toggleVoiceMute, players, mySeat } = useGame()
  const joined     = !!voiceState?.joined
  const muted      = !!voiceState?.muted
  const error      = voiceState?.error
  const connection = voiceState?.connection || 'idle'

  const roster   = voiceRoster?.participants || []
  const mutedSet = new Set(voiceRoster?.muted || [])
  // Only surface a status line when there's actually a peer we're trying to
  // reach — otherwise "Connecting…" is meaningless when nobody else is in
  // voice yet. `connected` and `idle` are steady states, no label needed.
  const statusLine = joined && roster.length > 1
    ? CONNECTION_LABEL[connection] || null
    : null
  // `voiceSpeaking` is a Set<number>; tolerate undefined during the first
  // render before the provider has initialised it.
  const speakingHas = (seat) => voiceSpeaking && voiceSpeaking.has(seat)

  return (
    <div className="voice-panel">
      <div className="voice-pills">
        {!joined ? (
          <button onClick={joinVoice}
                  className="voice-pill voice-pill-join"
                  title="Join voice chat"
                  aria-label="Join voice chat">
            <Phone size={16} />
          </button>
        ) : (
          <>
            <button onClick={leaveVoice}
                    className="voice-pill voice-pill-leave"
                    title="Leave voice chat"
                    aria-label="Leave voice chat">
              <PhoneOff size={16} />
            </button>
            <button onClick={toggleVoiceMute}
                    className={`voice-pill ${muted ? 'voice-pill-muted' : 'voice-pill-live'}`}
                    title={muted ? 'Unmute mic' : 'Mute mic'}
                    aria-label={muted ? 'Unmute mic' : 'Mute mic'}>
              {muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          </>
        )}
      </div>

      {/* Participant avatars (always rendered when ≥1 seat is in voice, even
          if we're not in voice ourselves — so the table can see who's
          chatting). */}
      {roster.length > 0 && (
        <div className="voice-roster">
          {roster.map(seat => {
            const p = players.find(pp => pp.seat === seat)
            const isMe       = seat === mySeat
            const isMute     = mutedSet.has(seat)
            const isSpeaking = !isMute && speakingHas(seat)
            return (
              <div key={seat}
                   className={`voice-avatar ${isMe ? 'is-me' : ''} ${isSpeaking ? 'speaking' : ''}`}
                   title={p?.name || `Seat ${seat}`}>
                <img src={p?.avatar || '/avatar-default.png'} alt="" />
                {isMute && (
                  <span className="voice-avatar-mute" aria-label="muted">
                    <MicOff size={8} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Transient connection status (connecting / reconnecting / failed).
          Kept distinct from `voice-error` because the latter is hard
          failures from getUserMedia, while this surfaces the WebRTC state
          machine — recoverable with a network change or a tap. */}
      {statusLine && (
        <div className={`voice-status voice-status-${connection}`}>{statusLine}</div>
      )}

      {/* Surface any mic-permission / device errors directly below the
          panel so the user doesn't have to open DevTools to debug. */}
      {error && (
        <div className="voice-error">{error}</div>
      )}
    </div>
  )
}
