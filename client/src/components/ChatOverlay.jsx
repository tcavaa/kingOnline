import { useEffect, useRef, useState } from 'react'
import { Send, X, MessageCircle, Mic, Trash2, Play, Square } from 'lucide-react'
import { useGame } from '../context/GameContext'

const MAX_RECORD_MS = 15 * 1000

/** Small play/stop pill for a received voice clip. */
function VoiceBubble({ url, duration, mine }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  const toggle = () => {
    if (!audioRef.current) {
      const a = new Audio(url)
      a.onended = () => setPlaying(false)
      audioRef.current = a
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      audioRef.current.play().catch(() => { /* blocked — needs a gesture */ })
      setPlaying(true)
    }
  }

  // Stop playback if the bubble unmounts (drawer closed / message pruned).
  useEffect(() => () => { audioRef.current?.pause() }, [])

  const accent = mine ? '#fdf2df' : '#8e2b23'
  return (
    <button onClick={toggle}
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

export default function ChatOverlay({ open, onClose }) {
  const { chatMessages, sendChat, sendVoice, mySeat, players, typingSeats, sendTyping, addToast } = useGame()
  const [text, setText] = useState('')
  const listRef = useRef(null)

  // ── Voice recording ─────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false)
  const [recSecs, setRecSecs]     = useState(0)
  const recRef = useRef(null) // { recorder, chunks, cancelled, startAt, tickId, maxId }

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
      // Chrome/Firefox → webm/opus; iOS Safari → mp4/aac. Receivers play
      // whatever mime tag rides along with the bytes.
      const mime =
        MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported?.('audio/mp4') ? 'audio/mp4' : ''
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      const r = { recorder, chunks: [], cancelled: false, startAt: Date.now() }
      recRef.current = r

      recorder.ondataavailable = (e) => { if (e.data && e.data.size) r.chunks.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
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
      r.tickId = setInterval(() => setRecSecs(s => s + 1), 1000)
      r.maxId  = setTimeout(() => stopRecording(false), MAX_RECORD_MS)
    } catch {
      addToast('მიკროფონზე წვდომა ვერ მოხერხდა.', 'error')
    }
  }

  // Closing the drawer mid-recording throws the clip away.
  useEffect(() => () => stopRecording(true), [])

  const typingPlayers = Object.keys(typingSeats || {})
    .map(s => players.find(p => p.seat === Number(s)))
    .filter(Boolean)

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, chatMessages, typingPlayers.length])

  if (!open) return null

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    sendChat(text)
    setText('')
  }

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="absolute top-0 right-0 bottom-0 w-80 max-w-[92vw] z-30 flex flex-col pointer-events-auto"
         style={{
           background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
           borderLeft: '1px solid rgba(122,83,44,0.4)',
           boxShadow: 'inset 4px 0 0 rgba(0,0,0,0.35)',
           backdropFilter: 'blur(16px)',
         }}>
      <div className="flex items-center justify-between px-4 py-3"
           style={{
             borderBottom: '1px solid rgba(122,83,44,0.32)',
             background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent)',
           }}>
        <h3 className="text-sm font-western uppercase tracking-wider inline-flex items-center gap-2"
            style={{ color: '#3b2314' }}>
          <MessageCircle size={14} style={{ color: '#8e2b23' }} /> სუფრის საუბარი
        </h3>
        <button onClick={onClose}
                className="hover:opacity-80"
                style={{ color: 'rgba(59,35,20,0.7)' }}>
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {chatMessages.length === 0 && (
          <div className="text-center text-xs mt-6 font-typewriter italic"
               style={{ color: 'rgba(59,35,20,0.45)' }}>
            ─── ჯერ სიჩუმეა… ───
          </div>
        )}
        {chatMessages.map((m, i) => {
          const isMine = m.seat === mySeat
          return (
            <div key={i} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                   style={{ background: '#000', border: '1.5px solid rgba(142,43,35,0.55)' }}>
                <img src={m.avatar || '/avatar-default.png'} alt=""
                     className="w-full h-full object-cover" />
              </div>
              <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-[12px] leading-snug font-typewriter ${isMine ? '' : ''}`}
                   style={{
                     background: isMine
                       ? 'linear-gradient(180deg, #8e2b23 0%, #6f1f1a 100%)'
                       : 'linear-gradient(180deg, rgba(245,233,207,0.95), rgba(220,200,165,0.92))',
                     color:  isMine ? '#fdf2df' : '#3a2410',
                     border: isMine
                       ? '1px solid rgba(255,226,190,0.4)'
                       : '1px solid rgba(120,70,30,0.45)',
                     boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
                   }}>
                <div className="text-[10px] font-western uppercase tracking-wider mb-0.5"
                     style={{
                       color: isMine ? 'rgba(255,226,190,0.85)' : 'rgba(120,70,30,0.85)',
                     }}>
                  {m.name}
                </div>
                {m.type === 'voice'
                  ? <VoiceBubble url={m.url} duration={m.duration} mine={isMine} />
                  : <div>{m.message}</div>}
              </div>
            </div>
          )
        })}
        {typingPlayers.map(p => (
          <div key={`typing-${p.seat}`} className="flex gap-2">
            <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                 style={{ background: '#000', border: '1.5px solid rgba(142,43,35,0.55)' }}>
              <img src={p.avatar || '/avatar-default.png'} alt=""
                   className="w-full h-full object-cover" />
            </div>
            <div className="rounded-lg px-3 py-1.5 text-[12px] leading-snug font-typewriter"
                 style={{
                   background: 'linear-gradient(180deg, rgba(245,233,207,0.95), rgba(220,200,165,0.92))',
                   color: '#3a2410',
                   border: '1px solid rgba(120,70,30,0.45)',
                   boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
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

      <form onSubmit={submit} className="p-3 flex gap-2"
            style={{
              borderTop: '1px solid rgba(122,83,44,0.32)',
              background: 'linear-gradient(0deg, rgba(122,83,44,0.1), transparent)',
            }}>
        {recording ? (
          <div className="casino-input flex-1 px-3 py-2 text-sm flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-typewriter" style={{ color: '#a5372b' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#a5372b' }} />
              იწერება… {recSecs}/15 წმ
            </span>
            <button type="button" onClick={() => stopRecording(true)} title="გაუქმება"
                    className="hover:opacity-75" style={{ color: 'rgba(59,35,20,0.6)' }}>
              <Trash2 size={15} />
            </button>
          </div>
        ) : (
          <input
            type="text" maxLength={240}
            value={text} onChange={e => { setText(e.target.value); if (e.target.value) sendTyping() }}
            placeholder="თქვი რამე, ძმაო…"
            className="casino-input flex-1 px-3 py-2 text-sm focus:outline-none"
          />
        )}
        <button type="button" onClick={startRecording}
                title={recording ? 'გაგზავნა' : 'ხმოვანი შეტყობინება'}
                className="px-3 rounded-lg inline-flex items-center justify-center transition-all active:scale-95"
                style={recording ? {
                  background: 'linear-gradient(180deg, #a03428 0%, #711f18 100%)',
                  border: '1px solid rgba(255,226,190,0.45)',
                  color: '#fdf2df',
                  boxShadow: '0 2px 0 rgba(58,20,12,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
                } : {
                  background: 'linear-gradient(180deg, rgba(255,250,238,0.9), rgba(238,221,189,0.92))',
                  border: '1px solid rgba(122,83,44,0.45)',
                  color: '#8e2b23',
                  boxShadow: '0 2px 0 rgba(122,83,44,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
                }}>
          {recording ? <Send size={16} /> : <Mic size={16} />}
        </button>
        {!recording && (
          <button type="submit"
                  className="px-3 rounded-lg inline-flex items-center justify-center font-western tracking-wider transition-all active:scale-95"
                  style={{
                    background: 'linear-gradient(180deg, #e3b04b 0%, #c08a26 100%)',
                    border: '1px solid rgba(255,244,200,0.5)',
                    color: '#3b2314',
                    boxShadow: '0 2px 0 rgba(80,50,10,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
                  }}>
            <Send size={16} />
          </button>
        )}
      </form>
    </div>
    </>
  )
}
