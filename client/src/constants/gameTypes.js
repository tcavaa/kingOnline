import { Crown, Diamond, Spade, Heart, AlertTriangle, Ban, Plus, TrendingUp } from 'lucide-react'

export const GAME_TYPES = [
  { code: 'K',  name: 'No King',    Icon: Crown,         description: 'Avoid the King of Hearts (-40)',  color: '#dc2626', totalUnits: 1,  pointPerUnit: -40 },
  { code: 'Q',  name: 'No Queens',  Icon: Diamond,       description: 'Avoid Queens (-10 each)',          color: '#9333ea', totalUnits: 4,  pointPerUnit: -10 },
  { code: 'J',  name: 'No Jacks',   Icon: Spade,         description: 'Avoid Jacks (-10 each)',           color: '#0284c7', totalUnits: 4,  pointPerUnit: -10 },
  { code: 'H',  name: 'No Hearts',  Icon: Heart,         description: 'Avoid Hearts (-5 each)',           color: '#e85d5d', totalUnits: 8,  pointPerUnit: -5  },
  { code: 'L2', name: 'No Last 2',  Icon: AlertTriangle, description: 'Avoid last 2 tricks (-20 each)',   color: '#ea580c', totalUnits: 2,  pointPerUnit: -20 },
  { code: 'T',  name: 'No Tricks',  Icon: Ban,           description: 'Avoid all tricks (-4 each)',       color: '#65a30d', totalUnits: 10, pointPerUnit: -4  },
  { code: 'P1', name: 'Plus 1',     Icon: Plus,          description: 'Take tricks (+8 each)',            color: '#16a34a', totalUnits: 10, pointPerUnit: 8   },
  { code: 'P2', name: 'Plus 2',     Icon: Plus,          description: 'Take tricks (+8 each)',            color: '#0f766e', totalUnits: 10, pointPerUnit: 8   },
  { code: 'P3', name: 'Plus 3',     Icon: TrendingUp,    description: 'Take tricks (+8 each)',            color: '#1d4ed8', totalUnits: 10, pointPerUnit: 8   },
]

export const getGameType = (code) => GAME_TYPES.find(t => t.code === code)
