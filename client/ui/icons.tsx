import React from 'react'

export type IconKind =
  | 'coin'
  | 'iron'
  | 'wood'
  | 'food'
  | 'trade'
  | 'medicine'
  | 'sword'
  | 'action'
  | 'harbor'
  | 'star'
  | 'vp'

/** Raw geometry in a 16×16 viewBox — shared by the React <Ico> and the raw-SVG board renderer. */
export const ICON_SHAPES: Record<IconKind, { fill: string; stroke?: string; d: string }[]> = {
  coin: [
    // embossed silver coin, like the physical pieces
    { fill: '#ece5d3', stroke: '#5f5847', d: 'M8 1.2 A6.8 6.8 0 1 1 7.99 1.2 Z M8 3.1 A4.9 4.9 0 1 0 7.99 3.1 Z' },
    { fill: '#c9c0a8', stroke: '#5f5847', d: 'M8 4.4 A3.6 3.6 0 1 1 7.99 4.4 Z' },
    {
      fill: '#faf5e6',
      d: 'M8 5.4 l0.9 1.6 1.7 0.2 -1.3 1.2 0.4 1.7 -1.7 -0.9 -1.7 0.9 0.4 -1.7 -1.3 -1.2 1.7 -0.2 Z',
    },
  ],
  iron: [
    // anvil: top beak + waist + base
    { fill: '#5b6670', stroke: '#2c343b', d: 'M1.5 4 h9 c1.8 0 3 -0.9 4 -2.2 l1 0.7 c-0.8 2.2 -2.4 3.5 -4.6 3.5 h-2.4 l1.2 3.5 h2.3 v2 H4.5 v-2 h2.2 l-1 -3.5 H1.5 Z' },
  ],
  wood: [
    // stacked logs (end grain visible)
    { fill: '#8a6238', stroke: '#4a3018', d: 'M2 10.5 h9 a2.6 2.6 0 0 1 0 5 H2 Z' },
    { fill: '#d9b98c', stroke: '#4a3018', d: 'M3.6 13 a1.7 1.7 0 1 1 0 0.01 Z M9 13 a1.7 1.7 0 1 1 0 0.01 Z' },
  ],
  food: [
    // wheat stalk
    { fill: 'none', stroke: '#a8842e', d: 'M8 15 V5' },
    { fill: '#d8b45a', stroke: '#8a6a1e', d: 'M8 5 C6.4 4.4 5.8 2.8 6 1.2 C7.6 1.6 8.4 2.8 8 5 Z M8 5 C9.6 4.4 10.2 2.8 10 1.2 C8.4 1.6 7.6 2.8 8 5 Z M8 8.5 C6.4 7.9 5.8 6.3 6 4.7 C7.6 5.1 8.4 6.3 8 8.5 Z M8 8.5 C9.6 7.9 10.2 6.3 10 4.7 C8.4 5.1 7.6 6.3 8 8.5 Z M8 12 C6.4 11.4 5.8 9.8 6 8.2 C7.6 8.6 8.4 9.8 8 12 Z M8 12 C9.6 11.4 10.2 9.8 10 8.2 C8.4 8.6 7.6 9.8 8 12 Z' },
  ],
  trade: [
    // amphora
    { fill: '#b0703a', stroke: '#5f3a18', d: 'M6 1.5 h4 v1.6 c1.8 0.8 3 2.6 3 4.9 c0 3.2 -2.2 5.6 -5 5.6 s-5 -2.4 -5 -5.6 c0 -2.3 1.2 -4.1 3 -4.9 Z M5.2 0.8 h5.6 v1.2 H5.2 Z' },
    { fill: '#5f3a18', d: 'M6.4 4.4 h3.2 v1 h-3.2 Z' },
  ],
  medicine: [
    // leaf
    { fill: '#5e8c4a', stroke: '#2f4d24', d: 'M13.5 2 C8 2 3.5 5.5 3 12 c0 0.8 0.1 1.5 0.3 2 C9 14 13.5 9.5 13.5 2 Z' },
    { fill: 'none', stroke: '#2f4d24', d: 'M4.5 12.5 C7 9.5 10 7 12.5 3.5' },
  ],
  sword: [
    { fill: '#9aa3ab', stroke: '#3c444c', d: 'M13.8 1.5 l0.7 0.7 -6.2 8.4 -1.6 -1.6 Z' },
    { fill: '#8a6a1e', d: 'M5.6 8.2 l2.2 2.2 -1.2 1.2 -0.7 -0.4 -1.9 1.9 c0.4 0.6 0.3 1.3 -0.2 1.8 -0.5 0.5 -1.3 0.5 -1.8 0 l-0.9 -0.9 c-0.5 -0.5 -0.5 -1.3 0 -1.8 0.5 -0.5 1.2 -0.6 1.8 -0.2 l1.9 -1.9 -0.4 -0.7 Z' },
  ],
  action: [
    { fill: '#e6bd63', stroke: '#8a6a1e', d: 'M9.5 1 L3.5 9 h3.4 L6.2 15 L12.5 6.6 H8.9 Z' },
  ],
  harbor: [
    { fill: 'none', stroke: '#31708e', d: 'M8 2.2 a1.6 1.6 0 1 1 0 3.2 a1.6 1.6 0 1 1 0 -3.2 Z M7.3 5.4 h1.4 V13 h2.6 c-0.5 1.4 -2 2.3 -3.3 2.3 S5.3 14.4 4.8 13 h2.5 Z M3 9.5 c0.4 2.6 2.4 4.4 5 4.4 s4.6 -1.8 5 -4.4 l-1.6 1.2 -0.7 -1 2.3 -1.9 2.3 1.9 -0.7 1 -1.5 -1.1' },
  ],
  star: [
    { fill: '#e6bd63', stroke: '#8a6a1e', d: 'M8 1.2 l1.9 4 4.4 0.5 -3.3 3 0.9 4.3 -3.9 -2.2 -3.9 2.2 0.9 -4.3 -3.3 -3 4.4 -0.5 Z' },
  ],
  vp: [
    { fill: '#a03c32', stroke: '#5c1f18', d: 'M8 1.5 l1.7 3.4 3.8 0.5 -2.8 2.6 0.7 3.7 -3.4 -1.9 -3.4 1.9 0.7 -3.7 -2.8 -2.6 3.8 -0.5 Z' },
  ],
}

export function Ico(props: { kind: IconKind; size?: number; title?: string; style?: React.CSSProperties }) {
  const { kind, size = 14, title, style } = props
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{ verticalAlign: '-2px', display: 'inline-block', ...style }}
      role="img"
      aria-label={title ?? kind}
    >
      {title ? <title>{title}</title> : null}
      {ICON_SHAPES[kind].map((s, i) => (
        <path key={i} d={s.d} fill={s.fill} stroke={s.stroke ?? 'none'} strokeWidth={s.stroke ? 0.7 : 0} />
      ))}
    </svg>
  )
}

/** drawn glyph for event tokens (white on the red disc) */
export const EVENT_GLYPHS: Record<string, { d: string }[]> = {
  flood: [
    { d: 'M2 6 c1.6 -1.6 3.2 -1.6 4.8 0 s3.2 1.6 4.8 0 M2 10 c1.6 -1.6 3.2 -1.6 4.8 0 s3.2 1.6 4.8 0' },
  ],
  outbreak: [{ d: 'M7 3 h2 v4 h4 v2 h-4 v4 H7 V9 H3 V7 h4 Z' }],
  locusts: [{ d: 'M3 5 a1.4 1.4 0 1 1 0 0.01 Z M8 7 a1.4 1.4 0 1 1 0 0.01 Z M5 11 a1.4 1.4 0 1 1 0 0.01 Z M11 10 a1.4 1.4 0 1 1 0 0.01 Z' }],
  riot: [{ d: 'M8 1.5 C9.5 4 12 5.5 12 9 a4 4 0 1 1 -8 0 c0 -2 1 -3 1.6 -4.4 C6.2 5.8 7.2 6.4 8 7.4 C8.6 5.6 8.6 3.4 8 1.5 Z' }],
  drought: [{ d: 'M8 3.2 a4.8 4.8 0 1 1 0 9.6 a4.8 4.8 0 1 1 0 -9.6 Z M8 0.2 v2 M8 13.8 v2 M0.2 8 h2 M13.8 8 h2 M2.5 2.5 l1.4 1.4 M12.1 12.1 l1.4 1.4 M13.5 2.5 l-1.4 1.4 M3.9 12.1 l-1.4 1.4' }],
  sandstorm: [{ d: 'M3 5 h6 a2 2 0 1 0 -2 -2.6 M2 8.5 h9 a2 2 0 1 1 -2 2.6 M4 12 h7' }],
  sea_storm: [{ d: 'M9 1 L4 9 h3.2 L6 15 l6.5 -8.6 H9 Z' }],
  forest_fire: [{ d: 'M8 1.5 C9.5 4 12 5.5 12 9 a4 4 0 1 1 -8 0 c0 -2 1 -3 1.6 -4.4 C6.2 5.8 7.2 6.4 8 7.4 C8.6 5.6 8.6 3.4 8 1.5 Z' }],
}
