// Single source of truth for the tavern reaction clips. Used by both the
// in-canvas avatar buttons (GameScene) and the DOM Sound Board modal.
//
//   id    — filename + server ALLOWED_SOUNDS id (do not change lightly)
//   glyph — single character drawn on the compact canvas buttons
//   label — friendly name shown in the big DOM modal
//   color — CSS hex; GameScene converts it to a Phaser int on the fly

export const SOUNDS = [
  // built-in clips
  { id: 'yeehaw',      glyph: 'ჰ', label: 'ყიჟინა',      color: '#b98a2f' },
  { id: 'gunshot',     glyph: '!', label: 'გასროლა',     color: '#a5372b' },
  { id: 'whistle',     glyph: '~', label: 'სტვენა',      color: '#4c7a2f' },
  // user-added reaction clips
  { id: 'giv',         glyph: 'გ', label: 'გივ',         color: '#31536b' },
  { id: 'janmrteloba', glyph: 'ჯ', label: 'ჯანმრთელობა', color: '#6b3fa0' },
  { id: 'sheilage',    glyph: 'შ', label: 'შეილაგე',     color: '#5b3d99' },
  { id: 'shemetxara',  glyph: 'ხ', label: 'შემეთხარა',   color: '#a83a68' },
  { id: 'tsava',       glyph: 'ც', label: 'ცავა',        color: '#8e6a1e' },
  // Georgian reaction clips (first batch)
  { id: 'Dedofali',    glyph: 'დ', label: 'დედოფალი',    color: '#b0446e' },
  { id: 'Male!',       glyph: 'მ', label: 'მალე!',       color: '#2f5d8a' },
  { id: 'Revia',       glyph: 'რ', label: 'რევია',       color: '#2b7a55' },
  { id: 'Tazik',       glyph: 'თ', label: 'თაზიკ',       color: '#9c7818' },
  // Georgian reaction clips (latest batch)
  { id: '10-10',       glyph: '1', label: '10-10',       color: '#b04a52' },
  { id: 'achexet',     glyph: 'ა', label: 'აჩეხეთ',      color: '#9c5a24' },
  { id: 'bedi',        glyph: 'ბ', label: 'ბედი',        color: '#a97b14' },
  { id: 'cxado',       glyph: 'ო', label: 'ცხადო',       color: '#22758a' },
  // one-off addition
  { id: 'ketika',      glyph: 'კ', label: 'კეტიკა',      color: '#5e7a1e' },
]
