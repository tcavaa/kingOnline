module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Georgian tavern palette (key names kept for back-compat)
        wood:        '#3a2418',
        'wood-dark': '#2a1a10',
        'wood-light':'#6f4e37',
        leather:     '#4a2a1a',
        saddle:      '#8b5e3c',
        rust:        '#8e2b23',
        'rust-bright':'#a63a2e',
        cream:       '#f8efdd',
        parchment:   '#f2e4c8',
        ink:         '#3b2314',
        amber:       '#b98a2f',
        'amber-deep':'#8e6a1e',
        sage:        '#4c7a2f',
        wine:        '#8e2b23',
        'wine-deep': '#6f1f1a',
        // Back-compat aliases used by older components
        'casino-bg':     '#f2e4c8',
        'casino-panel':  '#f8efdd',
        'casino-border': 'rgba(122,83,44,0.42)',
        gold:            '#b98a2f',
        'accent-green':  '#4c7a2f',
        'accent-red':    '#a5372b',
      },
      fontFamily: {
        western: ['Noto Serif Georgian', 'Roboto Slab', 'Georgia', 'serif'],
        slab:    ['Noto Sans Georgian', 'Roboto Slab', 'Georgia', 'serif'],
        type:    ['Special Elite', 'Noto Sans Georgian', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
