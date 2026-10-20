import type {
  Ability,
  ArmyCard,
  ConditionDef,
  EventCardDef,
  EventKind,
  HiddenToken,
  Personality,
  PrizeCard,
  Region,
  ResourceCardDef,
} from './types'

// ---------------------------------------------------------------------------
// MAP — stylized Bharata circa 600 BC, laid on a pointy-top hex lattice.
// Adjacency is derived from axial hex coordinates (q,r):
//   neighbors: (q±1,r) (q,r±1) (q+1,r-1) (q-1,r+1)
// ---------------------------------------------------------------------------

export const HEX_SIZE = 62

type RawRegion = Omit<Region, 'neighbors' | 'pos'> & { q: number; r: number }

const RAW: RawRegion[] = [
  // row 0 — far north
  { id: 'kamboja', name: 'Kamboja', kind: 'mahajanapada', value: 3, q: 2, r: 0, river: true, yields: { iron: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Rajapura' },
  { id: 'kashmir', name: 'Kashmir', kind: 'province', value: 2, q: 3, r: 0, river: false, yields: { wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'nepal', name: 'Nepa', kind: 'province', value: 2, q: 4, r: 0, river: false, yields: { wood: 2 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  // row 1
  { id: 'gandhara', name: 'Gandhara', kind: 'mahajanapada', value: 5, q: 1, r: 1, river: true, yields: { iron: 1 }, trade: 1, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Taxila' },
  { id: 'madra', name: 'Madra', kind: 'province', value: 2, q: 2, r: 1, river: true, yields: { iron: 1, food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'trigarta', name: 'Trigarta', kind: 'province', value: 2, q: 3, r: 1, river: false, yields: { iron: 1, wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'kuru', name: 'Kuru', kind: 'mahajanapada', value: 4, q: 4, r: 1, river: true, yields: { food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Indraprastha' },
  { id: 'panchala', name: 'Panchala', kind: 'mahajanapada', value: 4, q: 5, r: 1, river: true, yields: { food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Ahichhatra' },
  { id: 'malla', name: 'Malla', kind: 'mahajanapada', value: 3, q: 6, r: 1, river: true, yields: { wood: 1, food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Kushavati' },
  { id: 'pragjyotisha', name: 'Pragjyotisha', kind: 'province', value: 1, q: 7, r: 1, river: false, yields: { wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  // row 2
  { id: 'sauvira', name: 'Sauvira', kind: 'province', value: 2, q: 2, r: 2, river: true, yields: { food: 1 }, trade: 1, harbor: true, arid: true, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'matsya', name: 'Matsya', kind: 'mahajanapada', value: 3, q: 3, r: 2, river: false, yields: { food: 1 }, trade: 0, harbor: false, arid: true, hiddenSpot: false, isCapitalOf: 'Viratanagara' },
  { id: 'shurasena', name: 'Shurasena', kind: 'mahajanapada', value: 4, q: 4, r: 2, river: true, yields: { food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Mathura' },
  { id: 'kosala', name: 'Kosala', kind: 'mahajanapada', value: 5, q: 5, r: 2, river: true, yields: { food: 2 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Shravasti' },
  { id: 'vajji', name: 'Vajji', kind: 'mahajanapada', value: 3, q: 6, r: 2, river: true, yields: { food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Vaishali' },
  { id: 'anga', name: 'Anga', kind: 'mahajanapada', value: 4, q: 7, r: 2, river: true, yields: { food: 1 }, trade: 1, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Champa' },
  // row 3
  { id: 'anarta', name: 'Anarta', kind: 'province', value: 2, q: 1, r: 3, river: false, yields: { food: 1 }, trade: 1, harbor: false, arid: true, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'avanti', name: 'Avanti', kind: 'mahajanapada', value: 5, q: 2, r: 3, river: false, yields: { food: 1, iron: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Ujjayini' },
  { id: 'chedi', name: 'Chedi', kind: 'mahajanapada', value: 4, q: 3, r: 3, river: false, yields: { wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Shaktimati' },
  { id: 'kasi', name: 'Kasi', kind: 'mahajanapada', value: 5, q: 4, r: 3, river: true, yields: { food: 1 }, trade: 1, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Varanasi' },
  { id: 'vatsa', name: 'Vatsa', kind: 'mahajanapada', value: 4, q: 5, r: 3, river: true, yields: { food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Kaushambi' },
  { id: 'magadha', name: 'Magadha', kind: 'mahajanapada', value: 6, q: 6, r: 3, river: true, yields: { iron: 2, food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Rajagriha' },
  { id: 'tamralipti', name: 'Tamralipti', kind: 'province', value: 3, q: 7, r: 3, river: false, yields: { food: 1 }, trade: 2, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
  // row 4
  { id: 'saurashtra', name: 'Saurashtra', kind: 'province', value: 3, q: 0, r: 4, river: false, yields: { food: 1 }, trade: 2, harbor: true, arid: true, hiddenSpot: false, isCapitalOf: undefined },
  { id: 'bharukaccha', name: 'Bharukaccha', kind: 'province', value: 3, q: 1, r: 4, river: true, yields: { food: 1 }, trade: 2, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
  { id: 'dasharna', name: 'Dasharna', kind: 'province', value: 2, q: 2, r: 4, river: true, yields: { wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'vidarbha', name: 'Vidarbha', kind: 'province', value: 3, q: 3, r: 4, river: false, yields: { iron: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'karusha', name: 'Karusha', kind: 'province', value: 2, q: 4, r: 4, river: false, yields: { iron: 1, wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'kalinga', name: 'Kalinga', kind: 'province', value: 3, q: 5, r: 4, river: false, yields: { food: 1 }, trade: 1, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
  { id: 'odra', name: 'Odra', kind: 'province', value: 2, q: 6, r: 4, river: false, yields: { wood: 1, food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  // row 5
  { id: 'sopara', name: 'Sopara', kind: 'province', value: 3, q: 1, r: 5, river: false, yields: { food: 1 }, trade: 2, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
  { id: 'ashmaka', name: 'Ashmaka', kind: 'mahajanapada', value: 4, q: 2, r: 5, river: true, yields: { food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: false, isCapitalOf: 'Potana' },
  { id: 'kuntala', name: 'Kuntala', kind: 'province', value: 2, q: 3, r: 5, river: true, yields: { wood: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'andhra', name: 'Andhra', kind: 'province', value: 2, q: 4, r: 5, river: true, yields: { food: 1 }, trade: 1, harbor: true, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  // row 6
  { id: 'mahisha', name: 'Mahisha', kind: 'province', value: 2, q: 2, r: 6, river: false, yields: { wood: 1, food: 1 }, trade: 0, harbor: false, arid: false, hiddenSpot: true, isCapitalOf: undefined },
  { id: 'chola', name: 'Chola', kind: 'province', value: 3, q: 3, r: 6, river: false, yields: { food: 1 }, trade: 1, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
  // row 7 — far south
  { id: 'chera', name: 'Chera', kind: 'province', value: 2, q: 2, r: 7, river: false, yields: { wood: 1 }, trade: 1, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
  { id: 'pandya', name: 'Pandya', kind: 'province', value: 3, q: 3, r: 7, river: false, yields: { food: 1 }, trade: 1, harbor: true, arid: false, hiddenSpot: false, isCapitalOf: undefined },
]

function hexNeighbors(q: number, r: number): string[] {
  const deltas: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ]
  const out: string[] = []
  for (const [dq, dr] of deltas) {
    const id = regionIdAt(q + dq, r + dr)
    if (id) out.push(id)
  }
  return out
}

function regionIdAt(q: number, r: number): string | null {
  return RAW.find((x) => x.q === q && x.r === r)?.id ?? null
}

// pixel position of a hex cell center (uniform grid — no jitter, boards read best aligned)
export function hexCenter(q: number, r: number, _jitterSeed = 0): { x: number; y: number } {
  const s = HEX_SIZE
  return { x: Math.sqrt(3) * s * (q + r / 2), y: 1.5 * s * r }
}

// the drawn hex sits inside its cell with a breathing gutter on every side
export const HEX_DRAW_SCALE = 0.84

export function hexPolygon(q: number, r: number): [number, number][] {
  const s = HEX_SIZE * HEX_DRAW_SCALE
  const { x, y } = hexCenter(q, r)
  const pts: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 30)
    pts.push([x + s * Math.cos(angle), y + s * Math.sin(angle)])
  }
  return pts
}

export const REGIONS: Record<string, Region> = Object.fromEntries(
  RAW.map(({ q, r, ...rest }) => [rest.id, { ...rest, pos: { q, r }, neighbors: hexNeighbors(q, r) }]),
)

export const RIVER_PATHS: { name: string; via: string[] }[] = [
  { name: 'Indus', via: ['kamboja', 'gandhara', 'madra', 'sauvira'] },
  { name: 'Yamuna', via: ['kuru', 'shurasena', 'vatsa'] },
  { name: 'Ganga', via: ['panchala', 'kosala', 'vajji', 'anga'] },
  { name: 'Narmada', via: ['bharukaccha', 'dasharna', 'karusha'] },
  { name: 'Godavari', via: ['ashmaka', 'kuntala', 'andhra'] },
]

// ---------------------------------------------------------------------------
// PLAYER COLORS & KINGDOMS
// ---------------------------------------------------------------------------

export const SEAT_COLORS = [
  '#b03a2e', // crimson
  '#1f618d', // indigo blue
  '#1e8449', // forest green
  '#6c3483', // royal purple
  '#ca6f1e', // saffron
  '#148f77', // teal
  '#a04000', // copper
  '#5d6d7e', // slate
]

export const KINGDOM_NAMES = [
  'Kashi',
  'Kosala',
  'Magadha',
  'Avanti',
  'Vatsa',
  'Shurasena',
  'Panchala',
  'Kuru',
]

export const CAPITAL_IDS = Object.values(REGIONS)
  .filter((r) => r.isCapitalOf)
  .map((r) => r.id)

// ---------------------------------------------------------------------------
// DECKS
// ---------------------------------------------------------------------------

export const ARMY_DECK: ArmyCard[] = [
  ...Array(6).fill(0).map((_, i) => ({ id: `a1-${i}`, value: 1 })),
  ...Array(12).fill(0).map((_, i) => ({ id: `a2-${i}`, value: 2 })),
  ...Array(12).fill(0).map((_, i) => ({ id: `a3-${i}`, value: 3 })),
  ...Array(8).fill(0).map((_, i) => ({ id: `a4-${i}`, value: 4 })),
  ...Array(6).fill(0).map((_, i) => ({ id: `a5-${i}`, value: 5 })),
  ...Array(4).fill(0).map((_, i) => ({ id: `a6-${i}`, value: 6 })),
]

export const RESOURCE_CARDS: Record<string, ResourceCardDef> = {
  bumper_harvest: { id: 'bumper_harvest', title: 'Bumper Harvest', all: { food: 2 }, text: 'All rulers gain 2 food.' },
  monsoon: { id: 'monsoon', title: 'Monsoon Rains', all: { food: 1 }, active: { food: 1 }, text: 'All rulers gain 1 food. You gain 2.' },
  iron_veins: { id: 'iron_veins', title: 'Iron Veins', all: { iron: 1 }, text: 'All rulers gain 1 iron.' },
  timber_run: { id: 'timber_run', title: 'Timber Expedition', all: { wood: 1 }, text: 'All rulers gain 1 wood.' },
  deep_forests: { id: 'deep_forests', title: 'Deep Forests', all: { wood: 1 }, active: { wood: 1 }, text: 'All rulers gain 1 wood. You gain 2.' },
  trade_caravan: { id: 'trade_caravan', title: 'Trade Caravan', active: { trade: 2 }, text: 'You gain 2 trade objects.' },
  harbor_windfall: { id: 'harbor_windfall', title: 'Harbor Windfall', active: { coins: 2 }, text: 'You gain 2 coins.' },
  royal_tithe: { id: 'royal_tithe', title: 'Royal Tithe', all: { coins: 1 }, text: 'All rulers gain 1 coin.' },
  miners_guild: { id: 'miners_guild', title: "Miners' Guild", all: { iron: 1 }, active: { iron: 1 }, text: 'All rulers gain 1 iron. You gain 2.' },
  double_food: { id: 'double_food', title: 'Full Granaries', active: { food: 4 }, text: 'You gain 4 food. Take double!' },
  famine: { id: 'famine', title: 'Famine', text: 'All rulers lose 1 food.' },
  bandits: { id: 'bandits', title: 'Bandits on the Roads', text: 'You lose 1 trade object.' },
  clearing: { id: 'clearing', title: 'Land Clearing', active: { wood: 1, food: 1 }, text: 'You gain 1 wood and 1 food.' },
  festival: { id: 'festival', title: 'City Festival', all: { food: 1, coins: 1 }, text: 'All rulers gain 1 food and 1 coin.' },
}

export const RESOURCE_DECK: string[] = [
  ...Array(3).fill('bumper_harvest'),
  ...Array(2).fill('monsoon'),
  ...Array(3).fill('iron_veins'),
  ...Array(3).fill('timber_run'),
  ...Array(2).fill('deep_forests'),
  ...Array(2).fill('trade_caravan'),
  ...Array(2).fill('harbor_windfall'),
  ...Array(1).fill('royal_tithe'),
  ...Array(2).fill('miners_guild'),
  ...Array(1).fill('double_food'),
  ...Array(2).fill('famine'),
  ...Array(1).fill('bandits'),
  ...Array(1).fill('clearing'),
  ...Array(1).fill('festival'),
]

export const PERSONALITIES: Record<string, Personality> = {
  merchant_prince: {
    id: 'merchant_prince',
    name: 'Merchant Prince',
    desc: 'Sell resources at 1:1 for coins (instead of 2:1) and sell trade objects without needing an export harbor.',
  },
  iron_raja: {
    id: 'iron_raja',
    name: 'Iron Raja',
    desc: 'Gain +1 iron at the start of every resource phase.',
  },
  granary_keeper: {
    id: 'granary_keeper',
    name: 'Granary Keeper',
    desc: 'Gain +1 food at the start of every resource phase.',
  },
  war_elephants: {
    id: 'war_elephants',
    name: 'War Elephants',
    desc: '+2 to your total in every battle you fight.',
  },
  master_mason: {
    id: 'master_mason',
    name: 'Master Mason',
    desc: 'Provinces cost 1 less coin to conquer (minimum 1).',
  },
  tax_collector: {
    id: 'tax_collector',
    name: 'Tax Collector',
    desc: 'Gain 1 coin at the start of every action phase.',
  },
}

export const ABILITIES: Record<string, Ability> = {
  river_sage: {
    id: 'river_sage', name: 'Ganga Sage', uses: 2,
    immuneTo: ['flood'],
    desc: 'IMMUNE to Floods. USE (2×): remove any one event token anywhere on the map, for free.',
  },
  physician: {
    id: 'physician', name: 'Vaidya', uses: 2,
    immuneTo: ['outbreak'],
    desc: 'IMMUNE to Outbreaks. USE (2×): gain 1 Medicine (cures any event instantly).',
  },
  peacemaker: {
    id: 'peacemaker', name: 'Peacemaker', uses: 2,
    immuneTo: ['riot'],
    desc: 'IMMUNE to Riots. USE (2×): remove all event tokens from regions you rule.',
  },
  rainmaker: {
    id: 'rainmaker', name: 'Rainmaker', uses: 2,
    immuneTo: ['drought', 'locusts'],
    desc: 'IMMUNE to Drought & Locusts. USE (2×): all rulers gain 1 food, you gain 2.',
  },
  shipwright: {
    id: 'shipwright', name: 'Shipwright', uses: 2,
    immuneTo: ['sea_storm'],
    desc: 'IMMUNE to Sea Storms. USE (2×): gain 1 trade object and 1 coin.',
  },
  strategist: {
    id: 'strategist', name: 'Strategist', uses: 2,
    desc: 'USE (2×): +3 to one battle total. Declare when committing battle cards.',
  },
  seer: {
    id: 'seer', name: 'Seer', uses: 2,
    desc: 'USE (2×): cancel the event card just drawn — it is shuffled back into the deck.',
  },
  quartermaster: {
    id: 'quartermaster', name: 'Quartermaster', uses: 2,
    desc: 'USE (2×): gain 1 coin, 1 iron and 1 food.',
  },
}

export const EVENT_CARDS: Record<string, EventCardDef> = {
  flood: {
    id: 'flood', kind: 'flood', name: 'Flooding', icon: '🌊',
    text: 'Place on ONE river region. Its ruler must remove it (1 action + 1 wood) or stay afflicted.',
    target: { count: 1, river: true },
    removal: { wood: 1 },
  },
  great_flood: {
    id: 'great_flood', kind: 'flood', name: 'Great Flood', icon: '🌊🌊',
    text: 'Place on TWO river regions. Rulers must remove them (1 action + 1 wood each).',
    target: { count: 2, river: true },
    removal: { wood: 1 },
  },
  outbreak: {
    id: 'outbreak', kind: 'outbreak', name: 'Outbreak', icon: '🐀',
    text: 'Place on ONE region containing an army. Its ruler must remove it (1 action + 1 food, or 1 Medicine).',
    target: { count: 1, hasArmy: true },
    removal: { food: 1, medicine: true },
  },
  locusts: {
    id: 'locusts', kind: 'locusts', name: 'Locusts', icon: '🦗',
    text: 'Place on ONE food-yielding region. Its ruler must remove it (1 action + 1 food).',
    target: { count: 1, yieldsFood: true },
    removal: { food: 1 },
  },
  riot: {
    id: 'riot', kind: 'riot', name: 'Riot', icon: '🔥',
    text: 'Place on ONE ruled region. Its ruler must remove it (1 action + 2 coins). If it stays through their turn, they lose the fort!',
    target: { count: 1, riot: true },
    removal: { coins: 2 },
  },
  drought: {
    id: 'drought', kind: 'drought', name: 'Drought', icon: '☀️',
    text: 'Place on ONE region. Its ruler must remove it (1 action + 1 food).',
    target: { count: 1 },
    removal: { food: 1 },
  },
  sandstorm: {
    id: 'sandstorm', kind: 'sandstorm', name: 'Sandstorm', icon: '🏜️',
    text: 'Place on ONE arid region. Its ruler must remove it (1 action + 1 wood + 1 food).',
    target: { count: 1, arid: true },
    removal: { wood: 1, food: 1 },
  },
  sea_storm: {
    id: 'sea_storm', kind: 'sea_storm', name: 'Sea Storm', icon: '⚡',
    text: 'Place on ONE export harbor. Its ruler loses 1 trade object and must remove it (1 action + 1 wood).',
    target: { count: 1, harbor: true },
    removal: { wood: 1 },
    onPlace: 'steal_trade',
  },
}

export const EVENT_DECK: string[] = [
  ...Array(3).fill('flood'),
  ...Array(1).fill('great_flood'),
  ...Array(2).fill('outbreak'),
  ...Array(1).fill('locusts'),
  ...Array(2).fill('riot'),
  ...Array(1).fill('drought'),
  ...Array(1).fill('sandstorm'),
  ...Array(1).fill('sea_storm'),
]

export const PRIZE_CARDS: PrizeCard[] = [
  { id: 'treasury', title: 'Royal Treasury', options: [
    { text: '+2 coins', effect: { kind: 'coins', n: 2 } },
    { text: '+1 victory point', effect: { kind: 'vp', n: 1 } },
  ]},
  { id: 'silk_route', title: 'Silk Route', options: [
    { text: '+2 trade objects', effect: { kind: 'trade', n: 2 } },
    { text: '+2 coins', effect: { kind: 'coins', n: 2 } },
  ]},
  { id: 'levy', title: 'Levy of Arms', options: [
    { text: 'Draw 2 army cards', effect: { kind: 'draw_army', n: 2 } },
    { text: '+2 coins', effect: { kind: 'coins', n: 2 } },
  ]},
  { id: 'iron_tribute', title: 'Iron Tribute', options: [
    { text: '+2 iron', effect: { kind: 'resource', res: 'iron', n: 2 } },
    { text: '+2 food', effect: { kind: 'resource', res: 'food', n: 2 } },
  ]},
  { id: 'coronation', title: 'Coronation', options: [
    { text: '+2 victory points', effect: { kind: 'vp', n: 2 } },
    { text: '+2 food', effect: { kind: 'resource', res: 'food', n: 2 } },
  ]},
  { id: 'guild', title: 'Merchant Guild', options: [
    { text: '+1 trade object & +1 coin', effect: { kind: 'trade', n: 1 } },
    { text: '+1 victory point', effect: { kind: 'vp', n: 1 } },
  ]},
]

export const CONDITIONS: ConditionDef[] = [
  { id: 'empire', title: 'Empire Builder', desc: 'Rule 5 or more regions at the end of your turn.' },
  { id: 'warlord', title: 'Warlord', desc: 'Have won a battle.' },
  { id: 'magnate', title: 'Magnate', desc: 'Hold 15 or more coins at the end of your turn.' },
  { id: 'stockpile', title: 'Grand Stockpile', desc: 'Hold 9 or more of any single resource at the end of your turn.' },
  { id: 'ports', title: 'Lord of Harbors', desc: 'Control 2 or more export harbors at the end of your turn.' },
  { id: 'caravans', title: 'Caravan Master', desc: 'Hold 3 or more trade objects at the end of your turn.' },
]

export const HIDDEN_TOKEN_POOL: HiddenToken[] = [
  { id: 'h-vp1a', kind: 'vp1' },
  { id: 'h-vp1b', kind: 'vp1' },
  { id: 'h-vp2', kind: 'vp2' },
  { id: 'h-coins1', kind: 'coins' },
  { id: 'h-coins2', kind: 'coins' },
  { id: 'h-trade1', kind: 'trade' },
  { id: 'h-trade2', kind: 'trade' },
  { id: 'h-medicine', kind: 'medicine' },
  { id: 'h-ambush', kind: 'ambush' },
  { id: 'h-empty', kind: 'empty' },
]

export const HIDDEN_TOKEN_LABEL: Record<string, string> = {
  vp1: '+1 VP',
  vp2: '+2 VP',
  coins: '+3 coins',
  trade: '+2 trade objects',
  medicine: 'Medicine',
  ambush: 'Ambush — event strikes this region!',
  empty: 'Nothing…',
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  flood: 'Flood',
  outbreak: 'Outbreak',
  locusts: 'Locusts',
  riot: 'Riot',
  drought: 'Drought',
  sandstorm: 'Sandstorm',
  sea_storm: 'Sea Storm',
  forest_fire: 'Forest Fire',
}
