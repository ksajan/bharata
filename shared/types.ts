// ---------- Core primitives ----------

export type Resource = 'iron' | 'wood' | 'food'
export type RegionKind = 'mahajanapada' | 'province'
export type ArmyId = 1 | 2
export type Phase = 'draft' | 'resource' | 'action' | 'event' | 'gameover'

export interface MapPos {
  q: number
  r: number
}

export interface Region {
  id: string
  name: string
  kind: RegionKind
  value: number // conquest cost & VP value
  pos: MapPos
  neighbors: string[]
  yields: Partial<Record<Resource, number>>
  trade: number // trade objects gained on conquest
  river: boolean
  arid: boolean
  harbor: boolean // export harbor
  hiddenSpot: boolean // can host a hidden token (advanced)
  isCapitalOf?: string // historical capital city name
}

// ---------- Cards ----------

export interface ArmyCard {
  id: string
  value: number
}

export type PersonalityId =
  | 'merchant_prince'
  | 'iron_raja'
  | 'granary_keeper'
  | 'war_elephants'
  | 'master_mason'
  | 'tax_collector'

export interface Personality {
  id: PersonalityId
  name: string
  desc: string
}

export type AbilityId =
  | 'river_sage'
  | 'physician'
  | 'peacemaker'
  | 'rainmaker'
  | 'shipwright'
  | 'strategist'
  | 'seer'
  | 'quartermaster'

export interface Ability {
  id: AbilityId
  name: string
  desc: string
  uses: number
  immuneTo?: string[]
}

export interface ResourceCardDef {
  id: string
  title: string
  all?: Partial<Record<Resource | 'trade' | 'coins', number>>
  active?: Partial<Record<Resource | 'trade' | 'coins', number>>
  text: string
}

export interface PrizeCard {
  id: string
  title: string
  options: { text: string; effect: PrizeEffect }[]
}

export type PrizeEffect =
  | { kind: 'vp'; n: number }
  | { kind: 'coins'; n: number }
  | { kind: 'resource'; res: Resource; n: number }
  | { kind: 'trade'; n: number }
  | { kind: 'draw_army'; n: number }

export interface ConditionDef {
  id: string
  title: string
  desc: string
}

// ---------- Advanced: events & hidden tokens ----------

export type EventKind =
  | 'flood'
  | 'outbreak'
  | 'locusts'
  | 'riot'
  | 'drought'
  | 'sandstorm'
  | 'sea_storm'
  | 'forest_fire'

export interface EventCardDef {
  id: string
  kind: EventKind
  name: string
  icon: string
  text: string
  target: {
    count: number
    river?: boolean
    harbor?: boolean
    arid?: boolean
    yieldsFood?: boolean
    hasArmy?: boolean
    riot?: boolean
  }
  removal: { coins?: number; iron?: number; wood?: number; food?: number; medicine?: boolean }
  onPlace?: 'steal_trade'
}

export type HiddenTokenKind = 'vp1' | 'vp2' | 'coins' | 'trade' | 'medicine' | 'ambush' | 'empty'

export interface HiddenToken {
  id: string
  kind: HiddenTokenKind
}

// ---------- Game state ----------

export interface Army {
  id: string // `${seatId}-${armyId}`
  armyId: ArmyId
  ownerId: string // seat id
  regionId: string | null
  alive: boolean
  cards: ArmyCard[]
}

export interface Seat {
  id: string
  name: string
  color: string
  connected: boolean
  kingdomId: string
  personality: PersonalityId | null
  abilities: AbilityId[]
  abilityUsesLeft: Record<string, number>
  vp: number
  coins: number
  trade: number
  medicine: number
  iron: number
  wood: number
  food: number
  winsBattles: number
  conditionsMet: string[]
  armiesOwned: ArmyId[]
}

export interface Kingdom {
  id: string
  name: string
  capital: string // region id
  seats: string[]
  color: string
  fortSupply: number
  forts: Record<string, string> // regionId -> kingdomId (owned forts)
}

export interface ArmyAtRegion {
  seatId: string
  armyId: ArmyId
  armyRef: string
}

export interface BoardRegionState {
  armies: ArmyAtRegion[]
  eventTokens: { id: string; kind: EventKind }[]
  hiddenToken: string | null
}

export interface BattleCommitment {
  seatId: string
  armyIds: ArmyId[]
  cards: { armyId: ArmyId; cardId: string; value: number }[]
  commitmentBonus?: number
}

export interface BattleContext {
  id: string
  regionId: string
  attackerSeat: string
  defenderSeat: string
  commitments: Record<string, BattleCommitment>
  awaiting: string[]
  phase: 'commit' | 'resolved'
  resolved?: {
    attackerTotal: number
    defenderTotal: number
    defenderBonus: number
    winnerSeat: string
    cards: { seatId: string; armyId: ArmyId; value: number }[]
  }
}

export interface BattleRecord {
  id: string
  round: number
  regionId: string
  attackerSeat: string
  defenderSeat: string
  attackerTotal: number
  defenderTotal: number
  defenderBonus: number
  winnerSeat: string
  cards: { seatId: string; armyId: ArmyId; value: number }[]
}

export interface LogEntry {
  id: number
  text: string
  kind?: 'action' | 'battle' | 'event' | 'gain' | 'turn' | 'system'
  /** round the line was written in; 0 during setup */
  round?: number
  /** set on battle lines so History can attach the full battle record */
  battleId?: string
}

export interface GameConfig {
  seats: number
  vpTarget: number
  advanced: boolean
  eventFrequency: 'off' | 'every' | 'alternate' | 'every3'
  hiddenTokens: number
  resourceCap: number
  fortSupply: number
  sellRate: number
  tradeValue: number
  armyCardCost: number
  freeActions: number
  extraActionCost: number
  vpSteal: boolean
  startResources: number
  strictAffliction: boolean
  retreat: 'capital' | 'destroyed'
}

export interface GameState {
  config: GameConfig
  phase: Phase
  round: number
  turnOrder: string[] // seat ids
  activeSeatIdx: number
  activeSeat: string
  actionsLeft: number
  actionsUsed: number
  resourceCardDrawn: boolean
  resourceDeck: string[]
  resourceDiscard: string[]
  armyDeck: ArmyCard[]
  armyDiscard: { id: string; value: number }[]
  eventDeck: string[]
  eventDiscard: string[]
  prizeDeck: string[]
  topResourceCard: ResourceCardDef | null
  lastResourceCard: ResourceCardDef | null
  lastEventCard: EventCardDef | null
  lastBattle: BattleContext | null
  battleHistory: BattleRecord[]
  regions: Record<string, BoardRegionState>
  regionControl: Record<string, string | null> // regionId -> kingdomId
  regionEarnedBy: Record<string, string> // regionId -> seat that earned its VP (for fair VP-steal)
  kingdomIds: string[]
  seats: Record<string, Seat>
  kingdoms: Record<string, Kingdom>
  armies: Army[]
  pendingBattle: BattleContext | null
  battleSeq: number
  pendingPrize: { seatId: string; card: PrizeCard; reason: string; queue: string[] } | null
  pendingEventPlacement: { card: EventCardDef; targetsLeft: number; placed: number } | null
  log: LogEntry[]
  logSeq: number
  winner: string | null
  rngState: number
}

// ---------- Player actions (client -> engine) ----------

export type GameAction =
  | { type: 'draft'; personality: PersonalityId; abilities: AbilityId[] }
  | { type: 'sellResources'; resources: Partial<Record<Resource, number>>; trade?: number }
  | { type: 'buyArmyCard'; armyId: ArmyId; forge?: boolean }
  | { type: 'drawResource' }
  | { type: 'endResource' }
  | { type: 'moveArmy'; armyId: ArmyId; to: string }
  | { type: 'conquer'; regionId: string; payWithCards?: { armyId: ArmyId; cardId: string }[] }
  | { type: 'battleInit'; regionId: string }
  | { type: 'battleCommit'; cards: { armyId: ArmyId; cardId: string }[]; useStrategist?: boolean }
  | { type: 'revealHidden'; regionId: string }
  | { type: 'removeEvent'; regionId: string; useMedicine?: boolean; useCoins?: boolean }
  | { type: 'useAbility'; ability: AbilityId; payload?: { regionId?: string } }
  | { type: 'placeEventTarget'; regionId: string }
  | { type: 'choosePrize'; optionIndex: number }
  | { type: 'buyExtraAction' }
  | { type: 'endTurn' }
  | { type: 'undoMove' }

// ---------- Sanitized view (what each client is allowed to see) ----------

export type SanitizedState = GameState
