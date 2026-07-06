import { Trophy, Award, Medal } from 'lucide-react'
import AvatarImg from './AvatarImg'

const RANK_ICON = [Trophy, Award, Medal]
const RANK_GRAD = [
  { bg: 'linear-gradient(180deg, #ffe28a 0%, #f0a500 60%, #b8821b 100%)', text: '#3a2400' },
  { bg: 'linear-gradient(180deg, #e8eaf0 0%, #a9b3c2 60%, #6e7787 100%)', text: '#212a36' },
  { bg: 'linear-gradient(180deg, #f1c39a 0%, #cd7f32 60%, #8a4d18 100%)', text: '#33170a' },
]
const PODIUM_HEIGHT = [180, 130, 100]

function PodiumStep({ player, rank }) {
  const Icon = RANK_ICON[rank]
  const grad = RANK_GRAD[rank]
  return (
    <div className="flex flex-col items-center gap-2 flex-1">
      <div className="flex flex-col items-center">
        {rank === 0 && (
          <Trophy size={48} className="parade-pulse"
                  style={{ color: '#b98a2f', filter: 'drop-shadow(0 0 16px rgba(185,138,47,0.55))' }} />
        )}
        <div className="mt-2">
          <AvatarImg avatar={player?.avatar} size={64} ring="#b98a2f" />
        </div>
        <div className="mt-1 text-sm font-bold text-ink">{player?.name ?? '—'}</div>
        {player && (
          <div className="text-[11px] font-mono score-pos-soft">
            {(player.score > 0 ? '+' : '') + (player.score ?? 0)}
          </div>
        )}
      </div>
      <div className="w-full rounded-t-xl flex items-center justify-center font-black"
           style={{
             height: PODIUM_HEIGHT[rank],
             background: grad.bg,
             color: grad.text,
             boxShadow: 'inset 0 4px 0 rgba(255,255,255,0.18), 0 6px 24px rgba(58,36,24,0.25)',
             border: '1px solid rgba(58,36,24,0.3)',
           }}>
        <div className="flex flex-col items-center">
          {Icon && <Icon size={28} />}
          <span className="text-3xl">{rank + 1}</span>
        </div>
      </div>
    </div>
  )
}

/** 1st in the middle, 2nd on the left, 3rd on the right. */
export default function PodiumView({ game, sortedPlayers }) {
  const arr   = [sortedPlayers[1], sortedPlayers[0], sortedPlayers[2]]
  const ranks = [1, 0, 2]
  return (
    <div className="rounded-2xl p-6 mb-5 bg-leather"
         style={{ border: '1px solid rgba(122,83,44,0.25)' }}>
      <div className="flex items-end gap-3">
        {arr.map((p, i) => <PodiumStep key={i} player={p} rank={ranks[i]} />)}
      </div>
      {game?.playedAt && (
        <div className="text-center text-[11px] mt-3 text-cream-soft">
          ნათამაშებია {new Date(game.playedAt).toLocaleString()}
        </div>
      )}
    </div>
  )
}
