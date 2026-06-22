// Single source of truth for the saloon reaction clips. Used by both the
// in-canvas avatar buttons (GameScene) and the DOM Sound Board modal.
//
//   id    — filename + server ALLOWED_SOUNDS id (do not change lightly)
//   glyph — single character drawn on the compact canvas buttons
//   label — friendly name shown in the big DOM modal
//   color — CSS hex; GameScene converts it to a Phaser int on the fly

export const SOUNDS = [
  // built-in clips
  { id: 'yeehaw',      glyph: 'Y', label: 'Yee-haw',    color: '#daa520' },
  { id: 'gunshot',     glyph: '!', label: 'Bang',       color: '#d4574d' },
  { id: 'whistle',     glyph: '~', label: 'Whistle',    color: '#6dbc4f' },
  // user-added reaction clips
  { id: 'giv',         glyph: 'G', label: 'Giv',        color: '#7fa7d6' },
  { id: 'janmrteloba', glyph: 'J', label: 'Janmrteloba', color: '#c084fc' },
  { id: 'sheilage',    glyph: 'S', label: 'Sheilage',   color: '#a78bfa' },
  { id: 'shemetxara',  glyph: 'X', label: 'Shemetxara', color: '#f472b6' },
  { id: 'tsava',       glyph: 'T', label: 'Tsava',      color: '#fde047' },
  // Georgian reaction clips (first batch)
  { id: 'Dedofali',    glyph: 'D', label: 'Dedofali',   color: '#ff6b9d' },
  { id: 'Male!',       glyph: 'M', label: 'Male',       color: '#60a5fa' },
  { id: 'Revia',       glyph: 'R', label: 'Revia',      color: '#34d399' },
  { id: 'Tazik',       glyph: 'Z', label: 'Tazik',      color: '#facc15' },
  // Georgian reaction clips (latest batch)
  { id: '10-10',       glyph: '1', label: '10-10',      color: '#fb7185' },
  { id: 'achexet',     glyph: 'A', label: 'Achexet',    color: '#fb923c' },
  { id: 'bedi',        glyph: 'B', label: 'Bedi',       color: '#f0a500' },
  { id: 'cxado',       glyph: 'C', label: 'Cxado',      color: '#22d3ee' },
  // one-off addition
  { id: 'ketika',      glyph: 'K', label: 'Ketika',     color: '#a3e635' },
]
