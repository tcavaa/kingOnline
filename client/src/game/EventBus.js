import Phaser from 'phaser'

// Shared event emitter for React <-> Phaser communication.
// React components emit events here; Phaser scenes listen here, and vice-versa.
export const EventBus = new Phaser.Events.EventEmitter()
