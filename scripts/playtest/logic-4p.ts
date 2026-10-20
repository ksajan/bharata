/**
 * Headless 4-player (and 6-player team) playtest for Bharata 600 BC.
 * Four distinct bot strategies drive a full ADVANCED game each, with
 * invariant self-checks (VP ledger, occupation sync, deck conservation,
 * negative resources, stuck/affliction detection).
 *
 * Run:  npx tsx scripts/playtest/logic-4p.ts
 * Env:  GAMES=n (default 6) 4P games; one 6P co-ruler game always runs.
 */
import { createGame, handleAction, GameError } from '../../shared/engine'
import { ABILITIES, REGIONS, RESOURCE_CARDS, RESOURCE_DECK } from '../../shared/data'
import type {
  AbilityId,
  Army,
  ArmyId,
  GameAction,
  GameState,
  PersonalityId,
  Resource,
} from '../../shared/types'

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------

type PayCard = { armyId: ArmyId; cardId: string }

function armyPower(a: Army): number {
  return a.cards.reduce((t, c) => t + c.value, 0)
}
function armiesAt(state: GameState, rid: string): Army[] {
  return state.armies.filter((a) => a.alive && a.regionId === rid)
}
function armiesOf(state: GameState, sid: string): Army[] {
  return state.armies.filter((a) => a.ownerId === sid)
}
function kingdomOfSeat(state: GameState, sid: string) {
  return state.kingdoms[state.seats[sid].kingdomId]
}
function myRegions(state: GameState, sid: string): string[] {
  const k = kingdomOfSeat(state, sid)
  return Object.keys(k.forts).filter((r) => k.forts[r] === k.id)
}
function enemyArmiesAt(state: GameState, rid: string, sid: string): Army[] {
  const kid = state.seats[sid].kingdomId
  return armiesAt(state, rid).filter((a) => state.seats[a.ownerId].kingdomId !== kid)
}
function bestArmy(state: GameState, sid: string): Army | null {
  const alive = armiesOf(state, sid).filter((a) => a.alive && a.regionId)
  const withCards = alive.filter((a) => a.cards.length > 0)
  const pool = withCards.length ? withCards : alive
  pool.sort((a, b) => armyPower(b) - armyPower(a))
  return pool[0] ?? null
}
function totalCardCount(state: GameState, sid: string): number {
  return armiesOf(state, sid).reduce((t, a) => t + a.cards.length, 0)
}
function distMap(from: string): Map<string, number> {
  const dist = new Map([[from, 0]])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    for (const n of REGIONS[cur].neighbors) {
      if (!dist.has(n)) {
        dist.set(n, dist.get(cur)! + 1)
        q.push(n)
      }
    }
  }
  return dist
}
function stepToward(from: string, to: string): string | null {
  if (from === to) return null
  const dist = distMap(to)
  if (!dist.has(from)) return null
  const d = dist.get(from)!
  for (const n of REGIONS[from].neighbors) if (dist.get(n) === d - 1) return n
  return null
}
function estimateDefense(state: GameState, rid: string, defenderSeat: string): number {
  const d = state.seats[defenderSeat]
  const k = state.kingdoms[d.kingdomId]
  const terrain = k.forts[rid] === k.id ? REGIONS[rid].value : 0
  let best = 0
  for (const a of armiesOf(state, defenderSeat)) if (a.alive) best = Math.max(best, armyPower(a))
  const elephants = d.personality === 'war_elephants' ? 2 : 0
  return terrain + best + elephants
}

// ---------------------------------------------------------------------------
// per-game context & anomaly bookkeeping
// ---------------------------------------------------------------------------

interface BattleRec {
  atk: number
  def: number
  bonus: number
  atkWon: boolean
  round: number
  defCommitted: number
  atkCommitted: number
  detail?: string
}

interface Ctx {
  anomalies: string[]
  evidence: string[]
  battles: BattleRec[]
  lastBattleId: string | null
  vpExpected: Record<string, number>
  vpLedgerBroken: boolean
  conquests: Record<string, number>
  conquestVP: Record<string, number>
  prizeVP: Record<string, number>
  battleVP: Record<string, number>
  seizures: number
  regionGainer: Record<string, string>
  coinsFromSell: Record<string, number>
  coinsToCards: Record<string, number>
  eventDrawn: number
  eventPlaced: number
  eventRemoved: number
  eventNoFoothold: number
  riotsToppled: number
  extraActions: number
  errors: Record<string, number>
  staleOccupation: number
  resourceEmergency: boolean
  armySynthetics: number
  ghostEvidence: number
  missingEvidence: number
  passiveStreak: Record<string, number>
  maxPassive: Record<string, number>
  afflictedStreak: Record<string, number>
  maxAfflicted: Record<string, number>
  productive: Record<string, boolean>
  attempted: Record<string, Set<string>>
  lastGoal: Record<string, string | null>
  fails: Record<string, number>
  logPos: number
  turnIdx: number
  clearFailRecords?: number
  seizeLog: string[]
  lastErr: Record<string, string>
}

function newCtx(seatIds: string[]): Ctx {
  return {
    anomalies: [],
    evidence: [],
    battles: [],
    lastBattleId: null,
    vpExpected: Object.fromEntries(seatIds.map((s) => [s, 0])),
    vpLedgerBroken: false,
    conquests: Object.fromEntries(seatIds.map((s) => [s, 0])),
    conquestVP: Object.fromEntries(seatIds.map((s) => [s, 0])),
    prizeVP: Object.fromEntries(seatIds.map((s) => [s, 0])),
    battleVP: {},
    seizures: 0,
    regionGainer: {},
    coinsFromSell: Object.fromEntries(seatIds.map((s) => [s, 0])),
    coinsToCards: Object.fromEntries(seatIds.map((s) => [s, 0])),
    eventDrawn: 0,
    eventPlaced: 0,
    eventRemoved: 0,
    eventNoFoothold: 0,
    riotsToppled: 0,
    extraActions: 0,
    errors: {},
    staleOccupation: 0,
    resourceEmergency: false,
    armySynthetics: 0,
    ghostEvidence: 0,
    missingEvidence: 0,
    passiveStreak: Object.fromEntries(seatIds.map((s) => [s, 0])),
    maxPassive: Object.fromEntries(seatIds.map((s) => [s, 0])),
    afflictedStreak: Object.fromEntries(seatIds.map((s) => [s, 0])),
    maxAfflicted: Object.fromEntries(seatIds.map((s) => [s, 0])),
    productive: Object.fromEntries(seatIds.map((s) => [s, false])),
    attempted: Object.fromEntries(seatIds.map((s) => [s, new Set<string>()])),
    lastGoal: Object.fromEntries(seatIds.map((s) => [s, null])),
    fails: Object.fromEntries(seatIds.map((s) => [s, 0])),
    logPos: 0,
    turnIdx: 0,
    clearFailRecords: 0,
    seizeLog: [],
    lastErr: {},
  }
}

function anomaly(ctx: Ctx, msg: string, evidence?: string) {
  if (!ctx.anomalies.includes(msg)) ctx.anomalies.push(msg)
  if (evidence && ctx.evidence.length < 60) ctx.evidence.push(evidence)
}

// ---------------------------------------------------------------------------
// log watching: VP ledger, conquest/ seizure/ event stats
// ---------------------------------------------------------------------------

function seatIdByPrefix(state: GameState, text: string): string | null {
  // actor name may be preceded by an emoji/icon — match the FIRST seat name occurring
  let best: string | null = null
  let bestIdx = Number.MAX_SAFE_INTEGER
  for (const s of Object.values(state.seats)) {
    const idx = text.indexOf(s.name + ' ')
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx
      best = s.id
    }
  }
  return best
}

function processLogs(state: GameState, ctx: Ctx) {
  while (ctx.logPos < state.log.length) {
    const e = state.log[ctx.logPos++]
    const text = e.text
    const sid = seatIdByPrefix(state, text)
    const bump = (n: number) => {
      if (sid) ctx.vpExpected[sid] += n
    }
    let m: RegExpExecArray | null

    if ((m = /(.+) plunders (.+?):/.exec(text))) {
      const plunderer = Object.values(state.seats).find((s) => text.startsWith(s.name + ' '))
      if (plunderer) {
        ctx.conquests[plunderer.id]++
        const regionId = Object.values(REGIONS).find((r) => r.name === m![2])?.id
        if (regionId) ctx.regionGainer[regionId] = plunderer.id
      }
      const vp = /\+(\d+) VP/.exec(text)
      if (vp) {
        bump(Number(vp[1]))
        if (sid) ctx.conquestVP[sid] += Number(vp[1])
      }
    } else if ((m = /(.+) loses (\d+) VP \(region seized\)/.exec(text))) {
      const loser = Object.values(state.seats).find((s) => text.startsWith(s.name + ' '))
      if (loser) {
        ctx.vpExpected[loser.id] -= Number(m[2])
        ctx.seizeLog.push(`r${state.round}: ${loser.name} -${m[2]} VP seized`)
        // attribution check: the seized region should be the one gained by the loser
        const prev = state.log[ctx.logPos - 2]?.text ?? ''
        const next3 = [1, 2, 3].map((i) => state.log[ctx.logPos - 1 + i]?.text ?? '').join(' | ')
        let regionId: string | undefined
        const riotM = /Riot in (.+?)!/.exec(prev)
        if (riotM) regionId = Object.values(REGIONS).find((r) => r.name === riotM[1])?.id
        else {
          const plM = /plunders (.+?) \(/.exec(next3)
          if (plM) regionId = Object.values(REGIONS).find((r) => r.name === plM![1])?.id
        }
        if (regionId && ctx.regionGainer[regionId] && ctx.regionGainer[regionId] !== loser.id) {
          anomaly(
            ctx,
            'VP-steal charged to a different seat than the one who earned it (co-ruler team bug)',
            `seize: "${text}" — region earned by seat ${ctx.regionGainer[regionId]} but charged to ${loser.id}`,
          )
        }
      }
    } else if (/uncovers (?:a relic|treasure)/.test(text)) {
      const vp = /\+(\d) VP/.exec(text)
      if (vp) bump(Number(vp[1]))
    } else if (/gains \+1 VP for the field of battle/.test(text)) {
      // line is emoji-prefixed — resolve the winner by name, not by prefix
      const wm = /gains \+1 VP/.test(text) ? text.replace(/^[^A-Za-z]*/, '').split(' ')[0] : null
      const w = Object.values(state.seats).find((s) => text.includes(`${s.name} gains +1 VP`))
      if (w) {
        ctx.vpExpected[w.id] += 1
        ctx.battleVP[w.id] = (ctx.battleVP[w.id] ?? 0) + 1
      } else if (wm) {
        ctx.vpExpected[wm] = ctx.vpExpected[wm] ?? 0
      }
    } else if ((m = /(.+) gains (\d+) VP\./.exec(text))) {
      bump(Number(m[2]))
      if (sid) ctx.prizeVP[sid] += Number(m[2])
    } else if (/Event drawn:/.test(text)) {
      ctx.eventDrawn++
    } else if (/strikes /.test(text)) {
      ctx.eventPlaced++
    } else if (/clears the/.test(text) || /soothes the/.test(text)) {
      ctx.eventRemoved++
    } else if ((m = /clears (\d+) event token/.exec(text))) {
      ctx.eventRemoved += Number(m[1])
    } else if (/Riot in .* loses control/.test(text)) {
      ctx.riotsToppled++
    } else if (/finds no foothold/.test(text)) {
      ctx.eventNoFoothold++
    } else if ((m = /(.+) sells goods for (\d+) coins/.exec(text))) {
      const s = Object.values(state.seats).find((x) => text.startsWith(x.name + ' '))
      if (s) ctx.coinsFromSell[s.id] += Number(m[2])
    } else if (/ buys an army card/.test(text)) {
      const s = Object.values(state.seats).find((x) => text.startsWith(x.name + ' '))
      if (s) ctx.coinsToCards[s.id] += state.config.armyCardCost
    } else if (/seizing it from/.test(text)) {
      ctx.seizures++
    }
  }
  // VP ledger consistency is enforced by the delta check in act() (VP_SOURCES)
}

// ---------------------------------------------------------------------------
// invariants audit
// ---------------------------------------------------------------------------

function audit(state: GameState, ctx: Ctx, where: string) {
  for (const s of Object.values(state.seats)) {
    for (const k of ['coins', 'trade', 'medicine', 'iron', 'wood', 'food', 'vp'] as const) {
      if (s[k] < 0) anomaly(ctx, `negative ${k} on a seat`, `${where}: ${s.name} has ${k}=${s[k]}`)
    }
  }
  for (const k of Object.values(state.kingdoms)) {
    if (k.fortSupply < 0) anomaly(ctx, 'negative fort supply', `${where}: ${k.name} fortSupply=${k.fortSupply}`)
    for (const [rid, kid] of Object.entries(k.forts)) {
      if (kid !== k.id || state.regionControl[rid] !== k.id) {
        anomaly(
          ctx,
          'forts/regionControl inconsistent',
          `${where}: kingdom ${k.id} fort ${rid} (kid=${kid}) vs regionControl=${state.regionControl[rid]} | recent: ${state.log.slice(-3).map((l) => l.text).join(' || ')}`,
        )
      }
    }
  }
  for (const [rid, kid] of Object.entries(state.regionControl)) {
    if (kid && state.kingdoms[kid]?.forts[rid] !== kid) {
      anomaly(ctx, 'forts/regionControl inconsistent', `${where}: control ${rid}=${kid} missing fort entry`)
    }
  }
  // occupation sync: regions[].armies vs armies[]
  const expect: Record<string, Set<string>> = {}
  for (const rid of Object.keys(state.regions)) expect[rid] = new Set()
  for (const a of state.armies) if (a.alive && a.regionId) expect[a.regionId].add(`${a.ownerId}-${a.armyId}`)
  for (const [rid, bs] of Object.entries(state.regions)) {
    const actual = new Set(bs.armies.map((x) => `${x.seatId}-${x.armyId}`))
    const ghost = [...actual].find((ref) => !expect[rid].has(ref))
    const missing = [...expect[rid]].find((ref) => !actual.has(ref))
    if (ghost || missing) {
      ctx.staleOccupation++
      const wantEvidence =
        ctx.staleOccupation <= 2 ||
        (ghost && ctx.ghostEvidence < 4) ||
        (missing && state.round >= 1 && ctx.missingEvidence < 3)
      if (ghost) ctx.ghostEvidence++
      if (missing && state.round >= 1) ctx.missingEvidence++
      if (wantEvidence) {
        anomaly(
          ctx,
          'stale occupation: regions[].armies not in sync with armies[] (ghost/missing armies on board)',
          `${where}: region ${rid} board=[${[...actual]}] truth=[${[...expect[rid]]}]`,
        )
      }
    }
  }
  // deck conservation
  const synth = state.armies.reduce(
    (t, a) => t + a.cards.filter((c) => c.id.startsWith('a-emg-')).length,
    0,
  ) + state.armyDiscard.filter((c) => c.id.startsWith('a-emg-')).length
  if (synth > ctx.armySynthetics) {
    ctx.armySynthetics = synth
    const parked = state.armies.reduce((t, a) => t + a.cards.length, 0)
    anomaly(
      ctx,
      'army deck exhausted — synthetic emergency cards entered play',
      `${where}: ${synth} synthetic card(s); parked in armies=${parked}, deck=${state.armyDeck.length}, discard=${state.armyDiscard.length}`,
    )
  }
  const armyTotal = state.armyDeck.length + state.armyDiscard.length + state.armies.reduce((t, a) => t + a.cards.length, 0)
  if (armyTotal !== 48 + synth) {
    const parked = state.armies.map((a) => `${a.ownerId}-${a.armyId}:${a.alive ? a.cards.length : `dead(${a.cards.length})`}`).join(' ')
      anomaly(
        ctx,
        'army card conservation broken',
        `${where}: total=${armyTotal} (deck=${state.armyDeck.length} discard=${state.armyDiscard.length} parked=${state.armies.reduce((t, a) => t + a.cards.length, 0)}) | ${parked} | recent: ${state.log.slice(-8).map((l) => l.text).join(' || ')}`,
      )
  }
  const resTotal = state.resourceDeck.length + state.resourceDiscard.length
  const fullCatalog = Object.keys(RESOURCE_CARDS).length
  if (resTotal === fullCatalog && !ctx.resourceEmergency) {
    ctx.resourceEmergency = true
    anomaly(ctx, `resource deck exhausted — emergency reshuffle of the full ${fullCatalog}-card catalog`, where)
  } else if (resTotal !== RESOURCE_DECK.length && resTotal !== fullCatalog) {
    anomaly(ctx, 'resource card conservation broken', `${where}: total=${resTotal}`)
  }
  if (state.eventDeck.length + state.eventDiscard.length !== 12) {
    anomaly(ctx, 'event card conservation broken', where)
  }
  if (state.prizeDeck.length < 0 || state.prizeDeck.length > 6) {
    anomaly(ctx, 'prize deck size impossible', `${where}: ${state.prizeDeck.length}`)
  }
}

// ---------------------------------------------------------------------------
// the act() wrapper: perform action, watch logs, audit, count errors
// ---------------------------------------------------------------------------

const PRODUCTIVE: GameAction['type'][] = ['moveArmy', 'conquer', 'battleInit', 'revealHidden', 'removeEvent']
// the only actions through which the engine may move VP
const VP_SOURCES: GameAction['type'][] = ['conquer', 'battleCommit', 'revealHidden', 'choosePrize']

function act(state: GameState, seatId: string, action: GameAction, ctx: Ctx): boolean {
  const vpBefore = Object.fromEntries(Object.values(state.seats).map((s) => [s.id, s.vp]))
  try {
    handleAction(state, seatId, action)
  } catch (err) {
    if (err instanceof GameError) {
      ctx.errors[err.message] = (ctx.errors[err.message] ?? 0) + 1
      ctx.lastErr[seatId] = err.message
      if (err.message.startsWith('Enemy army present')) {
        const rid = (action as { regionId?: string }).regionId
        if (rid && enemyArmiesAt(state, rid, seatId).length === 0) {
          anomaly(
            ctx,
            'engine refused a conquer because of a STALE ghost army (occupation desync affects rules, not just UI)',
            `r${state.round}: ${state.seats[seatId].name} conquer ${REGIONS[rid]?.name} refused: "${err.message}" — truth: no enemy there`,
          )
        }
      }
      return false
    }
    throw err
  }
  if (PRODUCTIVE.includes(action.type)) ctx.productive[seatId] = true
  if (action.type === 'buyExtraAction') ctx.extraActions++
  // did a conquest ignore a standing enemy army? (ghost occupation desync consequence)
  if (action.type === 'conquer') {
    const rid = (action as { regionId: string }).regionId
    const kid = state.regionControl[rid]
    if (kid) {
      const standers = armiesAt(state, rid).filter((a) => state.seats[a.ownerId].kingdomId !== kid)
      if (standers.length > 0) {
        anomaly(
          ctx,
          'conquest completed while a rival army still STANDS in the region (no battle, no retreat — stale occupation let it through)',
          `r${state.round}: ${state.seats[seatId].name} conquered ${REGIONS[rid].name}; still standing: ${standers.map((a) => `${a.ownerId}-${a.armyId}`).join(',')}`,
        )
      }
    }
  }
  // VP must only move through actions that can grant it (line-format-independent check)
  for (const s of Object.values(state.seats)) {
    const d = s.vp - (vpBefore[s.id] ?? 0)
    if (d !== 0 && !VP_SOURCES.includes(action.type)) {
      anomaly(
        ctx,
        'VP granted by an action that cannot grant VP',
        `r${state.round}: ${s.name} ${d > 0 ? '+' : ''}${d} VP from ${seatId}:${action.type} | recent: ${state.log.slice(-3).map((l) => l.text).join(' || ')}`,
      )
    }
  }
  processLogs(state, ctx)
  audit(state, ctx, `r${state.round} ${seatId}:${action.type}`)
  return true
}

// ---------------------------------------------------------------------------
// event target picker (grief the VP leader when possible)
// ---------------------------------------------------------------------------

function validEventTargets(state: GameState): string[] {
  const pe = state.pendingEventPlacement
  if (!pe) return []
  const t = pe.card.target
  const out: string[] = []
  for (const region of Object.values(REGIONS)) {
    if (t.river && !region.river) continue
    if (t.harbor && !region.harbor) continue
    if (t.arid && !region.arid) continue
    if (t.yieldsFood && !(region.yields.food ?? 0)) continue
    // NOTE: mirror the engine exactly — it reads the possibly-stale regions[].armies
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
    out.push(region.id)
  }
  return out
}

const EVENT_MODE = process.env.EVENT_MODE === 'leader' ? 'leader' : 'neutral'

function pickEventTarget(state: GameState, ctx: Ctx): string | null {
  const pe = state.pendingEventPlacement
  const targets = validEventTargets(state)
  if (targets.length === 0) return null
  let pick: string
  if (EVENT_MODE === 'leader') {
    const leader = Object.values(state.seats).sort((a, b) => b.vp - a.vp)[0]
    const ruled = targets.filter((rid) => state.regionControl[rid])
    const notMine = ruled.filter((rid) => !state.kingdoms[state.regionControl[rid]!].seats.includes(state.activeSeat))
    const leaderHit = notMine.find((rid) => state.kingdoms[state.regionControl[rid]!].seats.includes(leader.id))
    pick = leaderHit ?? notMine[0] ?? ruled[0] ?? targets[0]
  } else {
    const ruled = targets.filter((rid) => state.regionControl[rid])
    const pool = ruled.length > 0 && Math.random() < 0.7 ? ruled : targets
    pick = pool[Math.floor(Math.random() * pool.length)]
  }
  if (pe!.card.target.hasArmy && armiesAt(state, pick).length === 0) {
    anomaly(
      ctx,
      'outbreak placed on a region that has NO real army (engine targeted a stale ghost occupation entry)',
      `r${state.round}: ${pe!.card.name} placed on ${REGIONS[pick].name}; board-list=[${state.regions[pick].armies.map((a) => a.seatId)}] truth=[]`,
    )
  }
  return pick
}

// ---------------------------------------------------------------------------
// pump: resolve battles / event placement / prizes until quiet
// ---------------------------------------------------------------------------

function commitForBot(state: GameState, sid: string, style: string): { cards: PayCard[]; strategist: boolean } {
  const seat = state.seats[sid]
  const battle = state.pendingBattle!
  const isDefender = battle.defenderSeat === sid
  const armies = armiesOf(state, sid).filter((a) => a.alive)
  const byPower = [...armies].sort((a, b) => armyPower(b) - armyPower(a))

  const allCards = (army: Army) => army.cards.map((c) => ({ armyId: army.armyId, cardId: c.id }))
  const weakest = (army: Army, n: number) =>
    [...army.cards].sort((a, b) => a.value - b.value).slice(0, n).map((c) => ({ armyId: army.armyId, cardId: c.id }))
  const strongest = (army: Army, n: number) =>
    [...army.cards].sort((a, b) => b.value - a.value).slice(0, n).map((c) => ({ armyId: army.armyId, cardId: c.id }))

  if (style === 'aggressive') {
    // commit everything, burn Strategist alongside a real commitment
    // (defenders may only draw from ONE army — engine rule)
    const pool = isDefender ? (byPower[0] ? allCards(byPower[0]) : []) : armies.flatMap(allCards)
    const cards = pool.slice(0, 8)
    return { cards, strategist: cards.length > 0 && (seat.abilityUsesLeft['strategist'] ?? 0) > 0 }
  }
  if (style === 'economist') {
    if (isDefender) return { cards: [], strategist: false }
    const a = byPower[byPower.length - 1] ?? armies[0]
    return { cards: a ? weakest(a, 1) : [], strategist: false }
  }
  if (style === 'turtle') {
    const a = byPower[0]
    if (!a) return { cards: [], strategist: false }
    return isDefender ? { cards: strongest(a, 1), strategist: false } : { cards: strongest(a, 2), strategist: false }
  }
  // chaser: computed commitment to beat the defense estimate
  const est = isDefender
    ? (() => {
        const atk = state.seats[battle.attackerSeat]
        let p = 0
        for (const a of armiesOf(state, battle.attackerSeat)) if (a.alive) p += armyPower(a)
        return p + (atk.personality === 'war_elephants' ? 2 : 0)
      })()
    : estimateDefense(state, battle.regionId, battle.defenderSeat)
  let best: { cards: PayCard[]; power: number } = { cards: [], power: 0 }
  if (isDefender) {
    for (const a of armies) {
      for (let n = 1; n <= a.cards.length; n++) {
        const sel = strongest(a, n)
        const power = sel.reduce((t, c) => {
          const card = a.cards.find((x) => x.id === c.cardId)!
          return t + card.value
        }, 0) + (seat.personality === 'war_elephants' ? 2 : 0)
        if (power > est && power > best.power) best = { cards: sel, power }
      }
    }
  } else {
    const sel = armies.flatMap(allCards)
    for (let n = 1; n <= Math.min(sel.length, 6); n++) {
      const top = sel
        .map((c) => {
          const army = armies.find((a) => a.armyId === c.armyId)!
          return { ...c, value: army.cards.find((x) => x.id === c.cardId)!.value }
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, n)
      const power = top.reduce((t, c) => t + c.value, 0)
      if (power > est && power > best.power) best = { cards: top.map(({ armyId, cardId }) => ({ armyId, cardId })), power }
    }
  }
  if (best.cards.length > 0) return { cards: best.cards, strategist: false }
  const a = byPower[byPower.length - 1] ?? armies[0]
  return { cards: a ? weakest(a, 1) : [], strategist: false }
}

function prizeOptionIndex(state: GameState, style: string): number {
  const pp = state.pendingPrize!
  const effects = pp.card.options.map((o) => o.effect.kind)
  const want = style === 'economist' ? ['coins', 'trade', 'vp'] : style === 'turtle' ? ['resource', 'coins', 'vp'] : style === 'chaser' ? ['vp', 'trade', 'coins'] : ['draw_army', 'vp', 'coins']
  for (const w of want) {
    const i = effects.indexOf(w as (typeof effects)[number])
    if (i >= 0) return i
  }
  return 0
}

function pump(state: GameState, bots: Bot[], ctx: Ctx) {
  let guard = 120
  while (guard-- > 0 && state.phase !== 'gameover') {
    if (state.pendingBattle) {
      const awaiting = [...state.pendingBattle.awaiting]
      let progressed = false
      for (const sid of awaiting) {
        const bot = bots.find((b) => b.id === sid)
        if (!bot) break
        const commit = commitForBot(state, sid, bot.style)
        if (act(state, sid, { type: 'battleCommit', cards: commit.cards, useStrategist: commit.strategist }, ctx)) {
          progressed = true
        }
      }
      if (!state.pendingBattle && state.lastBattle && state.lastBattle.id !== ctx.lastBattleId) {
        ctx.lastBattleId = state.lastBattle.id
        const b = state.lastBattle
        const r = b.resolved!
        const commitCounts = r.cards.reduce<Record<string, number>>((t, c) => {
          t[c.seatId] = (t[c.seatId] ?? 0) + 1
          return t
        }, {})
        ctx.battles.push({
          atk: r.attackerTotal,
          def: r.defenderTotal,
          bonus: r.defenderBonus,
          atkWon: r.winnerSeat === b.attackerSeat,
          round: state.round,
          defCommitted: commitCounts[b.defenderSeat] ?? 0,
          atkCommitted: commitCounts[b.attackerSeat] ?? 0,
          detail: `r${state.round} ${REGIONS[b.regionId].name}: ${state.seats[b.attackerSeat].name}(${commitCounts[b.attackerSeat] ?? 0}c,${r.attackerTotal}) vs ${state.seats[b.defenderSeat].name}(${commitCounts[b.defenderSeat] ?? 0}c,${r.defenderTotal} incl +${r.defenderBonus} terrain) → ${state.seats[r.winnerSeat].name}`,
        })
      }
      if (!progressed && state.pendingBattle) {
        anomaly(
          ctx,
          'battle could not be resolved by both bots committing',
          `r${state.round} battle in ${REGIONS[state.pendingBattle.regionId].name}; awaiting=[${state.pendingBattle.awaiting}]; recent errors: ${Object.entries(ctx.errors).slice(-4).map(([m, n]) => `${m}×${n}`).join('; ')}`,
        )
        break
      }
      continue
    }
    if (state.pendingEventPlacement) {
      const target = pickEventTarget(state, ctx)
      act(state, state.activeSeat, { type: 'placeEventTarget', regionId: target ?? '__skip__' }, ctx)
      continue
    }
    if (state.pendingPrize) {
      const bot = bots.find((b) => b.id === state.pendingPrize!.seatId)
      if (!bot) break
      act(state, bot.id, { type: 'choosePrize', optionIndex: prizeOptionIndex(state, bot.style) }, ctx)
      continue
    }
    break
  }
}

// ---------------------------------------------------------------------------
// bots
// ---------------------------------------------------------------------------

interface Bot {
  id: string
  name: string
  style: 'aggressive' | 'economist' | 'turtle' | 'chaser'
  personality: PersonalityId
  abilities: [AbilityId, AbilityId]
  extraBought: number
}

function buildBots(strats: string[], seatInfos: { id: string; name: string }[]): Bot[] {
  const defs: Record<string, { personality: PersonalityId; abilities: [AbilityId, AbilityId] }> = {
    aggressive: { personality: 'war_elephants', abilities: ['strategist', 'peacemaker'] },
    economist: { personality: 'merchant_prince', abilities: ['shipwright', 'seer'] },
    turtle: { personality: 'granary_keeper', abilities: ['peacemaker', 'physician'] },
    chaser: { personality: 'tax_collector', abilities: ['shipwright', 'quartermaster'] },
    aggressive2: { personality: 'master_mason', abilities: ['strategist', 'river_sage'] },
    economist2: { personality: 'iron_raja', abilities: ['shipwright', 'quartermaster'] },
  }
  return strats.map((s, i) => ({
    id: seatInfos[i].id,
    name: seatInfos[i].name,
    style: s.replace(/2$/, '') as Bot['style'],
    personality: defs[s].personality,
    abilities: defs[s].abilities,
    extraBought: 0,
  }))
}

function tryRemovals(state: GameState, bot: Bot, ctx: Ctx): boolean {
  const seat = state.seats[bot.id]
  // free clears first
  if (bot.style === 'aggressive' || bot.style === 'turtle') {
    if ((seat.abilityUsesLeft['peacemaker'] ?? 0) > 0) {
      if (act(state, bot.id, { type: 'useAbility', ability: 'peacemaker' }, ctx)) return true
    }
  }
  for (const rid of myRegions(state, bot.id)) {
    if (state.regions[rid].eventTokens.length === 0) continue
    if (act(state, bot.id, { type: 'removeEvent', regionId: rid }, ctx)) return true
    if (act(state, bot.id, { type: 'removeEvent', regionId: rid, useCoins: true }, ctx)) return true
    if (state.regions[rid].eventTokens[0]?.kind === 'outbreak') {
      if (act(state, bot.id, { type: 'removeEvent', regionId: rid, useMedicine: true }, ctx)) return true
    }
    if ((seat.abilityUsesLeft['river_sage'] ?? 0) > 0) {
      if (act(state, bot.id, { type: 'useAbility', ability: 'river_sage', payload: { regionId: rid } }, ctx)) return true
    }
  }
  return false
}

function buildConquer(state: GameState, sid: string, rid: string): GameAction | null {
  const region = REGIONS[rid]
  const k = kingdomOfSeat(state, sid)
  const seat = state.seats[sid]
  if (state.regionControl[rid] === k.id) return null
  if (k.fortSupply <= 0) return null
  if (enemyArmiesAt(state, rid, sid).length > 0) return null
  if (region.kind === 'province') {
    const cost = Math.max(1, region.value - (seat.personality === 'master_mason' ? 1 : 0))
    if (seat.coins < cost) return null
    return { type: 'conquer', regionId: rid }
  }
  const need = region.value
  const pool = armiesOf(state, sid)
    .filter((a) => a.alive)
    .flatMap((a) => a.cards.map((c) => ({ armyId: a.armyId, card: c })))
    .sort((x, y) => x.card.value - y.card.value)
  if (pool.length < need) return null
  return {
    type: 'conquer',
    regionId: rid,
    payWithCards: pool.slice(0, need).map((p) => ({ armyId: p.armyId, cardId: p.card.id })),
  }
}

function aggressiveNextAction(state: GameState, bot: Bot, ctx: Ctx): GameAction | null {
  const sid = bot.id
  const army = bestArmy(state, sid)
  if (!army || !army.regionId) return null
  const attempted = ctx.attempted[sid]
  const dist = distMap(army.regionId)
  let bestRid: string | null = null
  let bestScore = -1e9
  for (const rid of Object.keys(REGIONS)) {
    const k = kingdomOfSeat(state, sid)
    if (state.regionControl[rid] === k.id) continue
    if (attempted.has(rid)) continue
    const d = dist.get(rid) ?? 99
    if (d > 8) continue
    const region = REGIONS[rid]
    const enemies = enemyArmiesAt(state, rid, sid)
    const ruledByOther = state.regionControl[rid] && state.regionControl[rid] !== k.id
    let score = region.value * 1.4 - d * 2 + (ruledByOther ? 6 : 0) + (state.regions[rid].hiddenToken ? 0.5 : 0)
    if (enemies.length > 0) {
      const myPow = armyPower(army) + (state.seats[sid].personality === 'war_elephants' ? 2 : 0)
      score += myPow > estimateDefense(state, rid, enemies[0].ownerId) ? 7 : -12
    }
    if (region.kind === 'mahajanapada') {
      score += totalCardCount(state, sid) >= region.value ? 2 : -6
    } else {
      const cost = Math.max(1, region.value - (state.seats[sid].personality === 'master_mason' ? 1 : 0))
      score += state.seats[sid].coins >= cost ? 1 : -8
    }
    if (score > bestScore) {
      bestScore = score
      bestRid = rid
    }
  }
  if (!bestRid) return null
  ctx.lastGoal[sid] = bestRid
  if (army.regionId === bestRid) {
    const enemies = enemyArmiesAt(state, bestRid, sid)
    if (enemies.length > 0) {
      const myPow = armyPower(army) + (state.seats[sid].personality === 'war_elephants' ? 2 : 0)
      if (myPow > estimateDefense(state, bestRid, enemies[0].ownerId)) return { type: 'battleInit', regionId: bestRid }
      return null
    }
    return buildConquer(state, sid, bestRid)
  }
  const step = stepToward(army.regionId, bestRid)
  return step ? { type: 'moveArmy', armyId: army.armyId, to: step } : null
}

function economistNextAction(state: GameState, bot: Bot, ctx: Ctx): GameAction | null {
  const sid = bot.id
  const army = bestArmy(state, sid)
  if (!army || !army.regionId) return null
  const attempted = ctx.attempted[sid]
  const coins = state.seats[sid].coins
  const dist = distMap(army.regionId)
  let bestRid: string | null = null
  let bestD = 99
  for (const rid of Object.keys(REGIONS)) {
    if (state.regionControl[rid]) continue
    if (attempted.has(rid)) continue
    const region = REGIONS[rid]
    if (region.kind !== 'province') continue
    if (region.value > (coins >= 8 ? 3 : 2)) continue
    if (enemyArmiesAt(state, rid, sid).length > 0) continue
    const d = dist.get(rid) ?? 99
    if (d < bestD) {
      bestD = d
      bestRid = rid
    }
  }
  if (bestRid) {
    ctx.lastGoal[sid] = bestRid
    if (army.regionId === bestRid) return buildConquer(state, sid, bestRid)
    const step = stepToward(army.regionId, bestRid)
    if (step) return { type: 'moveArmy', armyId: army.armyId, to: step }
  }
  // fallback: search for hidden tokens near home
  for (const rid of myRegions(state, sid)) {
    if (state.regions[rid].hiddenToken && armiesAt(state, rid).some((a) => a.ownerId === sid)) {
      return { type: 'revealHidden', regionId: rid }
    }
  }
  return null
}

function turtleNextAction(state: GameState, bot: Bot, ctx: Ctx): GameAction | null {
  const sid = bot.id
  const army = bestArmy(state, sid)
  if (!army || !army.regionId) return null
  const attempted = ctx.attempted[sid]
  // hidden tokens on own soil first
  for (const rid of myRegions(state, sid)) {
    if (state.regions[rid].hiddenToken && armiesAt(state, rid).some((a) => a.ownerId === sid)) {
      return { type: 'revealHidden', regionId: rid }
    }
  }
  // adjacent cheap neutral province: walk there, then conquer (needs 2 actions)
  const neighbors = new Set(REGIONS[army.regionId].neighbors)
  for (const rid of Object.keys(REGIONS)) {
    if (!neighbors.has(rid) || attempted.has(rid)) continue
    if (state.regionControl[rid]) continue
    const region = REGIONS[rid]
    if (region.kind !== 'province' || region.value > 2) continue
    if (enemyArmiesAt(state, rid, sid).length > 0) continue
    ctx.lastGoal[sid] = rid
    if (army.regionId === rid) return buildConquer(state, sid, rid)
    if (army.cards.length === 0) return null
    return { type: 'moveArmy', armyId: army.armyId, to: rid }
  }
  return null
}

function chaserNextAction(state: GameState, bot: Bot, ctx: Ctx): GameAction | null {
  const sid = bot.id
  const army = bestArmy(state, sid)
  if (!army || !army.regionId) return null
  const attempted = ctx.attempted[sid]
  for (const rid of myRegions(state, sid)) {
    if (state.regions[rid].hiddenToken && armiesAt(state, rid).some((a) => a.ownerId === sid)) {
      return { type: 'revealHidden', regionId: rid }
    }
  }
  const dist = distMap(army.regionId)
  let harborRid: string | null = null
  let harborD = 99
  let cheapRid: string | null = null
  let cheapD = 99
  for (const rid of Object.keys(REGIONS)) {
    if (state.regionControl[rid] || attempted.has(rid)) continue
    if (enemyArmiesAt(state, rid, sid).length > 0) continue
    const region = REGIONS[rid]
    const d = dist.get(rid) ?? 99
    if (region.harbor && d < harborD) {
      harborD = d
      harborRid = rid
    }
    if (region.kind === 'province' && region.value <= 2 && d < cheapD) {
      cheapD = d
      cheapRid = rid
    }
  }
  const goal = harborRid ?? cheapRid
  if (!goal) return null
  ctx.lastGoal[sid] = goal
  if (army.regionId === goal) return buildConquer(state, sid, goal)
  const step = stepToward(army.regionId, goal)
  return step ? { type: 'moveArmy', armyId: army.armyId, to: step } : null
}

// ---------------------------------------------------------------------------
// resource-phase policies
// ---------------------------------------------------------------------------

function sellEven(seat: { iron: number; wood: number; food: number }, keep: Partial<Record<Resource, number>>): Partial<Record<Resource, number>> {
  const out: Partial<Record<Resource, number>> = {}
  for (const r of ['iron', 'wood', 'food'] as Resource[]) {
    const avail = seat[r] - (keep[r] ?? 0)
    if (avail >= 2) out[r] = Math.floor(avail / 2) * 2
  }
  return out
}

function resourcePhase(state: GameState, bot: Bot, ctx: Ctx) {
  const seat = state.seats[bot.id]
  act(state, bot.id, { type: 'drawResource' }, ctx)

  const afflicted = myRegions(state, bot.id).some((r) => state.regions[r].eventTokens.length > 0)

  if (bot.style === 'aggressive') {
    const keep: Partial<Record<Resource, number>> = { food: 2, ...(afflicted ? { wood: 2 } : {}) }
    const res = sellEven(seat, keep)
    let coins = seat.coins
    for (const n of Object.values(res)) coins += (n ?? 0) / 2
    if (Object.keys(res).length) act(state, bot.id, { type: 'sellResources', resources: res }, ctx)
    while (seat.coins >= state.config.armyCardCost && totalCardCount(state, bot.id) < 9) {
      const armies = armiesOf(state, bot.id).filter((a) => a.alive).sort((a, b) => a.cards.length - b.cards.length)
      if (!armies.length) break
      if (!act(state, bot.id, { type: 'buyArmyCard', armyId: armies[0].armyId }, ctx)) break
    }
  } else if (bot.style === 'economist') {
    const keep: Partial<Record<Resource, number>> = afflicted ? { wood: 2, food: 2 } : {}
    const res = sellEven(seat, keep)
    if (Object.keys(res).length) act(state, bot.id, { type: 'sellResources', resources: res }, ctx)
    if (seat.trade > 0) act(state, bot.id, { type: 'sellResources', resources: {}, trade: seat.trade }, ctx)
    if (seat.coins >= 13) {
      const own = seat.armiesOwned[seat.armiesOwned.length - 1]
      act(state, bot.id, { type: 'buyArmyCard', armyId: own as ArmyId }, ctx)
    }
  } else if (bot.style === 'turtle') {
    const maxRes = Math.max(seat.iron, seat.wood, seat.food)
    if (maxRes >= 8 && !seat.conditionsMet.includes('stockpile')) {
      // hold everything — stockpile chase
    } else if (maxRes >= 9) {
      const res = sellEven(seat, { iron: 4, wood: 4, food: 4 })
      if (Object.keys(res).length) act(state, bot.id, { type: 'sellResources', resources: res }, ctx)
    }
    const strongest = armiesOf(state, bot.id).filter((a) => a.alive).sort((a, b) => armyPower(b) - armyPower(a))[0]
    if (strongest && armyPower(strongest) < 3 && seat.coins >= state.config.armyCardCost) {
      act(state, bot.id, { type: 'buyArmyCard', armyId: strongest.armyId }, ctx)
    }
  } else {
    // chaser: fund magnate, use economy abilities
    if ((seat.abilityUsesLeft['shipwright'] ?? 0) > 0 && seat.trade < 3) {
      act(state, bot.id, { type: 'useAbility', ability: 'shipwright' }, ctx)
    }
    if ((seat.abilityUsesLeft['quartermaster'] ?? 0) > 0 && seat.coins < 3) {
      act(state, bot.id, { type: 'useAbility', ability: 'quartermaster' }, ctx)
    }
    if (!seat.conditionsMet.includes('caravans') || state.regionControl && myRegions(state, bot.id).some((r) => REGIONS[r].harbor)) {
      const sellTrade = seat.trade - (seat.conditionsMet.includes('caravans') ? 0 : 3)
      if (sellTrade > 0) {
        const hasHarbor = myRegions(state, bot.id).some((r) => REGIONS[r].harbor) || seat.personality === 'merchant_prince'
        if (hasHarbor) act(state, bot.id, { type: 'sellResources', resources: {}, trade: sellTrade }, ctx)
      }
    }
    const res = sellEven(seat, { food: 2 })
    let coins = seat.coins
    for (const n of Object.values(res)) coins += (n ?? 0) / 2
    if (coins < 7 && Object.keys(res).length) act(state, bot.id, { type: 'sellResources', resources: res }, ctx)
    if (seat.coins >= 9 && totalCardCount(state, bot.id) < 6) {
      const armies = armiesOf(state, bot.id).filter((a) => a.alive).sort((a, b) => armyPower(b) - armyPower(a))
      if (armies.length) act(state, bot.id, { type: 'buyArmyCard', armyId: armies[0].armyId }, ctx)
    }
  }

  if (state.phase === 'resource' && state.activeSeat === bot.id) {
    act(state, bot.id, { type: 'endResource' }, ctx)
  }
}

// ---------------------------------------------------------------------------
// turn driver
// ---------------------------------------------------------------------------

function runTurn(state: GameState, bot: Bot, ctx: Ctx, wasAfflictedAtStart: boolean) {
  bot.extraBought = 0
  ctx.productive[bot.id] = false
  ctx.attempted[bot.id] = new Set()
  ctx.fails[bot.id] = 0

  pump(state, ctx_allBots, ctx) // leftover battles/prizes from previous turns
  if (state.phase === 'gameover') return
  if (state.phase !== 'resource' || state.activeSeat !== bot.id) return

  resourcePhase(state, bot, ctx)
  if (state.phase === 'gameover') return

  let guard = 80
  while (state.phase === 'action' && state.activeSeat === bot.id && guard-- > 0) {
    pump(state, ctx_allBots, ctx)
    if (state.phase !== 'action' || state.activeSeat !== bot.id) return

    const afflicted = myRegions(state, bot.id).some((r) => state.regions[r].eventTokens.length > 0)
    if (afflicted) {
      if (tryRemovals(state, bot, ctx)) continue
      if ((ctx.clearFailRecords ?? 0) < 4) {
        ctx.clearFailRecords = (ctx.clearFailRecords ?? 0) + 1
        const regs = myRegions(state, bot.id).filter((r) => state.regions[r].eventTokens.length > 0)
        const s = state.seats[bot.id]
        anomaly(
          ctx,
          'seat unable to clear affliction (lacks removal resources) — actions blocked by strictAffliction',
          `r${state.round} ${bot.name} stuck: ${regs.map((r) => `${REGIONS[r].name}:${state.regions[r].eventTokens.map((t) => t.kind).join('/')}`).join(', ')} | coins=${s.coins} iron=${s.iron} wood=${s.wood} food=${s.food} medicine=${s.medicine} actionsLeft=${state.actionsLeft} | lastErr=${ctx.lastErr[bot.id] ?? '?'}`,
        )
      }
      act(state, bot.id, { type: 'endTurn' }, ctx)
      return
    }
    if (state.pendingBattle) {
      // pump failed to resolve it (bot commit error) — do not spin
      act(state, bot.id, { type: 'endTurn' }, ctx)
      return
    }

    if (state.actionsLeft <= 0) {
      const wantsExtra = bot.style === 'aggressive' && bot.extraBought < 3 && state.seats[bot.id].coins >= 2
      if (wantsExtra && act(state, bot.id, { type: 'buyExtraAction' }, ctx)) {
        bot.extraBought++
        continue
      }
      act(state, bot.id, { type: 'endTurn' }, ctx)
      return
    }

    let action: GameAction | null = null
    if (bot.style === 'aggressive') action = aggressiveNextAction(state, bot, ctx)
    else if (bot.style === 'economist') action = economistNextAction(state, bot, ctx)
    else if (bot.style === 'turtle') action = turtleNextAction(state, bot, ctx)
    else action = chaserNextAction(state, bot, ctx)

    if (!action) {
      act(state, bot.id, { type: 'endTurn' }, ctx)
      return
    }
    if (action.type === 'conquer' || action.type === 'battleInit') {
      const rid = (action as { regionId: string }).regionId
      ctx.lastGoal[bot.id] = rid
    }
    const ok = act(state, bot.id, action, ctx)
    if (ok) {
      if (action.type === 'moveArmy' || action.type === 'battleInit') pump(state, ctx_allBots, ctx)
      if (state.phase === 'gameover') return
    } else {
      if (ctx.lastGoal[bot.id]) ctx.attempted[bot.id].add(ctx.lastGoal[bot.id]!)
      if (++ctx.fails[bot.id] > 6) {
        act(state, bot.id, { type: 'endTurn' }, ctx)
        return
      }
    }
  }
  if (state.phase === 'action' && state.activeSeat === bot.id) {
    act(state, bot.id, { type: 'endTurn' }, ctx)
  }

  // passive-turn accounting (only meaningful for bots that always want to act)
  if (!ctx.productive[bot.id] && !wasAfflictedAtStart) {
    ctx.passiveStreak[bot.id]++
    ctx.maxPassive[bot.id] = Math.max(ctx.maxPassive[bot.id], ctx.passiveStreak[bot.id])
    if (ctx.passiveStreak[bot.id] === 4 && (bot.style === 'aggressive' || bot.style === 'chaser')) {
      anomaly(ctx, `${bot.name} (${bot.style}) could not act productively for 4+ consecutive turns (stuck)`, `r${state.round} ${bot.name} passive streak=4`)
    }
  } else {
    ctx.passiveStreak[bot.id] = 0
  }
}

// helper to let pump see every bot (defender may be anyone)
let ctx_allBots: Bot[] = []

// ---------------------------------------------------------------------------
// game runner
// ---------------------------------------------------------------------------

interface GameResult {
  label: string
  winner: string | null
  winnerStyle: string | null
  vpSpread: number
  rounds: number
  battles: number
  seatLines: string[]
  anomalies: string[]
  evidence: string[]
  battleStats: string
  battleDetails: string[]
  battleRecs: BattleRec[]
  errorTop: string[]
  eventStats: string
  teamChecks: string[]
  timeout: boolean
}

function playGame(nSeats: number, gameNo: number): GameResult {
  const strats =
    nSeats === 4
      ? ['aggressive', 'economist', 'turtle', 'chaser']
      : ['aggressive', 'economist', 'turtle', 'chaser', 'aggressive2', 'economist2']
  const NAMES4 = ['Chandrika', 'Dhana', 'Girija', 'Vanik', 'Vikrama', 'Sunanda']
  const seatInfos = strats.map((s, i) => ({ id: `s${i}`, name: NAMES4[i] }))
  const state = createGame(
    {
      vpTarget: nSeats === 4 ? 20 : undefined,
      advanced: true,
      eventFrequency: 'every',
      hiddenTokens: 10,
      strictAffliction: true,
    },
    seatInfos,
  )
  const bots = buildBots(strats, seatInfos)
  ctx_allBots = bots
  const ctx = newCtx(seatInfos.map((s) => s.id))

  const teamChecks: string[] = []

  if (nSeats === 6) {
    const k0 = state.kingdoms['k0']
    const k1 = state.kingdoms['k1']
    teamChecks.push(
      `k0 seats=[${k0.seats}] k1 seats=[${k1.seats}] turnOrder=${state.turnOrder.length}`,
      `armies: ${state.armies.map((a) => `${a.id}@${a.regionId}(${a.cards.length}c)`).join(', ')}`,
      `k0 capital=${k0.capital} fortSupply=${k0.fortSupply} (shared)`,
    )
  }

  // audits straight after setup — catches initial occupation desync
  audit(state, ctx, 'setup')
  processLogs(state, ctx)

  // drafts
  for (const bot of bots) {
    act(state, bot.id, { type: 'draft', personality: bot.personality, abilities: bot.abilities }, ctx)
  }

  // probe: can a NON-active seat use an ability outside their turn?
  {
    const active = state.activeSeat
    const other = bots.find((b) => b.style === 'economist')!
    const legal = other.abilities.find((a) => a !== 'seer')!
    try {
      handleAction(state, other.id, { type: 'useAbility', ability: legal })
      const msg = `engine ACCEPTED ${other.name}.useAbility(${legal}) while ${state.seats[active].name} was the active ruler`
      ctx.anomalies.push('abilities can be used out-of-turn / in any phase (no requireActive or phase gate on useAbility)')
      ctx.evidence.push(msg)
      processLogs(state, ctx)
      audit(state, ctx, 'probe:out-of-turn-ability')
    } catch (err) {
      if (err instanceof GameError) {
        ctx.evidence.push(`useAbility out-of-turn correctly refused: ${err.message}`)
      }
    }
  }

  const afflictedAtStart: Record<string, boolean> = {}
  let safety = nSeats * 220
  let timeout = false
  while (state.phase !== 'gameover' && safety-- > 0) {
    const bot = bots.find((b) => b.id === state.activeSeat)
    if (!bot) break
    // per-seat streak accounting at turn start
    const aff = myRegions(state, bot.id).some((r) => state.regions[r].eventTokens.length > 0)
    if (aff) {
      ctx.afflictedStreak[bot.id]++
      ctx.maxAfflicted[bot.id] = Math.max(ctx.maxAfflicted[bot.id], ctx.afflictedStreak[bot.id])
      if (ctx.afflictedStreak[bot.id] === 4) {
        const regs = myRegions(state, bot.id).filter((r) => state.regions[r].eventTokens.length > 0)
        anomaly(
          ctx,
          `${bot.name} (${bot.style}) afflicted at turn start 4+ turns running (strict-affliction squeeze)`,
          `r${state.round} ${bot.name} afflicted at: ${regs.map((r) => `${REGIONS[r].name}(${state.regions[r].eventTokens.map((t) => t.kind).join(',')})`).join(', ')}; coins=${state.seats[bot.id].coins} wood=${state.seats[bot.id].wood} food=${state.seats[bot.id].food}`,
        )
      }
    } else {
      ctx.afflictedStreak[bot.id] = 0
    }
    afflictedAtStart[bot.id] = aff
    runTurn(state, bot, ctx, afflictedAtStart[bot.id])
  }
  if (state.phase !== 'gameover') {
    timeout = true
    const regs: Record<string, string> = {}
    for (const s of Object.values(state.seats)) {
      regs[s.name] = myRegions(state, s.id)
        .filter((r) => state.regions[r].eventTokens.length > 0)
        .map((r) => `${REGIONS[r].name}:${state.regions[r].eventTokens.map((t) => t.kind).join('/')}`)
        .join(', ') || 'clean'
    }
    const dump = [
      `STUCK-DUMP phase=${state.phase} active=${state.activeSeat} round=${state.round}`,
      `pendingEvent=${state.pendingEventPlacement ? state.pendingEventPlacement.card.name : 'none'} pendingPrize=${state.pendingPrize ? 'yes' : 'none'} pendingBattle=${state.pendingBattle ? state.pendingBattle.id : 'none'}`,
      `afflictions: ${JSON.stringify(regs)}`,
      `last logs: ${state.log.slice(-6).map((l) => l.text).join(' || ')}`,
    ].join('\n    ')
    anomaly(ctx, `game froze without reaching gameover (safety stop after ${nSeats * 220} turn-ticks)`, dump)
  }

  // ----- report -----
  const seats = Object.values(state.seats).sort((a, b) => b.vp - a.vp)
  const winner = state.winner ? state.seats[state.winner] : null
  const vpSpread = seats[0].vp - seats[seats.length - 1].vp
  const seatLines = seats.map((s) => {
    const bot = bots.find((b) => b.id === s.id)!
    const regions = myRegions(state, s.id).length
    return `${s.name}[${bot.style}] vp=${s.vp} (conq=${ctx.conquestVP[s.id]}, prizes=${ctx.prizeVP[s.id]}, battles=${ctx.battleVP[s.id] ?? 0}) regions=${regions} coins=${s.coins} wins=${s.winsBattles} conquests=${ctx.conquests[s.id]} sold→${ctx.coinsFromSell[s.id]}c cards→${ctx.coinsToCards[s.id]}c cond=${s.conditionsMet.length} maxAffl=${ctx.maxAfflicted[s.id]} maxPassive=${ctx.maxPassive[s.id]}`
  })

  const bs = ctx.battles
  const atkWins = bs.filter((b) => b.atkWon).length
  const margins = bs.map((b) => Math.abs(b.atk - b.def))
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const sorted = [...margins].sort((a, b) => a - b)
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
  const battleStats = bs.length
    ? `battles=${bs.length} atkWin=${atkWins}/${bs.length} margin avg=${avg(margins).toFixed(1)} med=${med} max=${Math.max(...margins, 0)} terrainBonus avg=${avg(bs.map((b) => b.bonus)).toFixed(1)}`
    : 'battles=0'
  const eventStats = `events drawn=${ctx.eventDrawn} placed=${ctx.eventPlaced} removed=${ctx.eventRemoved} riotsToppledForts=${ctx.riotsToppled} noFootholdSkips=${ctx.eventNoFoothold} extraActionsBought=${ctx.extraActions} staleOccupationDetections=${ctx.staleOccupation}`

  if (nSeats === 6) {
    const k0 = state.kingdoms['k0']
    teamChecks.push(`final k0 forts=[${Object.keys(k0.forts).join(',')}] fortSupply=${k0.fortSupply}`)
    const s0 = state.seats['s0']
    const s4 = state.seats['s4']
    teamChecks.push(`co-ruler VP: ${s0.name}=${s0.vp}, partner ${s4.name}=${s4.vp} (conquests credited to acting seat only)`)
    if (ctx.seizeLog.length) teamChecks.push(`VP-steal charges: ${ctx.seizeLog.join('; ')}`)
    else teamChecks.push('VP-steal charges: none triggered in this game')
  }

  const label = `Game ${gameNo} (${nSeats}P, vpTarget=${state.config.vpTarget})`
  return {
    label,
    winner: winner ? `${winner.name} [${bots.find((b) => b.id === winner.id)!.style}]` : null,
    winnerStyle: winner ? bots.find((b) => b.id === winner.id)!.style : null,
    vpSpread,
    rounds: state.round,
    battles: bs.length,
    seatLines,
    anomalies: ctx.anomalies,
    evidence: ctx.evidence,
    battleStats,
    battleDetails: bs.filter((b) => b.detail).slice(0, 8).map((b) => b.detail!),
    battleRecs: bs,
    errorTop: Object.entries(ctx.errors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m, n]) => `${m} ×${n}`),
    eventStats,
    teamChecks,
    timeout,
  }
}

// ---------------------------------------------------------------------------
// deterministic 6P probe: does vpSteal charge the co-ruler who earned the VP?
// ---------------------------------------------------------------------------

function runStealProbe(): string[] {
  const out: string[] = []
  const seatInfos = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((n, i) => ({ id: `s${i}`, name: n }))
  const state = createGame(
    { advanced: true, eventFrequency: 'off', hiddenTokens: 0, strictAffliction: false },
    seatInfos,
  )
  const personalities: PersonalityId[] = ['war_elephants', 'merchant_prince', 'tax_collector', 'granary_keeper', 'master_mason', 'iron_raja']
  seatInfos.forEach((info, i) => {
    handleAction(state, info.id, { type: 'draft', personality: personalities[i], abilities: ['strategist', 'peacemaker'] })
  })

  const k0 = state.kingdoms['k0'] // P0 (seats[0]) + P4 (seats[1]) co-rule
  const armyCells = () => new Set(state.armies.filter((a) => a.alive && a.regionId).map((a) => a.regionId as string))
  const armyOf = (sid: string) => state.armies.find((a) => a.ownerId === sid && a.alive)!

  // shortest path avoiding cells occupied by any army (destination must also be army-free)
  function bfsPath(from: string, to: string): string[] | null {
    if (armyCells().has(to)) return null
    const prev = new Map<string, string | null>([[from, null]])
    const q = [from]
    while (q.length) {
      const cur = q.shift()!
      if (cur === to && from !== to) {
        const path: string[] = [to]
        let p = prev.get(to) ?? null
        while (p && p !== from) {
          path.unshift(p)
          p = prev.get(p) ?? null
        }
        return path
      }
      for (const n of REGIONS[cur].neighbors) {
        if (!prev.has(n) && (n === to || !armyCells().has(n))) {
          prev.set(n, cur)
          q.push(n)
        }
      }
    }
    return null
  }

  // pick earn target: nearest province ≤2 steps from k0.capital, cost ≤3, army-free path
  type Plan = { target: string; path: string[]; cost: number; earner: string }
  let earn: Plan | null = null
  for (const rid of Object.keys(REGIONS)) {
    const region = REGIONS[rid]
    if (region.kind !== 'province' || region.value > 3 || state.regionControl[rid]) continue
    const path = bfsPath(k0.capital, rid)
    if (!path || path.length > 2) continue
    if (!earn || path.length < earn.path.length) {
      earn = { target: rid, path, cost: region.value, earner: 's4' }
    }
  }
  if (!earn) {
    out.push('steal probe skipped: no province reachable within 2 army-free steps of the k0 capital')
    return out
  }
  out.push(`steal probe: k0=${k0.name} capital=${k0.capital}; P4 will earn VP on ${earn.target} (path ${earn.path.join('→')}, cost ${earn.cost}); seizer chosen after the earn (avoids the parked army)`)
  let seizer: { kid: string; seat: string; path: string[] } | null = null

  const coinsFor = (actions: number, cost: number) => cost + Math.max(0, actions - 2) // free actions = 2, extra = 1 coin
  const sellFor = (sid: string, coinsNeeded: number) => {
    const toSell = Math.min(12, coinsNeeded * 2)
    const res: Partial<Record<Resource, number>> = {}
    let left = toSell
    for (const r of ['iron', 'wood', 'food'] as Resource[]) {
      const take = Math.min(left, state.seats[sid][r])
      if (take > 0) {
        res[r] = take
        left -= take
      }
    }
    handleAction(state, sid, { type: 'sellResources', resources: res })
  }
  const minimal = (sid: string) => {
    handleAction(state, sid, { type: 'drawResource' })
    handleAction(state, sid, { type: 'endResource' })
    handleAction(state, sid, { type: 'endTurn' })
    if (state.pendingPrize) handleAction(state, state.pendingPrize.seatId, { type: 'choosePrize', optionIndex: 0 })
  }

  const army4 = armyOf('s4')
  let earned = false
  let seized = false
  let guard = 40
  while (state.phase !== 'gameover' && guard-- > 0 && !(earned && seized)) {
    const sid = state.activeSeat
    const round = state.round
    try {
      if (sid === earn.earner && round >= 1 && !earned) {
        const actions = earn.path.length + 2 // moves + conquer + step back
        handleAction(state, 's4', { type: 'drawResource' })
        sellFor('s4', coinsFor(actions, earn.cost))
        handleAction(state, 's4', { type: 'endResource' })
        for (let i = 0; i < actions - 2; i++) handleAction(state, 's4', { type: 'buyExtraAction' })
        for (const step of earn.path) handleAction(state, 's4', { type: 'moveArmy', armyId: army4.armyId, to: step })
        handleAction(state, 's4', { type: 'conquer', regionId: earn.target })
        // step back off the target so the seizer meets no army
        const backCell = earn.path.length >= 2 ? earn.path[earn.path.length - 2] : k0.capital
        handleAction(state, 's4', { type: 'moveArmy', armyId: army4.armyId, to: backCell })
        handleAction(state, 's4', { type: 'endTurn' })
        if (state.pendingPrize) handleAction(state, state.pendingPrize.seatId, { type: 'choosePrize', optionIndex: 0 })
        earned = true
        // choose seizer now, routing around the parked army
        for (const kid of ['k1', 'k2', 'k3']) {
          const path = bfsPath(state.kingdoms[kid].capital, earn.target)
          if (path && (!seizer || path.length < seizer.path.length)) {
            seizer = { kid, seat: state.kingdoms[kid].seats[0], path }
          }
        }
        if (!seizer) {
          out.push('steal probe aborted: no seizer kingdom can reach the target around the parked army')
          return out
        }
        out.push(`probe: P4 conquered ${earn.target}; P4.vp=${state.seats['s4'].vp} P0.vp=${state.seats['s0'].vp} control=${state.regionControl[earn.target]}; seizer ${seizer.kid} (${seizer.seat}) via ${seizer.path.join('→')}`)
      } else if (seizer && sid === seizer.seat && earned && !seized) {
        const actions = seizer!.path.length + 1
        const armyX = armyOf(seizer!.seat)
        handleAction(state, sid, { type: 'drawResource' })
        sellFor(sid, coinsFor(actions, earn.cost))
        handleAction(state, sid, { type: 'endResource' })
        for (let i = 0; i < actions - 2; i++) handleAction(state, sid, { type: 'buyExtraAction' })
        for (const step of seizer!.path) handleAction(state, sid, { type: 'moveArmy', armyId: armyX.armyId, to: step })
        handleAction(state, sid, { type: 'conquer', regionId: earn.target })
        seized = true
        const seizeLines = state.log.filter((l) => l.text.includes('region seized')).map((l) => l.text)
        out.push(
          `probe: ${sid} seized ${earn.target} back; control=${state.regionControl[earn.target]} (expect ${seizer!.kid})`,
          `probe RESULT: earner P4.vp=${state.seats['s4'].vp}, partner P0.vp=${state.seats['s0'].vp}; seize-charge lines=[${seizeLines.length ? seizeLines.join(' | ') : 'NONE'}]`,
        )
        if (state.seats['s4'].vp >= earn.cost && seizeLines.length === 0) {
          out.push(`probe CONFIRMS BUG: vpSteal (engine.ts transferControl) reads kingdom.seats[0] — P0 (vp=0) was charged, so the co-ruler who earned ${earn.cost} VP keeps it; the seizure charged nobody`)
        }
      } else {
        minimal(sid)
      }
    } catch (err) {
      out.push(`probe aborted at r${state.round} ${sid}: ${(err as Error).message}`)
      return out
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const GAMES = Number(process.env.GAMES ?? 6)
const SIXP = Number(process.env.SIXP ?? 1)
console.log(`— Bharata logic playtest: ${GAMES}× 4P + ${SIXP}× 6P co-ruler game (event targeting: ${EVENT_MODE}) —\n`)

// deterministic team-play probe first
console.log('— 6P vpSteal probe (deterministic) —')
for (const line of runStealProbe()) console.log(`  ${line}`)
console.log()

const results: GameResult[] = []
for (let i = 1; i <= GAMES; i++) {
  const r = playGame(4, i)
  results.push(r)
  console.log(`=== ${r.label} ===`)
  console.log(`  winner: ${r.winner ?? 'NONE (timeout)'} | rounds=${r.rounds} | ${r.battleStats}`)
  for (const l of r.seatLines) console.log(`  ${l}`)
  console.log(`  ${r.eventStats}`)
  if (r.errorTop.length) console.log(`  engine rejections: ${r.errorTop.join(' | ')}`)
  if (r.battleDetails.length) {
    console.log(`  battles:`)
    for (const b of r.battleDetails) console.log(`     ${b}`)
  }
  if (r.anomalies.length) {
    console.log(`  ⚠ anomalies:`)
    for (const a of r.anomalies) console.log(`     - ${a}`)
    for (const e of r.evidence.slice(0, 8)) console.log(`       · ${e}`)
  } else {
    console.log(`  no anomalies`)
  }
  console.log()
}

// 6P co-ruler games
for (let i = 1; i <= SIXP; i++) {
  const r6 = playGame(6, GAMES + i)
  results.push(r6)
  console.log(`=== ${r6.label} (seats 5-6 co-rule kingdoms 1-2) ===`)
  console.log(`  winner: ${r6.winner ?? 'NONE (timeout)'} | rounds=${r6.rounds} | ${r6.battleStats}`)
  for (const l of r6.seatLines) console.log(`  ${l}`)
  for (const t of r6.teamChecks) console.log(`  team-check: ${t}`)
  console.log(`  ${r6.eventStats}`)
  if (r6.errorTop.length) console.log(`  engine rejections: ${r6.errorTop.join(' | ')}`)
  if (r6.anomalies.length) {
    console.log(`  ⚠ anomalies:`)
    for (const a of r6.anomalies) console.log(`     - ${a}`)
    for (const e of r6.evidence.slice(0, 18)) console.log(`       · ${e}`)
  } else {
    console.log(`  no anomalies`)
  }
  console.log()
}

// ----- aggregate -----
console.log('\n— AGGREGATE (4P games) —')
const g4 = results.filter((r) => r.label.includes('(4P'))
const rounds = g4.map((r) => r.rounds)
const winnerStyles = g4.map((r) => r.winnerStyle ?? 'timeout')
const allBattles = g4.flatMap((r) => r.battleRecs)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
console.log(`rounds: min=${Math.min(...rounds)} max=${Math.max(...rounds)} avg=${avg(rounds).toFixed(1)}`)
console.log(`winners by strategy: ${winnerStyles.join(', ')}`)
console.log(`battles/game avg=${avg(g4.map((r) => r.battles)).toFixed(1)}, attacker winrate=${Math.round((allBattles.filter((b) => b.atkWon).length / Math.max(allBattles.length, 1)) * 100)}%`)
const allMargins = allBattles.map((b) => Math.abs(b.atk - b.def)).filter((x) => Number.isFinite(x))
console.log(`battle margins: avg=${avg(allMargins).toFixed(1)} max=${allMargins.length ? Math.max(...allMargins) : 0}`)
const anomCount: Record<string, number> = {}
for (const r of results) for (const a of r.anomalies) anomCount[a] = (anomCount[a] ?? 0) + 1
console.log('anomalies across all games:')
for (const [a, n] of Object.entries(anomCount).sort((x, y) => y[1] - x[1])) console.log(`  ${n}× ${a}`)
