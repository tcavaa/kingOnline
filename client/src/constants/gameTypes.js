import { Crown, Diamond, Spade, Heart, AlertTriangle, Ban, Plus, TrendingUp } from 'lucide-react'

export const GAME_TYPES = [
  { code: 'K',  name: 'კინგი',      Icon: Crown,         description: 'არ აიღო გულის მეფე. −40 ქულა.',           color: '#8e2b23', totalUnits: 1,  pointPerUnit: -40 },
  { code: 'Q',  name: 'დამები',     Icon: Diamond,       description: 'არ აიღო დამები. −10 თითოზე.',             color: '#6b3151', totalUnits: 4,  pointPerUnit: -10 },
  { code: 'J',  name: 'ვალეტები',   Icon: Spade,         description: 'არ აიღო ვალეტები. −10 თითოზე.',           color: '#31536b', totalUnits: 4,  pointPerUnit: -10 },
  { code: 'H',  name: 'გულები',     Icon: Heart,         description: 'არ აიღო გულები. −5 თითოზე.',              color: '#a5372b', totalUnits: 8,  pointPerUnit: -5  },
  { code: 'L2', name: 'ბოლო ორი',   Icon: AlertTriangle, description: 'არ აიღო ბოლო ორი მინუსი. −20 თითოზე.',     color: '#9c5a24', totalUnits: 2,  pointPerUnit: -20 },
  { code: 'T',  name: 'მინუსი',    Icon: Ban,           description: 'არ აიღო მინუსები. −4 თითოზე.',             color: '#6f4e37', totalUnits: 10, pointPerUnit: -4  },
  { code: 'P1', name: 'პლიუსი 1',   Icon: Plus,          description: 'აიღე რაც შეიძლება მეტი. +8 თითო მინუსზე.', color: '#4c7a2f', totalUnits: 10, pointPerUnit: 8   },
  { code: 'P2', name: 'პლიუსი 2',   Icon: Plus,          description: 'აიღე რაც შეიძლება მეტი. +8 თითო მინუსზე.', color: '#0f766e', totalUnits: 10, pointPerUnit: 8   },
  { code: 'P3', name: 'პლიუსი 3',   Icon: TrendingUp,    description: 'აიღე რაც შეიძლება მეტი. +8 თითო მინუსზე.', color: '#1d4ed8', totalUnits: 10, pointPerUnit: 8   },
]

export const getGameType = (code) => GAME_TYPES.find(t => t.code === code)
