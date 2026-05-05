import {
  Menu, ChevronDown, MessageCircle, Settings, SignalHigh, Star,
} from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { SuitIcon, SUIT_NAMES } from '../Icons'
import { Pill } from './Pill'

/**
 * Top bar across the canvas: hamburger menu, room name, round / game-type /
 * trump pills, and the chat / settings / latency icons on the right.
 */
export default function TopBar({ onToggleMenu, onToggleScores, onToggleChat }) {
  const { round, chosenGameType, trumpSuit, roomCode, gamePhase } = useGame()
  const gt = getGameType(chosenGameType)
  const TypeIcon = gt?.Icon

  return (
    <div className="absolute top-0 inset-x-0 z-20 px-4 pt-4 flex items-start justify-between pointer-events-none">
      {/* Left: menu + room name */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <Pill onClick={onToggleMenu} className="px-3" title="Menu">
          <Menu size={18} />
        </Pill>
        <Pill className="min-w-[180px] justify-between">
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-widest text-amber-dim">Room</span>
            <span className="text-sm font-bold">{roomCode || 'Classic Room'}</span>
          </div>
          <ChevronDown size={14} className="text-amber-dim" />
        </Pill>
      </div>

      {/* Center: round + chosen type + trump */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <Pill className="px-3"
              style={{
                background: 'linear-gradient(180deg, #6f4e37 0%, #3a2316 100%)',
                border: '1px solid rgba(240,199,90,0.55)',
                boxShadow: '0 2px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,220,170,0.18)',
              }}>
          <Star size={14} fill="#f0c75a" className="text-amber" />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[9px] uppercase tracking-[0.2em] font-western"
                  style={{ color: 'rgba(240,199,90,0.85)' }}>Hand</span>
            <span className="font-western text-sm" style={{ color: '#fff8e6' }}>
              <span className="text-base text-amber">{round}</span>
              <span className="opacity-70 mx-0.5">/</span>
              <span>27</span>
            </span>
          </div>
        </Pill>

        {gt && (
          <Pill className="px-3"
                style={{
                  background: `linear-gradient(180deg, ${gt.color}33, ${gt.color}11)`,
                  border: `1px solid ${gt.color}88`,
                  color: '#fff8e6',
                  boxShadow: `0 2px 0 rgba(0,0,0,0.5), 0 0 14px ${gt.color}33, inset 0 1px 0 rgba(255,220,170,0.15)`,
                }}>
            {TypeIcon && <TypeIcon size={14} style={{ color: gt.color }} />}
            <span className="font-western uppercase tracking-wide text-xs">{gt.name}</span>
          </Pill>
        )}

        {trumpSuit && (
          <Pill className="px-3 trump-sparkle"
                style={{
                  background: 'linear-gradient(180deg, rgba(240,199,90,0.22), rgba(184,130,27,0.18))',
                  border: '1px solid rgba(240,199,90,0.6)',
                  color: '#fff8e6',
                }}>
            <Star size={14} fill="#f0c75a" className="text-amber" />
            <SuitIcon suit={trumpSuit} size={14} mono style={{ color: '#f0c75a' }} />
            <span className="font-western uppercase tracking-wide text-xs">{SUIT_NAMES[trumpSuit]}</span>
          </Pill>
        )}

        {gamePhase && (
          <Pill className="px-3 hidden md:inline-flex"
                style={{
                  background: 'linear-gradient(180deg, rgba(28,16,10,0.85), rgba(15,8,4,0.85))',
                  border: '1px solid rgba(218,165,32,0.3)',
                  color: 'rgba(245,233,207,0.8)',
                }}>
            <span className="text-[11px] font-typewriter uppercase tracking-wider">
              {gamePhase.replace(/_/g, ' ')}
            </span>
          </Pill>
        )}
      </div>

      {/* Right: chat / settings / latency */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <Pill onClick={onToggleChat}   className="px-3" title="Chat"><MessageCircle size={18} /></Pill>
        <Pill onClick={onToggleScores} className="px-3" title="Settings"><Settings size={18} /></Pill>
        <Pill className="px-3 flex-col leading-tight items-end" title="Latency">
          <SignalHigh size={16} />
          <span className="text-[9px] font-mono text-cream-soft">48ms</span>
        </Pill>
      </div>
    </div>
  )
}
