import {
  Menu, ChevronDown, MessageCircle, Settings, SignalHigh, Star,
} from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { getGameType } from '../../constants/gameTypes'
import { SuitIcon, SUIT_NAMES } from '../Icons'
import { Pill } from './Pill'

// Georgian display names for the suit codes / phase codes (display-only;
// falls back to the original English value for anything unmapped).
const SUIT_NAMES_KA = { H: 'გული', D: 'აგური', S: 'ყვავი', C: 'ჯვარი' }
const PHASE_LABELS_KA = {
  waiting:         'მოლოდინი',
  type_selection:  'თამაშის არჩევა',
  trump_selection: 'კოზირის არჩევა',
  discard:         'კარტების გადადება',
  playing:         'თამაში',
  round_end:       'ხელი დასრულდა',
  game_over:       'თამაშის დასასრული',
}

/**
 * Top bar across the canvas: hamburger menu, room name, round / game-type /
 * trump pills, and the chat / settings / latency icons on the right.
 */
export default function TopBar({ onToggleMenu, onToggleScores, onToggleChat }) {
  const { round, chosenGameType, trumpSuit, roomCode, gamePhase } = useGame()
  const gt = getGameType(chosenGameType)
  const TypeIcon = gt?.Icon

  return (
    <div className="absolute top-0 inset-x-0 z-20 px-3 lg:px-4 pt-3 lg:pt-4 flex items-start justify-between gap-2 pointer-events-none">
      {/* Left: menu + room name */}
      <div className="flex items-center gap-1.5 lg:gap-2 pointer-events-auto min-w-0">
        <Pill onClick={onToggleMenu} className="px-2 lg:px-3" title="მენიუ">
          <Menu size={16} />
        </Pill>
        <Pill className="min-w-0 lg:min-w-[180px] justify-between">
          <div className="flex flex-col items-start leading-tight min-w-0">
            <span className="text-[9px] lg:text-[10px] uppercase tracking-widest text-amber-dim">ოთახი</span>
            <span className="text-xs lg:text-sm font-bold truncate max-w-[5.5rem] lg:max-w-none">{roomCode || 'კლასიკური ოთახი'}</span>
          </div>
          <ChevronDown size={12} className="text-amber-dim shrink-0" />
        </Pill>
      </div>

      {/* Center: round + chosen type + trump */}
      <div className="flex items-center gap-1.5 lg:gap-2 pointer-events-auto min-w-0">
        <Pill className="px-2 lg:px-3"
              style={{
                background: 'linear-gradient(180deg, #f8efdd 0%, #ecd9b6 100%)',
                border: '1px solid rgba(142,43,35,0.55)',
                boxShadow: '0 2px 0 rgba(58,36,24,0.25), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}>
          <Star size={12} fill="#8e2b23" className="text-amber" />
          <div className="flex flex-col items-start leading-tight">
            <span className="text-[8px] lg:text-[9px] uppercase tracking-[0.2em] font-western"
                  style={{ color: 'rgba(142,43,35,0.85)' }}>ხელი</span>
            <span className="font-western text-xs lg:text-sm" style={{ color: '#3b2314' }}>
              <span className="text-sm lg:text-base text-amber">{round}</span>
              <span className="opacity-70 mx-0.5">/</span>
              <span>27</span>
            </span>
          </div>
        </Pill>

        {gt && (
          <Pill className="px-2 lg:px-3 min-w-0"
                style={{
                  background: `linear-gradient(180deg, ${gt.color}33, ${gt.color}11)`,
                  border: `1px solid ${gt.color}88`,
                  color: '#3b2314',
                  boxShadow: `0 2px 0 rgba(58,36,24,0.25), 0 0 14px ${gt.color}33, inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}>
            {TypeIcon && <TypeIcon size={12} style={{ color: gt.color }} />}
            <span className="font-western uppercase tracking-wide text-[10px] lg:text-xs truncate max-w-[5rem] lg:max-w-none">{gt.name}</span>
          </Pill>
        )}

        {trumpSuit && (
          <Pill className="px-2 lg:px-3 trump-sparkle"
                style={{
                  background: 'linear-gradient(180deg, rgba(142,43,35,0.22), rgba(142,43,35,0.1))',
                  border: '1px solid rgba(142,43,35,0.6)',
                  color: '#3b2314',
                }}>
            <Star size={12} fill="#8e2b23" className="text-amber" />
            <SuitIcon suit={trumpSuit} size={12} mono style={{ color: '#8e2b23' }} />
            <span className="font-western uppercase tracking-wide text-[10px] lg:text-xs">{SUIT_NAMES_KA[trumpSuit] || SUIT_NAMES[trumpSuit]}</span>
          </Pill>
        )}

        {/* The phase pill is informational-only — hide it on landscape
            phones where every pixel of horizontal space is contested. */}
        {gamePhase && (
          <Pill className="px-2 lg:px-3 hide-on-phone-landscape"
                style={{
                  background: 'linear-gradient(180deg, rgba(236,222,196,0.85), rgba(226,208,176,0.9))',
                  border: '1px solid rgba(122,83,44,0.3)',
                  color: 'rgba(59,35,20,0.8)',
                }}>
            <span className="text-[10px] lg:text-[11px] font-typewriter uppercase tracking-wider">
              {PHASE_LABELS_KA[gamePhase] || gamePhase.replace(/_/g, ' ')}
            </span>
          </Pill>
        )}
      </div>

      {/* Right: chat / settings / latency. Latency hides on phone landscape
          (purely diagnostic) so chat + settings stay inside the viewport. */}
      <div className="flex items-center gap-1.5 lg:gap-2 pointer-events-auto">
        <Pill onClick={onToggleChat}   className="px-2 lg:px-3" title="ჩატი"><MessageCircle size={16} /></Pill>
        <Pill onClick={onToggleScores} className="px-2 lg:px-3" title="ქულები"><Settings size={16} /></Pill>
        <Pill className="px-2 lg:px-3 flex-col leading-tight items-end hide-on-phone-landscape" title="კავშირი">
          <SignalHigh size={14} />
          <span className="text-[9px] font-mono text-cream-soft">48ms</span>
        </Pill>
      </div>
    </div>
  )
}
