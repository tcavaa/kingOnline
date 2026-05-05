module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Old-Western palette
        wood:        '#3a2316',
        'wood-dark': '#2c1a10',
        'wood-light':'#6f4e37',
        leather:     '#5a3a1f',
        saddle:      '#8b5e3c',
        rust:        '#8b3a2e',
        'rust-bright':'#b04a2e',
        cream:       '#f5e9cf',
        parchment:   '#f0d9a8',
        ink:         '#3a2410',
        amber:       '#daa520',
        'amber-deep':'#b8821b',
        sage:        '#6dbc4f',
        // Back-compat aliases used by older components
        'casino-bg':     '#1c100a',
        'casino-panel':  '#3a2316',
        'casino-border': 'rgba(218,165,32,0.32)',
        gold:            '#daa520',
        'accent-green':  '#6dbc4f',
        'accent-red':    '#d4574d',
      },
      fontFamily: {
        western: ['Rye', 'Roboto Slab', 'Georgia', 'serif'],
        slab:    ['Roboto Slab', 'Georgia', 'serif'],
        type:    ['Special Elite', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
