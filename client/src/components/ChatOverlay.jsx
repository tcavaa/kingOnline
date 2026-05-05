import { useEffect, useRef, useState } from 'react'
import { Send, X, MessageCircle } from 'lucide-react'
import { useGame } from '../context/GameContext'

export default function ChatOverlay({ open, onClose }) {
  const { chatMessages, sendChat, mySeat } = useGame()
  const [text, setText] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [open, chatMessages])

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
           background: 'linear-gradient(180deg, #4a2e1a 0%, #2c1a10 100%)',
           borderLeft: '1px solid rgba(218,165,32,0.4)',
           boxShadow: 'inset 4px 0 0 rgba(0,0,0,0.35)',
           backdropFilter: 'blur(16px)',
         }}>
      <div className="flex items-center justify-between px-4 py-3"
           style={{
             borderBottom: '1px solid rgba(218,165,32,0.32)',
             background: 'linear-gradient(180deg, rgba(255,220,170,0.06), transparent)',
           }}>
        <h3 className="text-sm font-western uppercase tracking-wider inline-flex items-center gap-2"
            style={{ color: '#fde9b8' }}>
          <MessageCircle size={14} style={{ color: '#f0c75a' }} /> Saloon Talk
        </h3>
        <button onClick={onClose}
                className="hover:opacity-80"
                style={{ color: 'rgba(245,233,207,0.7)' }}>
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {chatMessages.length === 0 && (
          <div className="text-center text-xs mt-6 font-typewriter italic"
               style={{ color: 'rgba(245,233,207,0.45)' }}>
            ─── nothin' but tumbleweeds ───
          </div>
        )}
        {chatMessages.map((m, i) => {
          const isMine = m.seat === mySeat
          return (
            <div key={i} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
              <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0"
                   style={{ background: '#000', border: '1.5px solid rgba(218,165,32,0.55)' }}>
                <img src={m.avatar || '/avatar-default.png'} alt=""
                     className="w-full h-full object-cover" />
              </div>
              <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-[12px] leading-snug font-typewriter ${isMine ? '' : ''}`}
                   style={{
                     background: isMine
                       ? 'linear-gradient(180deg, #6f4e37 0%, #4a2e1a 100%)'
                       : 'linear-gradient(180deg, rgba(245,233,207,0.95), rgba(220,200,165,0.92))',
                     color:  isMine ? '#fde9b8' : '#3a2410',
                     border: isMine
                       ? '1px solid rgba(240,199,90,0.45)'
                       : '1px solid rgba(120,70,30,0.45)',
                     boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
                   }}>
                <div className="text-[10px] font-western uppercase tracking-wider mb-0.5"
                     style={{
                       color: isMine ? 'rgba(240,199,90,0.85)' : 'rgba(120,70,30,0.85)',
                     }}>
                  {m.name}
                </div>
                <div>{m.message}</div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={submit} className="p-3 flex gap-2"
            style={{
              borderTop: '1px solid rgba(218,165,32,0.32)',
              background: 'linear-gradient(0deg, rgba(0,0,0,0.25), transparent)',
            }}>
        <input
          type="text" maxLength={240}
          value={text} onChange={e => setText(e.target.value)}
          placeholder="Pipe up, partner…"
          className="casino-input flex-1 px-3 py-2 text-sm focus:outline-none"
        />
        <button type="submit"
                className="px-3 rounded-lg inline-flex items-center justify-center font-western tracking-wider transition-all active:scale-95"
                style={{
                  background: 'linear-gradient(180deg, #f0c75a 0%, #b8821b 100%)',
                  border: '1px solid rgba(255,244,200,0.5)',
                  color: '#3a2410',
                  boxShadow: '0 2px 0 rgba(80,50,10,0.6), inset 0 1px 0 rgba(255,255,255,0.4)',
                }}>
          <Send size={16} />
        </button>
      </form>
    </div>
    </>
  )
}
