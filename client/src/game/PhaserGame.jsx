import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { useGame } from '../context/GameContext'
import { PreloadScene } from './scenes/PreloadScene'
import { GameScene, SCENE_W, SCENE_H } from './scenes/GameScene'
import { EventBus }     from './EventBus'

export default function PhaserGame({ gameState, onCardPlay }) {
  const containerRef = useRef(null)
  const gameRef      = useRef(null)
  // Latest snapshot we tried to push into Phaser. The scene re-broadcasts
  // `scene-ready` once it finishes mounting, at which point we replay this
  // ref so the table renders immediately on a refresh/rejoin instead of
  // staying blank until the next state-update arrives.
  const lastStateRef = useRef(null)
  const { playSound } = useGame()

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return

    const config = {
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: SCENE_W,
      height: SCENE_H,
      backgroundColor: '#0a0a0a',
      scene: [PreloadScene, GameScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      disableContextMenu: true,
    }

    gameRef.current = new Phaser.Game(config)

    return () => {
      gameRef.current?.destroy(true)
      gameRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!gameState) return
    lastStateRef.current = gameState
    EventBus.emit('state-update', gameState)
  }, [gameState])

  // Whenever the GameScene finishes mounting (initial create, scene
  // restart, HMR), replay the most recent state we have. Without this
  // replay the very first state-update — emitted while the scene was
  // still in PreloadScene — gets dropped, and the felt stays empty until
  // some other React-side change forces a fresh state-update.
  useEffect(() => {
    const replay = () => {
      if (lastStateRef.current) {
        EventBus.emit('state-update', lastStateRef.current)
      }
    }
    EventBus.on('scene-ready', replay)
    return () => EventBus.off('scene-ready', replay)
  }, [])

  useEffect(() => {
    const handler = (card) => onCardPlay && onCardPlay(card)
    EventBus.on('card-clicked', handler)
    return () => EventBus.off('card-clicked', handler)
  }, [onCardPlay])

  // Player clicked a sound button next to an avatar → broadcast through socket.
  useEffect(() => {
    const handler = ({ soundId, targetSeat }) => {
      if (!playSound) return
      playSound(soundId, targetSeat)
    }
    EventBus.on('request-play-sound', handler)
    return () => EventBus.off('request-play-sound', handler)
  }, [playSound])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ background: '#0a0a0a' }}
    />
  )
}
