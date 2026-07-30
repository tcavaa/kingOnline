import { useEffect, useRef, useState } from 'react'
import { Send, X, MessageCircle, Mic, Trash2, Play, Square, Smile } from 'lucide-react'
import { useDurak } from './DurakContext'
import { voicePlayer } from '../lib/voicePlayer'
import AvatarImg from '../components/AvatarImg'

// Same chat experience as the King table — text, quick emojis, ephemeral
// voice clips, typing indicator — riding the durak:* events.

const MAX_RECORD_MS = 15 * 1000

const CHAT_EMOJIS = [
  '😀', '😂', '🤣', '😎', '😉', '😜', '🥳', '😱',
  '😡', '🤔', '😴', '🥲', '👍', '👎', '👏', '💪',
  '🙏', '❤️', '💔', '🔥', '🍷', '🍇', '🃏', '🎉',
]

function VoiceBubble({ url, duration, mine }) {
  const [playingUrl, setPlayingUrl] = useState(() => voicePlayer.playingUrl())
  useEffect(() => voicePlayer.subscribe(setPlayingUrl), [])
  const playing = playingUrl === url
  const accent = mine ? '#fdf2df' : '#1f3d2e'
  return (
    <button onClick={() => voicePlayer.toggle(url)}
            className="inline-flex items-center gap-2 py-0.5 active:scale-95 transition-all"
            style={{ color: 'inherit' }}>
      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ border: `1.5px solid ${accent}`, color: accent }}>
        {playing ? <Square size={11} /> : <Play size={11} style={{ marginLeft: 1 }} />}
      </span>
      <span className="tracking-[0.2em] select-none" style={{ opacity: 0.75 }}>▂▄▆▄▂▄▂</span>
      <span className="text-[10px] font-mono" style={{ opacity: 0.8 }}>{duration}″</span>
    </button>
  )
}

export default function DurakChat({ open, onClose }) {
  const { room, mySeat, chatMessages, typingSeats, sendChat, sendVoice, sendTyping, addToast } = useDurak()
  const [text, setText] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const listRef = useRef(null)

  const players = room?.players || []

  const addEmoji = (e) => {
    setText((t) => (t.length + e.length <= 240 ? t + e : t))
    sendTyping()
  }

  // ── Voice recording (King's recorder, verbatim behavior) ────────────────
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs] = useState(0)
  const recRef = useRef(null)

  const stopRecording = (cancel = false) => {
    const r = recRef.current
    if (!r) return
    r.cancelled = cancel
    if (r.recorder.state !== 'inactive') r.recorder.stop()
  }

  const startRecording = async () => {
    if (recording) { stopRecording(false); return }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined') {
      addToast('ამ ბრაუზერში ხმის ჩაწერა არ არის მხარდაჭერილი.', 'error')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime =
        MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      const r = { recorder, chunks: [], cancelled: false, startAt: Date.now() }
      recRef.current = r

      recorder.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        clearInterval(r.tickId)
        clearTimeout(r.maxId)
        setRecording(false)
        setRecSecs(0)
        recRef.current = null
        if (r.cancelled || !r.chunks.length) return
        const durationSec = Math.max(1, Math.round((Date.now() - r.startAt) / 1000))
        const blob = new Blob(r.chunks, { type: recorder.mimeType || 'audio/webm' })
        sendVoice(blob, durationSec)
      }

      recorder.start()
      setRecording(true)
      setRecSecs(0)
      r.tickId = setInterval(() => setRecSecs((s) => s + 1), 1000)
      r.maxId = setTimeout(() => stopRecording(false), MAX_RECORD_MS)
    } catch {
      addToast('მიკროფონზე წვდომა ვერ მოხერხდა.', 'error')
    }
  }

  useEffect(() => () => stopRecording(true), [])

  const typingPlayers = Object.keys(typingSeats || {})
    .map((s) => players.find((p) => p.seat === Number(s)))
    .filter((p) => p && p.seat !== mySeat)

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, chatMessages, typingPlayers.length])

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    sendChat(text)
    setText('')
    setEmojiOpen(false)
  }

  return (
    <>
      {open && <div className="durak-drawer-backdrop" onClick={onClose} />}
      <div className={`durak-drawer ${open ? 'open' : ''}`}>
        <div className="flex items-center justify-between px-4 py-3"
             style={{ borderBottom: '2px solid rgba(122,83,44,0.35)' }}>
          <h3 className="text-sm font-western uppercase tracking-wider inline-flex items-center gap-2"
              style={{ color: '#3b2314' }}>
            <MessageCircle size={14} style={{ color: '#1f3d2e' }} /> სუფრის საუბარი
          </h3>
          <button onClick={onClose} style={{ color: 'rgba(59,35,20,0.7)' }}><X size={16} /></button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {chatMessages.length === 0 && (
            <div className="text-center text-xs mt-6 font-typewriter italic" style={{ color: 'rgba(59,35,20,0.45)' }}>
              ─── ჯერ სიჩუმეა… ───
            </div>
          )}
          {chatMessages.map((m, i) => {
            const isMine = m.seat === mySeat
            return (
              <div key={`${m.seat}:${m.at ?? i}`} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                <AvatarImg avatar={m.avatar} size={28} ring="rgba(31,61,46,0.55)" />
                <div className="max-w-[75%] rounded-lg px-3 py-1.5 text-[12px] leading-snug font-typewriter"
                     style={{
                       background: isMine
                         ? 'linear-gradient(180deg, #2c5642 0%, #1f3d2e 100%)'
                         : 'linear-gradient(180deg, rgba(245,233,207,0.95), rgba(220,200,165,0.92))',
                       color: isMine ? '#f4e8cf' : '#3a2410',
                       border: isMine ? '1px solid rgba(244,232,207,0.4)' : '1px solid rgba(120,70,30,0.45)',
                       boxShadow: '0 2px 0 rgba(0,0,0,0.25)',
                     }}>
                  <div className="text-[10px] font-western uppercase tracking-wider mb-0.5"
                       style={{ color: isMine ? 'rgba(244,232,207,0.85)' : 'rgba(120,70,30,0.85)' }}>
                    {m.name}
                  </div>
                  {m.type === 'voice'
                    ? <VoiceBubble url={m.url} duration={m.duration} mine={isMine} />
                    : <div style={{ overflowWrap: 'anywhere' }}>{m.message}</div>}
                </div>
              </div>
            )
          })}
          {typingPlayers.map((p) => (
            <div key={`typing-${p.seat}`} className="flex gap-2">
              <AvatarImg avatar={p.avatar} size={28} ring="rgba(31,61,46,0.55)" />
              <div className="rounded-lg px-3 py-1.5 text-[12px] font-typewriter"
                   style={{
                     background: 'linear-gradient(180deg, rgba(245,233,207,0.95), rgba(220,200,165,0.92))',
                     color: '#3a2410', border: '1px solid rgba(120,70,30,0.45)',
                   }}>
                <div className="text-[10px] font-western uppercase tracking-wider mb-0.5"
                     style={{ color: 'rgba(120,70,30,0.85)' }}>
                  {p.name}
                </div>
                <div className="animate-pulse tracking-widest">● ● ●</div>
              </div>
            </div>
          ))}
        </div>

        {emojiOpen && !recording && (
          <div className="px-3 pb-1 pt-2 grid grid-cols-8 gap-1"
               style={{ borderTop: '1px solid rgba(122,83,44,0.32)', background: 'rgba(255,250,238,0.55)' }}>
            {CHAT_EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => addEmoji(e)}
                      className="h-8 rounded-md text-lg leading-none flex items-center justify-center transition-all active:scale-90 hover:bg-black/5">
                {e}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="p-3 flex gap-2"
              style={{ borderTop: emojiOpen && !recording ? 'none' : '1px solid rgba(122,83,44,0.32)' }}>
          {!recording && (
            <button type="button" onClick={() => setEmojiOpen((o) => !o)} title="ემოჯი"
                    className="px-2.5 rounded-lg inline-flex items-center justify-center transition-all active:scale-95"
                    style={{
                      background: emojiOpen ? 'rgba(31,61,46,0.15)' : 'rgba(255,250,238,0.9)',
                      border: emojiOpen ? '1px solid rgba(31,61,46,0.55)' : '1px solid rgba(122,83,44,0.45)',
                      color: '#1f3d2e',
                    }}>
              <Smile size={16} />
            </button>
          )}
          {recording ? (
            <div className="flex-1 px-3 py-2 text-sm flex items-center justify-between rounded-lg"
                 style={{ background: 'rgba(255,250,235,0.9)', border: '1px solid rgba(122,83,44,0.4)' }}>
              <span className="inline-flex items-center gap-2 font-typewriter" style={{ color: '#a5372b' }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#a5372b' }} />
                იწერება… {recSecs}/15 წმ
              </span>
              <button type="button" onClick={() => stopRecording(true)} title="გაუქმება"
                      style={{ color: 'rgba(59,35,20,0.6)' }}>
                <Trash2 size={15} />
              </button>
            </div>
          ) : (
            <input
              type="text" maxLength={240}
              value={text}
              onChange={(e) => { setText(e.target.value); if (e.target.value) sendTyping() }}
              placeholder="თქვი რამე…"
              className="flex-1 px-3 py-2 rounded-lg text-sm font-typewriter focus:outline-none"
              style={{ background: 'rgba(255,250,235,0.9)', border: '1px solid rgba(122,83,44,0.4)', color: '#3b2314' }}
            />
          )}
          <button type="button" onClick={startRecording}
                  title={recording ? 'გაგზავნა' : 'ხმოვანი შეტყობინება'}
                  className="px-3 rounded-lg inline-flex items-center justify-center transition-all active:scale-95"
                  style={recording ? {
                    background: 'linear-gradient(180deg, #a03428 0%, #711f18 100%)',
                    border: '1px solid rgba(255,226,190,0.45)', color: '#fdf2df',
                  } : {
                    background: 'rgba(255,250,238,0.9)',
                    border: '1px solid rgba(122,83,44,0.45)', color: '#1f3d2e',
                  }}>
            {recording ? <Send size={16} /> : <Mic size={16} />}
          </button>
          {!recording && (
            <button type="submit"
                    className="px-3 rounded-lg inline-flex items-center justify-center transition-all active:scale-95"
                    style={{ background: '#1f3d2e', border: '1px solid rgba(20,40,30,0.6)', color: '#f4e8cf' }}>
              <Send size={16} />
            </button>
          )}
        </form>
      </div>
    </>
  )
}
