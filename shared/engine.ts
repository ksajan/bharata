import {
  ABILITIES,
  ARMY_DECK,
  CAPITAL_IDS,
  CONDITIONS,
  EVENT_CARDS,
  EVENT_DECK,
  HIDDEN_TOKEN_POOL,
  PERSONALITIES,
  PRIZE_CARDS,
  REGIONS,
  RESOURCE_CARDS,
  RESOURCE_DECK,
  SEAT_COLORS,
} from './data'
import type {
  AbilityId,
  Army,
  ArmyCard,
  ArmyId,
  EventCardDef,
  GameAction,
  GameConfig,
  GameState,
  Kingdom,
  PrizeCard,
  Region,
  Resource,
  ResourceCardDef,
  Seat,
} from './types'

export class GameError extends Error {}

// ---------------------------------------------------------------------------
// RNG (deterministic mulberry32, state carried in GameState.rngState)
// ---------------------------------------------------------------------------

function nextRand(state: GameState): number {
  let t = (state.rngState += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function shuffle<T>(state: GameState, arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(state) * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function log(state: GameState, text: string, kind: GameState['log'][number]['kind'] = 'action') {
  state.log.push({ id: state.logSeq++, text, kind })
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600)
}

function seatOf(state: GameState, id: string): Seat {
  const s = state.seats[id]
  if (!s) throw new GameError('Unknown seat')
  return s
}

export function armyOf(state: GameState, seatId: string, armyId: ArmyId): Army {
  const seat = seatOf(state, seatId)
  const army = state.armies.find((a) => a.ownerId === seatId && a.armyId === armyId)
  if (!army) throw new GameError('Unknown army')
  return army
}

export function armiesOfSeat(state: GameState, seatId: string): Army[] {
  return state.armies.filter((a) => a.ownerId === seatId)
}

export function armyPower(army: Army): number {
  return army.cards.reduce((t, c) => t + c.value, 0)
}

export function kingdomOf(state: GameState, seatId: string): Kingdom {
  return state.kingdoms[seatOf(state, seatId).kingdomId]
}

export function kingdomRegionIds(state: GameState, kingdomId: string): string[] {
  return Object.entries(state.kingdoms[kingdomId].forts).filter(([, k]) => k === kingdomId).map(([r]) => r)
}

function activeSeatObj(state: GameState): Seat {
  return seatOf(state, state.activeSeat)
}

function requireActive(state: GameState, seatId: string) {
  if (seatId !== state.activeSeat) throw new GameError('Not your turn')
}

function requirePhase(state: GameState, phase: GameState['phase']) {
  if (state.phase !== phase) throw new GameError(`Wrong phase (expected ${phase})`)
}

function clampRes(state: GameState, n: number) {
  return Math.min(state.config.resourceCap, n)
}

function gainResource(state: GameState, seat: Seat, res: Resource, n: number) {
  seat[res] = clampRes(state, seat[res] + n)
}

function gainKey(state: GameState, seat: Seat, key: Resource | 'trade' | 'coins', n: number) {
  if (key === 'trade') seat.trade = Math.max(0, seat.trade + n)
  else if (key === 'coins') seat.coins = Math.max(0, seat.coins + n)
  else gainResource(state, seat, key, n)
}

function controlsCapital(state: GameState, seat: Seat): boolean {
  const k = kingdomOf(state, seat.id)
  return k.forts[k.capital] === k.id
}

function hasAbility(seat: Seat, id: AbilityId): boolean {
  return seat.abilities.includes(id)
}

function seatAfflicted(state: GameState, seatId: string): boolean {
  const k = kingdomOf(state, seatId)
  return Object.entries(k.forts).some(([rid, kid]) => kid === k.id && (state.regions[rid]?.eventTokens.length ?? 0) > 0)
}

function afflictedRegionIds(state: GameState, seatId: string): string[] {
  const k = kingdomOf(state, seatId)
  return Object.entries(k.forts)
    .filter(([rid, kid]) => kid === k.id && (state.regions[rid]?.eventTokens.length ?? 0) > 0)
    .map(([rid]) => rid)
}

function rulerSeatOfKingdomRegion(state: GameState, regionId: string): Seat | null {
  const kid = state.regionControl[regionId]
  if (!kid) return null
  const k = state.kingdoms[kid]
  return seatOf(state, k.seats[0])
}

function checkWin(state: GameState) {
  const target = state.config.vpTarget
  const candidates = Object.values(state.seats)
    .filter((s) => s.vp >= target)
    .sort((a, b) => b.vp - a.vp)
  if (candidates.length > 0) {
    state.phase = 'gameover'
    state.winner = candidates[0].id
    log(state, `👑 ${candidates[0].name} reaches ${candidates[0].vp} victory points and wins the age of Bharata!`, 'system')
  }
}

function transferControl(state: GameState, regionId: string, toKingdomId: string | null, bySeatId?: string): boolean {
  const region = REGIONS[regionId]
  const prevKingdomId = state.regionControl[regionId] ?? null
  if (prevKingdomId === toKingdomId) return false
  if (prevKingdomId) {
    const prev = state.kingdoms[prevKingdomId]
    delete prev.forts[regionId]
    prev.fortSupply += 1
    if (state.config.vpSteal && toKingdomId) {
      // charge the seat that earned the region's VP (co-ruler aware), else the kingdom's first seat
      const earnedBy = state.regionEarnedBy[regionId]
      const prevSeat =
        (earnedBy && state.seats[earnedBy]?.kingdomId === prevKingdomId ? state.seats[earnedBy] : null) ??
        seatOf(state, prev.seats[0])
      const loss = Math.min(prevSeat.vp, region.value)
      prevSeat.vp -= loss
      if (loss > 0) log(state, `${prevSeat.name} loses ${loss} VP (region seized).`, 'gain')
    }
  }
  delete state.regionEarnedBy[regionId]
  if (!toKingdomId) {
    state.regionControl[regionId] = null
    return true
  }
  const k = state.kingdoms[toKingdomId]
  if (k.fortSupply <= 0) {
    log(state, `${k.name} has no forts left in the supply — ${REGIONS[regionId].name} cannot be garrisoned.`, 'action')
    return false
  }
  state.regionControl[regionId] = toKingdomId
  k.forts[regionId] = k.id
  k.fortSupply -= 1
  if (bySeatId) state.regionEarnedBy[regionId] = bySeatId
  return true
}

function drawArmyCard(state: GameState): ArmyCard {
  if (state.armyDeck.length === 0) {
    state.armyDeck = shuffle(state, state.armyDiscard.map((c) => ({ id: c.id, value: c.value })))
    state.armyDiscard = []
    if (state.armyDeck.length === 0) return { id: `a-emg-${state.logSeq++}`, value: 2 }
  }
  return state.armyDeck.pop()!
}

function drawResourceCard(state: GameState): ResourceCardDef {
  if (state.resourceDeck.length === 0) {
    state.resourceDeck = shuffle(state, state.resourceDiscard)
    state.resourceDiscard = []
    if (state.resourceDeck.length === 0) state.resourceDeck = shuffle(state, Object.keys(RESOURCE_CARDS))
  }
  const id = state.resourceDeck.pop()!
  state.resourceDiscard.push(id)
  return RESOURCE_CARDS[id]
}

function drawEventCard(state: GameState): EventCardDef {
  if (state.eventDeck.length === 0) {
    state.eventDeck = shuffle(state, state.eventDiscard)
    state.eventDiscard = []
    if (state.eventDeck.length === 0) state.eventDeck = shuffle(state, Object.keys(EVENT_CARDS))
  }
  const id = state.eventDeck.pop()!
  state.eventDiscard.push(id)
  return EVENT_CARDS[id]
}

function drawPrizeCard(state: GameState): PrizeCard {
  if (state.prizeDeck.length === 0) {
    state.prizeDeck = shuffle(state, PRIZE_CARDS.map((p) => p.id))
  }
  const id = state.prizeDeck.pop()!
  return PRIZE_CARDS.find((p) => p.id === id)!
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface SeatInfo {
  id: string
  name: string
}

export const DEFAULT_CONFIG: GameConfig = {
  seats: 4,
  vpTarget: 20,
  advanced: true,
  eventFrequency: 'alternate',
  hiddenTokens: 10,
  resourceCap: 10,
  fortSupply: 6,
  sellRate: 2,
  tradeValue: 2,
  armyCardCost: 2,
  freeActions: 2,
  extraActionCost: 1,
  vpSteal: true,
  startResources: 4,
  strictAffliction: true,
  retreat: 'capital',
}

export function createGame(cfgIn: Partial<GameConfig>, seatInfos: SeatInfo[]): GameState {
  const clamp = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : dflt
  }
  const config: GameConfig = {
    ...DEFAULT_CONFIG,
    ...cfgIn,
    seats: seatInfos.length,
    vpTarget: clamp(cfgIn.vpTarget, 5, 100, 20),
    advanced: cfgIn.advanced !== false,
    eventFrequency: (['off', 'every', 'alternate', 'every3'] as const).includes(cfgIn.eventFrequency as never)
      ? cfgIn.eventFrequency!
      : 'alternate',
    hiddenTokens: clamp(cfgIn.hiddenTokens, 0, 14, 10),
    resourceCap: clamp(cfgIn.resourceCap, 1, 20, 10),
    fortSupply: clamp(cfgIn.fortSupply, 1, 20, 6),
    sellRate: clamp(cfgIn.sellRate, 1, 5, 2),
    tradeValue: clamp(cfgIn.tradeValue, 0, 10, 2),
    armyCardCost: clamp(cfgIn.armyCardCost, 0, 20, 2),
    freeActions: clamp(cfgIn.freeActions, 1, 5, 2),
    extraActionCost: clamp(cfgIn.extraActionCost, 0, 10, 1),
    startResources: clamp(cfgIn.startResources, 0, 10, 4),
  }
  if (config.seats === 2 && cfgIn.vpTarget === undefined) config.vpTarget = 25
  if (config.seats > 4 && cfgIn.vpTarget === undefined) config.vpTarget = 20 + Math.ceil((config.seats - 4) / 2) * 5
  // events every turn overwhelm rulers — 4+ rulers default to one event round in three
  if (config.seats >= 4 && cfgIn.eventFrequency === undefined && config.eventFrequency === 'every') {
    config.eventFrequency = 'every3'
  }

  const state: GameState = {
    config,
    phase: 'draft',
    round: 0,
    turnOrder: seatInfos.map((s) => s.id),
    activeSeatIdx: 0,
    activeSeat: seatInfos[0].id,
    actionsLeft: 0,
    actionsUsed: 0,
    resourceCardDrawn: false,
    resourceDeck: [],
    resourceDiscard: [],
    armyDeck: [],
    armyDiscard: [],
    eventDeck: [],
    eventDiscard: [],
    prizeDeck: [],
    regionEarnedBy: {},
    battleSeq: 0,
    topResourceCard: null,
    regions: {},
    seats: {},
    kingdoms: {},
    armies: [],
    regionControl: {},
    kingdomIds: [],
    pendingBattle: null,
    pendingPrize: null,
    pendingEventPlacement: null,
    lastEventCard: null,
    lastResourceCard: null,
    log: [],
    logSeq: 1,
    winner: null,
    rngState: (Math.floor(Math.random() * 2 ** 31) | 0) >>> 0,
  } as unknown as GameState

  // kingdoms: 1 seat per kingdom for 2-4; pairs beyond seat 4 share a kingdom
  const kingdomCount = Math.min(seatInfos.length, 4)
  state.kingdomIds = Array.from({ length: kingdomCount }, (_, i) => `k${i}`)

  const shuffledCapitals = shuffle(state, [...CAPITAL_IDS])

  // decks must exist before setup draws
  state.resourceDeck = shuffle(state, [...RESOURCE_DECK])
  state.eventDeck = shuffle(state, [...EVENT_DECK])
  state.prizeDeck = shuffle(state, PRIZE_CARDS.map((p) => p.id))
  state.armyDeck = shuffle(state, ARMY_DECK.map((c) => ({ ...c, id: `${c.id}` })))

  seatInfos.forEach((info, i) => {
    const kid = `k${i < 4 ? i : i - 4}`
    state.seats[info.id] = {
      id: info.id,
      name: info.name,
      color: SEAT_COLORS[i % SEAT_COLORS.length],
      connected: true,
      kingdomId: kid,
      personality: null,
      abilities: [],
      abilityUsesLeft: {},
      vp: 0,
      coins: 0,
      trade: 0,
      medicine: 0,
      iron: config.startResources,
      wood: config.startResources,
      food: config.startResources,
      winsBattles: 0,
      conditionsMet: [],
      armiesOwned: [1, 2],
    } as Seat
  })

  // kingdoms get names/capitals; seats 4-7 are co-rulers of kingdoms 0-3
  // kingdoms take the name of their capital region — no confusing mismatches
  state.kingdomIds.forEach((kid, i) => {
    const memberSeats = Object.values(state.seats).filter((s) => s.kingdomId === kid)
    const capital = shuffledCapitals[i % shuffledCapitals.length]
    state.kingdoms[kid] = {
      id: kid,
      name: REGIONS[capital].name,
      capital,
      seats: memberSeats.map((s) => s.id),
      color: memberSeats[0]?.color ?? '#888',
      fortSupply: config.fortSupply,
      forts: {},
    }
    state.regionControl[capital] = kid
    state.kingdoms[kid].forts[capital] = kid

    memberSeats.forEach((s, si) => {
      s.armiesOwned = si === 0 ? (memberSeats.length > 1 ? [1] : [1, 2]) : [2]
      for (const aid of s.armiesOwned) {
        state.armies.push({
          id: `${s.id}-${aid}`,
          armyId: aid as ArmyId,
          ownerId: s.id,
          regionId: capital,
          alive: true,
          cards: [],
        })
      }
      const c1 = drawArmyCard(state)
      const c2 = drawArmyCard(state)
      state.armies.find((a) => a.ownerId === s.id && a.armyId === (s.armiesOwned[0] as ArmyId))!.cards.push(c1, c2)
    })
  })

  // region board state
  for (const rid of Object.keys(REGIONS)) {
    state.regions[rid] = { armies: [], eventTokens: [], hiddenToken: null }
  }
  if (config.advanced && config.hiddenTokens > 0) {
    const spots = shuffle(state, Object.values(REGIONS).filter((r) => r.hiddenSpot).map((r) => r.id))
    const tokens = shuffle(state, [...HIDDEN_TOKEN_POOL]).slice(0, Math.min(config.hiddenTokens, spots.length))
    tokens.forEach((t, i) => {
      state.regions[spots[i]].hiddenToken = t.id
    })
  }

  syncOccupation(state)
  log(state, `The age of the Mahajanapadas begins. ${seatInfos.length} rulers take the stage.`, 'system')
  log(state, `👑 Goal: first ruler to ${config.vpTarget} victory points wins. Tip: start by drawing your resource card.`, 'system')
  return state
}

// ---------------------------------------------------------------------------
// Turn / phase plumbing
// ---------------------------------------------------------------------------

function beginTurn(state: GameState) {
  state.phase = 'resource'
  state.resourceCardDrawn = false
  state.actionsLeft = 0
  state.actionsUsed = 0
  const seat = activeSeatObj(state)
  const k = kingdomOf(state, seat.id)
  log(state, `— Turn ${state.round}: ${seat.name} (Kingdom of ${k.name}) —`, 'turn')
}

function advanceTurn(state: GameState) {
  state.activeSeatIdx = (state.activeSeatIdx + 1) % state.turnOrder.length
  if (state.activeSeatIdx === 0) state.round += 1
  state.activeSeat = state.turnOrder[state.activeSeatIdx]
  state.phase = 'resource'
  state.resourceCardDrawn = false
  state.actionsLeft = 0
  state.actionsUsed = 0
  state.pendingEventPlacement = null
  state.lastEventCard = null
  const seat = activeSeatObj(state)
  const k = kingdomOf(state, seat.id)
  log(state, `— ${seat.name} (Kingdom of ${k.name}) rises to rule —`, 'turn')
}

function finishTurnNow(state: GameState) {
  const seat = activeSeatObj(state)
  const k = kingdomOf(state, seat.id)

  // riots that survived the ruler's turn topple forts
  for (const rid of Object.entries(k.forts).filter(([, kid]) => kid === k.id).map(([rid]) => rid)) {
    const tokens = state.regions[rid]?.eventTokens ?? []
    const riot = tokens.find((t) => t.kind === 'riot')
    if (riot) {
      const region = REGIONS[rid]
      log(state, `🔥 Riot in ${region.name}! ${seat.name} loses control of the region.`, 'event')
      state.regions[rid].eventTokens = tokens.filter((t) => t !== riot)
      transferControl(state, rid, null)
    }
  }

  // victory point condition check
  if (checkConditions(state, seat)) return // prize pending; turn continues after choice
  checkWin(state)
  if (state.phase !== 'gameover') advanceTurn(state)
}

function regionCountForSeat(state: GameState, seat: Seat): number {
  const k = kingdomOf(state, seat.id)
  return Object.values(k.forts).filter((x) => x === k.id).length
}

function harborCountForSeat(state: GameState, seat: Seat): number {
  return kingdomRegionIds(state, seat.kingdomId).filter((rid) => REGIONS[rid].harbor).length
}

function checkConditions(state: GameState, seat: Seat): boolean {
  const met: string[] = []
  for (const c of CONDITIONS) {
    if (seat.conditionsMet.includes(c.id)) continue
    let ok = false
    switch (c.id) {
      case 'empire': ok = regionCountForSeat(state, seat) >= 5; break
      case 'warlord': ok = seat.winsBattles >= 1; break
      case 'magnate': ok = seat.coins >= 15; break
      case 'stockpile': ok = Math.max(seat.iron, seat.wood, seat.food) >= 9; break
      case 'ports': ok = harborCountForSeat(state, seat) >= 2; break
      case 'caravans': ok = seat.trade >= 3; break
    }
    if (ok) met.push(c.id)
  }
  if (met.length === 0) return false
  seat.conditionsMet.push(...met)
  const def = CONDITIONS.find((c) => c.id === met[0])!
  const prize = drawPrizeCard(state)
  state.pendingPrize = { seatId: seat.id, card: prize, reason: def.title, queue: met.length > 1 ? met.slice(1) : [] }
  log(state, `🏆 ${seat.name} achieves “${def.title}”!`, 'gain')
  return true
}

function applyPrizeEffect(state: GameState, seat: Seat, effect: PrizeCard['options'][number]['effect']) {
  switch (effect.kind) {
    case 'vp': seat.vp += effect.n; log(state, `${seat.name} gains ${effect.n} VP.`, 'gain'); break
    case 'coins': seat.coins += effect.n; log(state, `${seat.name} gains ${effect.n} coins.`, 'gain'); break
    case 'trade': seat.trade += effect.n; log(state, `${seat.name} gains trade objects.`, 'gain'); break
    case 'resource': gainResource(state, seat, effect.res, effect.n); log(state, `${seat.name} gains ${effect.n} ${effect.res}.`, 'gain'); break
    case 'draw_army': {
      for (let i = 0; i < effect.n; i++) {
        const card = drawArmyCard(state)
        const armies = armiesOfSeat(state, seat.id)
        const alive = armies.find((a) => a.alive)
        const target = alive ?? armies[0]
        if (target) {
          if (!target.alive) {
            target.alive = true
            target.regionId = kingdomOf(state, seat.id).capital
          }
          target.cards.push(card)
        }
      }
      log(state, `${seat.name} reinforces an army.`, 'gain')
      break
    }
  }
}

// ---------------------------------------------------------------------------
// Main action handler — mutates state, throws GameError on invalid input
// ---------------------------------------------------------------------------

/** true when at least one region legally satisfies the pending event's target constraints */
export function hasValidEventTarget(state: GameState): boolean {
  const pe = state.pendingEventPlacement
  if (!pe) return true
  const t = pe.card.target
  for (const region of Object.values(REGIONS)) {
    if (t.river && !region.river) continue
    if (t.harbor && !region.harbor) continue
    if (t.arid && !region.arid) continue
    if (t.yieldsFood && !(region.yields.food ?? 0)) continue
    if (t.hasArmy && (state.regions[region.id]?.armies.length ?? 0) === 0) continue
    if (t.riot && !state.regionControl[region.id]) continue
    if ((state.regions[region.id]?.eventTokens.length ?? 0) >= 2) continue
    const rulerKingdomId = state.regionControl[region.id]
    if (rulerKingdomId) {
      const kingdom = state.kingdoms[rulerKingdomId]
      const immune = kingdom.seats.some((sid) =>
        (state.seats[sid]?.abilities ?? []).some((ab) => (ABILITIES[ab].immuneTo ?? []).includes(pe.card.kind)),
      )
      if (immune) continue
    }
    return true
  }
  return false
}

export function handleAction(state: GameState, seatId: string, action: GameAction): void {
  _applyAction(state, seatId, action)
  // bookkeeping guarantee: occupation is always derived-fresh after any action
  syncOccupation(state)
}

function _applyAction(state: GameState, seatId: string, action: GameAction): void {
  switch (action.type) {
    // ----- draft -----
    case 'draft': {
      const seat = seatOf(state, seatId)
      if (state.phase !== 'draft') throw new GameError('Draft already done')
      if (seat.personality) throw new GameError('Already drafted')
      // validate everything BEFORE mutating
      if (!Object.prototype.hasOwnProperty.call(PERSONALITIES, action.personality)) throw new GameError('Unknown personality')
      const uniq = [...new Set(action.abilities ?? [])]
      if (state.config.advanced) {
        if (uniq.length !== 2) throw new GameError('Pick exactly 2 abilities')
        for (const a of uniq) {
          if (!Object.prototype.hasOwnProperty.call(ABILITIES, a)) throw new GameError(`Unknown ability: ${a}`)
        }
      }
      seat.personality = action.personality
      if (state.config.advanced) {
        seat.abilities = uniq
        seat.abilityUsesLeft = Object.fromEntries(uniq.map((a) => [a, ABILITIES[a].uses]))
      }
      log(state, `${seat.name} chooses ${PERSONALITIES[action.personality].name}.`, 'system')
      if (Object.values(state.seats).every((s) => s.personality)) {
        state.phase = 'resource'
        state.round = 1
        beginTurn(state)
      }
      return
    }

    // ----- resource phase -----
    case 'drawResource': {
      requireActive(state, seatId)
      requirePhase(state, 'resource')
      if (state.resourceCardDrawn) throw new GameError('Resource card already drawn')
      const seat = activeSeatObj(state)
      const card = drawResourceCard(state)
      state.lastResourceCard = card
      state.resourceCardDrawn = true

      if (card.title === 'Famine') {
        for (const s of Object.values(state.seats)) s.food = Math.max(0, s.food - 1)
      } else if (card.title === 'Bandits on the Roads') {
        seat.trade = Math.max(0, seat.trade - 1)
      } else {
        if (card.all) {
          for (const s of Object.values(state.seats)) {
            for (const [k, n] of Object.entries(card.all)) gainKey(state, s, k as Resource | 'trade' | 'coins', n!)
          }
        }
        if (card.active) {
          for (const [k, n] of Object.entries(card.active)) gainKey(state, seat, k as Resource | 'trade' | 'coins', n!)
        }
      }
      // personalities
      if (seat.personality === 'iron_raja') gainResource(state, seat, 'iron', 1)
      if (seat.personality === 'granary_keeper') gainResource(state, seat, 'food', 1)

      log(state, `📜 ${seat.name} draws “${card.title}”: ${card.text}`, 'gain')
      return
    }

    case 'sellResources': {
      requireActive(state, seatId)
      requirePhase(state, 'resource')
      const seat = activeSeatObj(state)
      // validate & coerce before any mutation
      const res: Partial<Record<Resource, number>> = {}
      let total = 0
      for (const r of ['iron', 'wood', 'food'] as Resource[]) {
        const n = Number((action.resources as Record<string, unknown>)?.[r] ?? 0)
        if (!Number.isInteger(n) || n < 0) throw new GameError(`Invalid ${r} amount`)
        if (seat[r] < n) throw new GameError(`Not enough ${r}`)
        res[r] = n
        total += n
      }
      const tradeN = Number(action.trade ?? 0)
      if (!Number.isInteger(tradeN) || tradeN < 0) throw new GameError('Invalid trade amount')
      if (seat.trade < tradeN) throw new GameError('Not enough trade objects')
      if (total === 0 && tradeN === 0) throw new GameError('Nothing to sell')

      const rate = seat.personality === 'merchant_prince' ? 1 : state.config.sellRate
      if (total % rate !== 0) throw new GameError(`Sell in groups of ${rate}`)
      let coins = total / rate

      if (tradeN > 0) {
        const hasHarbor = harborCountForSeat(state, seat) > 0
        if (!hasHarbor && seat.personality !== 'merchant_prince') {
          throw new GameError('You must control an export harbor to sell trade objects')
        }
        coins += tradeN * state.config.tradeValue
      }
      for (const r of ['iron', 'wood', 'food'] as Resource[]) {
        seat[r] -= res[r]!
      }
      seat.trade -= tradeN
      seat.coins += coins
      log(state, `${seat.name} sells goods for ${coins} coins.`, 'gain')
      return
    }

    case 'buyArmyCard': {
      requireActive(state, seatId)
      requirePhase(state, 'resource')
      const seat = activeSeatObj(state)
      if (!seat.armiesOwned.includes(action.armyId)) throw new GameError('Not your army')
      const army = armyOf(state, seatId, action.armyId)
      const forge = action.forge === true
      if (army.cards.length >= 10) throw new GameError('That army already carries 10 battle cards')
      if (forge) {
        // Forge levy: bend iron into weapons — 2 iron + 1 coin
        if (seat.iron < 2) throw new GameError('The forge needs 2 iron')
        if (seat.coins < 1) throw new GameError('The forge needs 1 coin')
      } else {
        if (seat.coins < state.config.armyCardCost) throw new GameError(`Costs ${state.config.armyCardCost} coins`)
      }
      // validate respawn precondition BEFORE spending anything
      if (!army.alive) {
        const anyAlive = armiesOfSeat(state, seatId).some((a) => a.alive)
        if (!controlsCapital(state, seat) && anyAlive) {
          throw new GameError('Army is destroyed — retake your capital before it can respawn')
        }
      }
      if (forge) {
        seat.iron -= 2
        seat.coins -= 1
      } else {
        seat.coins -= state.config.armyCardCost
      }
      const card = drawArmyCard(state)
      if (!army.alive) {
        army.alive = true
        army.regionId = kingdomOf(state, seat.id).capital
        log(
          state,
          controlsCapital(state, seat)
            ? `🎺 An army of ${seat.name} respawns at the capital.`
            : `🔥 ${seat.name} has no armies left — a fresh host rises in rebellion at the capital!`,
          'action',
        )
      }
      army.cards.push(card)
      syncOccupation(state)
      log(state, `${seat.name} ${forge ? 'forges' : 'buys'} an army card (value ${card.value}).`, 'gain')
      return
    }

    case 'endResource': {
      requireActive(state, seatId)
      requirePhase(state, 'resource')
      if (!state.resourceCardDrawn) throw new GameError('Draw the resource card first')
      const seat = activeSeatObj(state)
      if (seat.personality === 'tax_collector') seat.coins += 1
      state.phase = 'action'
      state.actionsLeft = state.config.freeActions
      state.actionsUsed = 0
      log(state, `${seat.name} takes the stage — ${state.actionsLeft} free actions.`, 'turn')
      return
    }

    // ----- action phase -----
    case 'buyExtraAction': {
      requireActive(state, seatId)
      requirePhase(state, 'action')
      enforceBattlePending(state)
      const seat = activeSeatObj(state)
      if (seat.coins < state.config.extraActionCost) throw new GameError('Not enough coins')
      seat.coins -= state.config.extraActionCost
      state.actionsLeft += 1
      log(state, `${seat.name} buys an extra action.`, 'action')
      return
    }

    case 'moveArmy': {
      requireActive(state, seatId)
      requirePhase(state, 'action')
      enforceBattlePending(state)
      const seat = activeSeatObj(state)
      if (state.actionsLeft <= 0) throw new GameError('No actions left')
      enforceAffliction(state, seat)
      const army = armyOf(state, seatId, action.armyId)
      if (!army.alive || !army.regionId) throw new GameError('Army is destroyed')
      const from = army.regionId
      if (!REGIONS[from].neighbors.includes(action.to)) throw new GameError('Can only move to a neighboring region')
      // armies without battle cards cannot march into enemy-held ground
      const destEnemies = state.regions[action.to].armies.filter(
        (a) => kingdomOf(state, a.seatId).id !== kingdomOf(state, seatId).id,
      )
      if (destEnemies.length > 0 && army.cards.length === 0) {
        throw new GameError('Your army has no battle cards — reinforce it before marching into enemy ground')
      }
      army.regionId = action.to
      syncOccupation(state)
      state.actionsLeft -= 1
      state.actionsUsed += 1
      log(state, `🗡 ${seat.name} marches an army into ${REGIONS[action.to].name}.`, 'action')

      // entering a region with an enemy army triggers a battle
      if (destEnemies.length > 0) {
        startBattle(state, seatId, action.to, destEnemies[0].seatId)
      }
      return
    }

    case 'conquer': {
      requireActive(state, seatId)
      requirePhase(state, 'action')
      enforceBattlePending(state)
      const seat = activeSeatObj(state)
      const k = kingdomOf(state, seatId)
      if (state.actionsLeft <= 0) throw new GameError('No actions left')
      enforceAffliction(state, seat)
      const region = REGIONS[action.regionId]
      if (!region) throw new GameError('Unknown region')
      const myArmiesHere = armiesOfSeat(state, seatId).filter((a) => a.alive && a.regionId === action.regionId)
      if (myArmiesHere.length === 0) throw new GameError('You need an army in the region to conquer it')
      if (state.regionControl[action.regionId] === k.id) throw new GameError('You already rule this region')
      if (k.fortSupply <= 0) throw new GameError('No forts left in your supply')
      const enemyArmy = state.regions[action.regionId].armies.find(
        (a) => kingdomOf(state, a.seatId).id !== k.id,
      )
      if (enemyArmy) throw new GameError('Enemy army present — battle instead of conquering')

      if (region.kind === 'province') {
        let cost = region.value
        if (seat.personality === 'master_mason') cost = Math.max(1, cost - 1)
        if (seat.coins < cost) throw new GameError(`Conquering costs ${cost} coins`)
        seat.coins -= cost
      } else {
        // Mahajanapada: pay `value` army cards from your armies
        const pay = action.payWithCards ?? []
        if (pay.length !== region.value) throw new GameError(`Conquering costs ${region.value} army cards`)
        const ownedArmies = armiesOfSeat(state, seatId)
        const seen = new Set<string>()
        for (const p of pay) {
          if (seen.has(p.cardId)) throw new GameError('Duplicate card payment')
          seen.add(p.cardId)
          const army = ownedArmies.find((a) => a.armyId === p.armyId)
          const card = army?.cards.find((c) => c.id === p.cardId)
          if (!army || !card) throw new GameError('Invalid army card payment')
          army.cards = army.cards.filter((c) => c.id !== p.cardId)
          state.armyDiscard.push({ id: card.id, value: card.value })
        }
        for (const army of ownedArmies) {
          if (army.alive && army.cards.length === 0) {
            army.alive = false
            army.regionId = null
            log(state, `☠ An army of ${seat.name} disbands — no battle cards left.`, 'action')
          }
        }
      }

      const prevOwner = state.regionControl[action.regionId]
      transferControl(state, action.regionId, k.id, seatId)
      gainConquestRewards(state, seat, region)
      syncOccupation(state)
      state.actionsLeft -= 1
      state.actionsUsed += 1
      log(
        state,
        `🏳 ${seat.name} conquers ${region.name} (${region.kind === 'province' ? 'province' : 'Mahajanapada'})` +
          (prevOwner ? `, seizing it from ${state.kingdoms[prevOwner]?.name ?? 'rivals'}` : '') + '.',
        'action',
      )
      checkWin(state)
      return
    }

    case 'battleInit': {
      requireActive(state, seatId)
      requirePhase(state, 'action')
      enforceBattlePending(state)
      const seat = activeSeatObj(state)
      if (state.actionsLeft <= 0) throw new GameError('No actions left')
      enforceAffliction(state, seat)
      const myArmiesHere = armiesOfSeat(state, seatId).filter((a) => a.alive && a.regionId === action.regionId)
      if (myArmiesHere.length === 0) throw new GameError('No army of yours in that region')
      if (myArmiesHere.every((a) => a.cards.length === 0)) {
        throw new GameError('Your armies have no battle cards to commit')
      }
      const enemy = state.regions[action.regionId].armies.find(
        (a) => kingdomOf(state, a.seatId).id !== kingdomOf(state, seatId).id,
      )
      if (!enemy) throw new GameError('No enemy army there')
      state.actionsLeft -= 1
      state.actionsUsed += 1
      startBattle(state, seatId, action.regionId, enemy.seatId)
      return
    }

    case 'battleCommit': {
      const battle = state.pendingBattle
      if (!battle) throw new GameError('No battle in progress')
      if (battle.phase !== 'commit') throw new GameError('Battle already resolved')
      if (!battle.awaiting.includes(seatId)) throw new GameError('Not part of this battle')
      const seat = seatOf(state, seatId)
      let bonus = 0
      // validate cards & strategist BEFORE mutating anything
      const ownedArmies = armiesOfSeat(state, seatId)
      const chosen: { armyId: ArmyId; cardId: string; value: number }[] = []
      const seen = new Set<string>()
      for (const p of action.cards) {
        if (seen.has(p.cardId)) throw new GameError('Duplicate card')
        seen.add(p.cardId)
        if (!seat.armiesOwned.includes(p.armyId)) throw new GameError('Not your army')
        const army = ownedArmies.find((a) => a.armyId === p.armyId)
        const card = army?.cards.find((c) => c.id === p.cardId)
        if (!army || !card) throw new GameError('Card not in that army')
        chosen.push({ armyId: p.armyId, cardId: card.id, value: card.value })
      }
      // The defender draws from a single army (rules); the attacker may wield both.
      const usedArmies = [...new Set(chosen.map((c) => c.armyId))]
      if (seatId === battle.defenderSeat && usedArmies.length > 1) {
        throw new GameError('The defender commits cards from a single army only')
      }
      if (action.useStrategist) {
        if ((seat.abilityUsesLeft['strategist'] ?? 0) <= 0) throw new GameError('No Strategist uses left')
        seat.abilityUsesLeft['strategist'] -= 1
        bonus = 3
      }
      battle.commitments[seatId] = { seatId, armyIds: usedArmies, cards: chosen, commitmentBonus: bonus || undefined }
      battle.awaiting = battle.awaiting.filter((s) => s !== seatId)
      log(state, `${seat.name} commits ${chosen.length} battle card(s).`, 'battle')
      if (battle.awaiting.length === 0) resolveBattle(state)
      return
    }

    case 'revealHidden': {
      requireActive(state, seatId)
      requirePhase(state, 'action')
      enforceBattlePending(state)
      const seat = activeSeatObj(state)
      if (!state.config.advanced) throw new GameError('Advanced mode only')
      if (state.actionsLeft <= 0) throw new GameError('No actions left')
      enforceAffliction(state, seat)
      const bstate = state.regions[action.regionId]
      if (!bstate?.hiddenToken) throw new GameError('No hidden token there')
      const present = armiesOfSeat(state, seatId).some((a) => a.alive && a.regionId === action.regionId)
      if (!present) throw new GameError('Your army must be present to search')
      const token = bstate.hiddenToken
      bstate.hiddenToken = null
      state.actionsLeft -= 1
      state.actionsUsed += 1
      revealToken(state, seat, token, action.regionId)
      return
    }

    case 'removeEvent': {
      requireActive(state, seatId)
      requirePhase(state, 'action')
      enforceBattlePending(state)
      const seat = activeSeatObj(state)
      if (state.actionsLeft <= 0) throw new GameError('No actions left')
      const k = kingdomOf(state, seatId)
      if (k.forts[action.regionId] !== k.id) throw new GameError('You do not rule that region')
      const tokens = state.regions[action.regionId].eventTokens
      if (tokens.length === 0) throw new GameError('No event there')
      const token = tokens[0]
      const rem = EVENT_CARDS[eventKindToCardId(token.kind)]?.removal ?? { food: 2 }
      if (action.useMedicine) {
        if (!rem.medicine) throw new GameError('Medicine cannot cure this event')
        if (seat.medicine < 1) throw new GameError('No medicine')
        seat.medicine -= 1
      } else if (action.useCoins) {
        // coin alternative: 3 coins per missing resource, minimum 3 coins
        const needW = rem.wood ? Math.max(0, rem.wood - seat.wood) : 0
        const needF = rem.food ? Math.max(0, rem.food - seat.food) : 0
        const coinCost = Math.max(3, needW * 3 + needF * 3)
        if (seat.coins < coinCost) throw new GameError(`Clearing by coin costs ${coinCost} coins`)
        seat.coins -= coinCost
      } else {
        const missing: string[] = []
        if (rem.coins && seat.coins < rem.coins) missing.push(`${rem.coins} coins`)
        if (rem.wood && seat.wood < rem.wood) missing.push(`${rem.wood} wood`)
        if (rem.food && seat.food < rem.food) missing.push(`${rem.food} food`)
        if (missing.length) throw new GameError(`Need ${missing.join(', ')} — or clear it with coins`)
        if (rem.coins) seat.coins -= rem.coins
        if (rem.wood) seat.wood -= rem.wood
        if (rem.food) seat.food -= rem.food
      }
      state.regions[action.regionId].eventTokens = tokens.slice(1)
      state.actionsLeft -= 1
      state.actionsUsed += 1
      log(state, `🛠 ${seat.name} clears the ${token.kind} from ${REGIONS[action.regionId].name}.`, 'event')
      return
    }

    case 'useAbility': {
      requireActive(state, seatId)
      const seat = seatOf(state, seatId)
      const ability = ABILITIES[action.ability]
      if (!ability || !seat.abilities.includes(action.ability)) throw new GameError('You do not have that ability')
      if ((seat.abilityUsesLeft[action.ability] ?? 0) <= 0) throw new GameError('No uses left')
      if (action.ability === 'strategist') throw new GameError('Declare Strategist when committing battle cards')
      if (action.ability === 'river_sage') {
        if (!action.payload?.regionId) throw new GameError('Choose a region')
        const rs = state.regions[action.payload.regionId]
        if (!rs || rs.eventTokens.length === 0) throw new GameError('No event token there')
      }
      if (action.ability === 'seer') {
        if (state.phase !== 'event' || !state.pendingEventPlacement) throw new GameError('Use the Seer right after an event card is drawn')
        if (state.pendingEventPlacement.placed > 0) throw new GameError('Too late — targets already placed')
      }
      seat.abilityUsesLeft[action.ability] -= 1
      switch (action.ability) {
        case 'river_sage': {
          if (!action.payload?.regionId) throw new GameError('Choose a region')
          const rs = state.regions[action.payload.regionId]
          if (!rs || rs.eventTokens.length === 0) throw new GameError('No event token there')
          const kind = rs.eventTokens[0].kind
          rs.eventTokens = rs.eventTokens.slice(1)
          log(state, `🌊 ${seat.name} (Ganga Sage) soothes the ${kind} at ${REGIONS[action.payload.regionId].name}.`, 'event')
          break
        }
        case 'physician':
          seat.medicine += 1
          log(state, `🌿 ${seat.name} (Vaidya) prepares 1 Medicine.`, 'event')
          break
        case 'peacemaker': {
          let n = 0
          const k = kingdomOf(state, seatId)
          for (const rid of Object.keys(k.forts)) {
            if (k.forts[rid] === k.id && state.regions[rid].eventTokens.length > 0) {
              n += state.regions[rid].eventTokens.length
              state.regions[rid].eventTokens = []
            }
          }
          log(state, `🕊 ${seat.name} (Peacemaker) clears ${n} event token(s).`, 'event')
          break
        }
        case 'rainmaker':
          for (const s of Object.values(state.seats)) gainResource(state, s, 'food', 1)
          gainResource(state, seat, 'food', 1)
          log(state, `🌧 ${seat.name} (Rainmaker) brings the rains.`, 'event')
          break
        case 'shipwright':
          seat.trade += 1
          seat.coins += 1
          log(state, `⛵ ${seat.name} (Shipwright) profits from the harbors.`, 'event')
          break
        case 'quartermaster':
          seat.coins += 1
          gainResource(state, seat, 'iron', 1)
          gainResource(state, seat, 'food', 1)
          log(state, `📦 ${seat.name} (Quartermaster) restocks the stores.`, 'event')
          break
        case 'seer': {
          const pe = state.pendingEventPlacement
          if (!pe) throw new GameError('No omen to avert')
          state.eventDiscard = state.eventDiscard.filter((id) => id !== pe.card.id)
          state.eventDeck.unshift(pe.card.id)
          log(state, `🔮 ${seat.name} uses the Seer: the omen “${pe.card.name}” is averted!`, 'event')
          state.pendingEventPlacement = null
          state.lastEventCard = null
          finishTurnNow(state)
          break
        }
      }
      return
    }

    case 'placeEventTarget': {
      requireActive(state, seatId)
      const pe = state.pendingEventPlacement
      if (!pe) throw new GameError('No event placement in progress')
      // escape hatch: the omen finds no legal foothold (e.g. riot with nothing ruled)
      if (action.regionId === '__skip__') {
        if (hasValidEventTarget(state)) throw new GameError('Valid targets exist')
        log(state, `${pe.card.icon} ${pe.card.name} finds no foothold — the omen passes.`, 'event')
        state.pendingEventPlacement = null
        finishTurnNow(state)
        return
      }
      const region = REGIONS[action.regionId]
      if (!region) throw new GameError('Unknown region')
      if ((state.regions[action.regionId]?.eventTokens.length ?? 0) >= 2) {
        throw new GameError('That region is already overwhelmed (2 tokens max)')
      }
      const t = pe.card.target
      if (t.river && !region.river) throw new GameError('Must target a river region')
      if (t.harbor && !region.harbor) throw new GameError('Must target an export harbor')
      if (t.arid && !region.arid) throw new GameError('Must target an arid region')
      if (t.yieldsFood && !(region.yields.food ?? 0)) throw new GameError('Must target a food-yielding region')
      if (t.hasArmy && state.regions[action.regionId].armies.length === 0) throw new GameError('Must target a region with an army')
      if (t.riot && !state.regionControl[action.regionId]) throw new GameError('Must target a ruled region')
      // immunity: any ruling co-ruler with the matching ability blocks this target
      const rulerKingdomId = state.regionControl[action.regionId]
      let immuneRulers: string[] = []
      if (rulerKingdomId) {
        const kingdom = state.kingdoms[rulerKingdomId]
        for (const sid of kingdom.seats) {
          const rs = state.seats[sid]
          if (rs?.abilities.some((ab) => (ABILITIES[ab].immuneTo ?? []).includes(pe.card.kind))) {
            immuneRulers.push(rs.name)
          }
        }
      }
      if (immuneRulers.length > 0) {
        throw new GameError(`${immuneRulers.join(' & ')} ${immuneRulers.length > 1 ? 'are' : 'is'} immune to this omen — pick another region`)
      }
      state.regions[action.regionId].eventTokens.push({ id: `ev${state.logSeq++}`, kind: pe.card.kind })
      if (pe.card.onPlace === 'steal_trade') {
        const rulerSeat = rulerSeatOfKingdomRegion(state, action.regionId)
        if (rulerSeat) {
          rulerSeat.trade = Math.max(0, rulerSeat.trade - 1)
          log(state, `⚡ Sea Storm scatters trade at ${region.name} — the ruler loses 1 trade object.`, 'event')
        }
      }
      pe.placed += 1
      pe.targetsLeft -= 1
      log(state, `${pe.card.icon} ${pe.card.name} strikes ${region.name}.`, 'event')
      if (pe.targetsLeft <= 0) {
        state.pendingEventPlacement = null
        finishTurnNow(state)
      }
      return
    }

    case 'choosePrize': {
      const pp = state.pendingPrize
      if (!pp) throw new GameError('No prize pending')
      if (pp.seatId !== seatId) throw new GameError('Not your prize')
      if (action.optionIndex < 0 || action.optionIndex >= pp.card.options.length) throw new GameError('Invalid choice')
      const seat = seatOf(state, seatId)
      const opt = pp.card.options[action.optionIndex]
      applyPrizeEffect(state, seat, opt.effect)
      log(state, `${seat.name} claims “${pp.card.title}”: ${opt.text}`, 'gain')
      const nextCond = pp.queue.shift()
      if (nextCond) {
        const def = CONDITIONS.find((c) => c.id === nextCond)!
        state.pendingPrize = { seatId, card: drawPrizeCard(state), reason: def.title, queue: pp.queue }
      } else {
        state.pendingPrize = null
      }
      checkWin(state)
      if (state.phase !== 'gameover' && !state.pendingPrize) advanceTurn(state)
      return
    }

    case 'endTurn': {
      requireActive(state, seatId)
      if (state.pendingBattle && state.pendingBattle.awaiting.includes(seatId)) {
        throw new GameError('A battle awaits — commit battle cards before ending the turn')
      }
      if (state.phase === 'resource') {
        // allow skipping straight from resource to actions? no — must endResource
        throw new GameError('End the resource phase first')
      }
      requirePhase(state, 'action')
      const seat = activeSeatObj(state)
      enforceAffliction(state, seat, true)
      if (state.config.advanced && state.config.eventFrequency !== 'off') {
        const freq = state.config.eventFrequency
        // alternate: skip even rounds; every3: only round 1, 4, 7, …
        const skipEvent = freq === 'alternate' ? state.round % 2 === 0 : freq === 'every3' ? state.round % 3 !== 1 : false
        if (!skipEvent) {
          const card = drawEventCard(state)
          state.lastEventCard = card
          state.phase = 'event'
          state.pendingEventPlacement = {
            card,
            targetsLeft: card.target.count,
            placed: 0,
          }
          log(state, `${card.icon} Event drawn: “${card.name}” — ${card.text}`, 'event')
          return
        }
      }
      finishTurnNow(state)
      return
    }
  }
  throw new GameError('Unknown action')
}

function enforceAffliction(state: GameState, seat: Seat, ending = false) {
  if (!state.config.strictAffliction) return
  const afflicted = afflictedRegionIds(state, seat.id)
  if (afflicted.length > 0 && !ending) {
    throw new GameError(`Events plague your lands (${afflicted.map((r) => REGIONS[r].name).join(', ')}) — remove them first`)
  }
}

function enforceBattlePending(state: GameState) {
  // only blocks the seat that still owes a commitment — the other side may act freely
  if (state.pendingBattle && state.pendingBattle.awaiting.includes(state.activeSeat)) {
    throw new GameError('A battle awaits — commit battle cards before anything else')
  }
}

function eventKindToCardId(kind: string): string {
  return kind === 'flood' ? 'flood' : kind
}

function gainConquestRewards(state: GameState, seat: Seat, region: Region) {
  const parts: string[] = []
  for (const [res, n] of Object.entries(region.yields)) {
    if (n) {
      gainResource(state, seat, res as Resource, n)
      parts.push(`+${n} ${res}`)
    }
  }
  if (region.trade) {
    seat.trade += region.trade
    parts.push(`+${region.trade} trade`)
  }
  seat.vp += region.value
  parts.push(`+${region.value} VP`)
  log(state, `${seat.name} plunders ${region.name}: ${parts.join(', ')}.`, 'gain')
}

function startBattle(state: GameState, attackerSeat: string, regionId: string, defenderSeat: string) {
  if (state.pendingBattle) throw new GameError('A battle is already underway — resolve it first')
  state.pendingBattle = {
    id: `b${++state.battleSeq}`,
    regionId,
    attackerSeat,
    defenderSeat,
    commitments: {},
    awaiting: [attackerSeat, defenderSeat],
    phase: 'commit',
  }
  log(state, `⚔ Battle of ${REGIONS[regionId].name}: ${seatOf(state, attackerSeat).name} attacks ${seatOf(state, defenderSeat).name}!`, 'battle')
}

function resolveBattle(state: GameState) {
  const battle = state.pendingBattle!
  const region = REGIONS[battle.regionId]
  const atk = battle.commitments[battle.attackerSeat]
  const def = battle.commitments[battle.defenderSeat]

  const atkSeat = seatOf(state, battle.attackerSeat)
  const defSeat = seatOf(state, battle.defenderSeat)

  let atkTotal = atk.cards.reduce((t, c) => t + c.value, 0)
  let defTotal = def.cards.reduce((t, c) => t + c.value, 0)

  if (atkSeat.personality === 'war_elephants') atkTotal += 2
  if (defSeat.personality === 'war_elephants') defTotal += 2
  if (atk.commitmentBonus) atkTotal += atk.commitmentBonus
  if (def.commitmentBonus) defTotal += def.commitmentBonus

  const defenderControls = kingdomOf(state, battle.defenderSeat).forts[battle.regionId] === kingdomOf(state, battle.defenderSeat).id
  // walls help, but a small garrison behind them can't hold off a horde — terrain bonus caps at +3
  const defBonus = defenderControls ? Math.min(region.value, 3) : 0
  defTotal += defBonus

  const attackerWins = atkTotal > defTotal // tie → defender
  const winnerSeat = attackerWins ? battle.attackerSeat : battle.defenderSeat
  // cards are spent permanently — ANY army reduced to zero cards disbands (winner or loser)
  for (const seatId of [battle.attackerSeat, battle.defenderSeat]) {
    const commit = battle.commitments[seatId]
    for (const c of commit.cards) {
      const army = armiesOfSeat(state, seatId).find((a) => a.armyId === c.armyId)!
      army.cards = army.cards.filter((x) => x.id !== c.cardId)
      state.armyDiscard.push({ id: c.cardId, value: c.value })
    }
    for (const army of armiesOfSeat(state, seatId)) {
      if (army.alive && army.cards.length === 0) {
        army.alive = false
        army.regionId = null
        log(state, `☠ An army of ${seatOf(state, seatId).name} disbands — no battle cards left.`, 'battle')
      }
    }
  }

  const loserSeatId = attackerWins ? battle.defenderSeat : battle.attackerSeat
  const loserKingdom = kingdomOf(state, loserSeatId)
  const retreatTarget = state.config.retreat === 'capital' ? loserKingdom.capital : null

  // loser armies retreat or die — but a defender beaten at their own capital is destroyed
  const lostAtOwnCapital = battle.regionId === loserKingdom.capital
  for (const a of state.regions[battle.regionId].armies.filter((x) => x.seatId === loserSeatId)) {
    const army = state.armies.find((y) => y.armyId === a.armyId && y.ownerId === a.seatId)!
    if (army.cards.length === 0 || !retreatTarget || lostAtOwnCapital) {
      army.alive = false
      army.regionId = null
      log(state, `☠ An army of ${seatOf(state, loserSeatId).name} is destroyed.`, 'battle')
    } else {
      army.regionId = retreatTarget
    }
  }

  const winnerSeatObj = seatOf(state, winnerSeat)
  winnerSeatObj.winsBattles += 1
  winnerSeatObj.vp += 1
  log(state, `⭐ ${winnerSeatObj.name} gains +1 VP for the field of battle.`, 'gain')

  if (attackerWins) {
    const tookControl = transferControl(state, battle.regionId, kingdomOf(state, battle.attackerSeat).id, battle.attackerSeat)
    if (tookControl) gainConquestRewards(state, atkSeat, region)
    log(state, `⚔ ${atkSeat.name} wins the Battle of ${region.name} (${atkTotal} vs ${defTotal}${defBonus ? ` incl. +${defBonus} terrain` : ''})!`, 'battle')
  } else {
    log(state, `🛡 ${defSeat.name} holds ${region.name} (${defTotal}${defBonus ? ` incl. +${defBonus} terrain` : ''} vs ${atkTotal})!`, 'battle')
  }

  battle.phase = 'resolved'
  battle.resolved = {
    attackerTotal: atkTotal,
    defenderTotal: defTotal,
    defenderBonus: defBonus,
    winnerSeat,
    cards: [
      ...atk.cards.map((c) => ({ seatId: battle.attackerSeat, armyId: c.armyId, value: c.value })),
      ...def.cards.map((c) => ({ seatId: battle.defenderSeat, armyId: c.armyId, value: c.value })),
    ],
  }
  state.lastBattle = battle
  state.pendingBattle = null
  syncOccupation(state)
  checkWin(state)
}

function revealToken(state: GameState, seat: Seat, tokenId: string, regionId: string) {
  const token = HIDDEN_TOKEN_POOL.find((t) => t.id === tokenId) ?? { id: tokenId, kind: 'empty' as const }
  const region = REGIONS[regionId]
  switch (token.kind) {
    case 'vp1': seat.vp += 1; log(state, `🔍 ${seat.name} uncovers a relic in ${region.name}: +1 VP.`, 'gain'); break
    case 'vp2': seat.vp += 2; log(state, `🔍 ${seat.name} uncovers treasure in ${region.name}: +2 VP.`, 'gain'); break
    case 'coins': seat.coins += 3; log(state, `🔍 ${seat.name} finds a hoard in ${region.name}: +3 coins.`, 'gain'); break
    case 'trade': seat.trade += 2; log(state, `🔍 ${seat.name} finds trade goods in ${region.name}: +2 trade.`, 'gain'); break
    case 'medicine': seat.medicine += 1; log(state, `🔍 ${seat.name} finds herbs in ${region.name}: +1 Medicine.`, 'gain'); break
    case 'empty': log(state, `🔍 ${seat.name} searches ${region.name} — nothing but dust.`, 'gain'); break
    case 'ambush': {
      log(state, `🐍 Ambush in ${region.name}! An event strikes the region.`, 'event')
      const card = drawEventCard(state)
      state.regions[regionId].eventTokens.push({ id: `ev${state.logSeq++}`, kind: card.kind })
      log(state, `${card.icon} ${card.name} breaks out in ${region.name}.`, 'event')
      break
    }
  }
  checkWin(state)
}

/** recompute which armies stand where (public view bookkeeping) */
export function syncOccupation(state: GameState) {
  for (const rid of Object.keys(state.regions)) {
    state.regions[rid].armies = state.armies
      .filter((a) => a.alive && a.regionId === rid)
      .map((a) => ({ seatId: a.ownerId, armyId: a.armyId, armyRef: a.id }))
  }
}

export function isDraftComplete(state: GameState): boolean {
  return Object.values(state.seats).every((s) => s.personality !== null)
}

/** valid targets for the currently pending event card (public — also used by the server's zombie driver) */
export function eventTargetsFor(state: GameState, _seatId: string): Set<string> {
  const pe = state.pendingEventPlacement
  const out = new Set<string>()
  if (!pe) return out
  const t = pe.card.target
  for (const region of Object.values(REGIONS)) {
    if (t.river && !region.river) continue
    if (t.harbor && !region.harbor) continue
    if (t.arid && !region.arid) continue
    if (t.yieldsFood && !(region.yields.food ?? 0)) continue
    if (t.hasArmy && (state.regions[region.id]?.armies.length ?? 0) === 0) continue
    if (t.riot && !state.regionControl[region.id]) continue
    if ((state.regions[region.id]?.eventTokens.length ?? 0) >= 2) continue
    // immunity of any ruling co-ruler blocks this target
    const rulerKingdomId = state.regionControl[region.id]
    if (rulerKingdomId) {
      const kingdom = state.kingdoms[rulerKingdomId]
      const immune = kingdom.seats.some((sid) =>
        (state.seats[sid]?.abilities ?? []).some((ab) => (ABILITIES[ab].immuneTo ?? []).includes(pe.card.kind)),
      )
      if (immune) continue
    }
    out.add(region.id)
  }
  return out
}

/**
 * Per-seat view of the state: deck contents are hidden (counts preserved) and
 * other seats' secret battle commitments are blanked until the reveal.
 */
export function sanitizeState(state: GameState, seatId: string | null): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState
  // the server is the only shuffler — never leak the deterministic RNG
  delete (s as Partial<GameState>).rngState
  s.armyDeck = s.armyDeck.map(() => ({ id: '__hidden', value: 0 }))
  s.resourceDeck = s.resourceDeck.map(() => '__hidden')
  s.eventDeck = s.eventDeck.map(() => '__hidden')
  s.prizeDeck = s.prizeDeck.map(() => '__hidden')
  // hidden token kinds must not be readable (ids encode their contents)
  for (const rid of Object.keys(s.regions)) {
    s.regions[rid].hiddenToken = s.regions[rid].hiddenToken ? '__hidden' : null
  }
  if (s.pendingBattle) {
    for (const sid of Object.keys(s.pendingBattle.commitments)) {
      if (sid !== seatId) {
        s.pendingBattle.commitments[sid] = {
          seatId: sid,
          armyIds: [],
          cards: [],
        }
      }
    }
  }
  return s
}
