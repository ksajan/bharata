/**
 * Headless playthrough — drives a full 2-player advanced game through the
 * engine with simple bot policies and asserts invariants. Run:
 *   npx tsx scripts/simulate.ts
 */
import { createGame, handleAction, GameError } from '../shared/engine'
import { ABILITIES, REGIONS } from '../shared/data'
import type { AbilityId, GameState, PersonalityId } from '../shared/types'

let failures = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++
    console.error('  ✗ FAIL:', msg)
  }
}

function tryAction(state: GameState, seatId: string, action: Parameters<typeof handleAction>[2]): boolean {
  try {
    handleAction(state, seatId, action)
    return true
  } catch (e) {
    if (!(e instanceof GameError)) throw e
    return false
  }
}

const PERSONALITIES: PersonalityId[] = ['merchant_prince', 'iron_raja', 'granary_keeper', 'war_elephants', 'master_mason', 'tax_collector']
const ABILITY_IDS = Object.keys(ABILITIES) as AbilityId[]

function validEventTarget(state: GameState): string | null {
  const pe = state.pendingEventPlacement
  if (!pe) return null
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
    return region.id
  }
  return null
}

function bfsStep(state: GameState, from: string, goal: string): string | null {
  // returns first step on shortest path from->goal
  if (from === goal) return null
  const prev = new Map<string, string | null>([[from, null]])
  const q = [from]
  while (q.length) {
    const cur = q.shift()!
    for (const n of REGIONS[cur].neighbors) {
      if (!prev.has(n)) {
        prev.set(n, cur)
        if (n === goal) {
          let step = n
          let p = prev.get(n)
          while (p !== from && p) {
            step = p
            p = prev.get(p) ?? null
          }
          return step
        }
        q.push(n)
      }
    }
  }
  return null
}

function kingdomRegionCount(state: GameState, seatId: string): number {
  const k = state.kingdoms[state.seats[seatId].kingdomId]
  return Object.values(k.forts).filter((x) => x === k.id).length
}

function runBotTurn(state: GameState, seatId: string) {
  const seat = state.seats[seatId]
  const kingdom = state.kingdoms[seat.kingdomId]

  // resolve any pending battle commitments involving us
  const commitBattle = () => {
    const b = state.pendingBattle
    if (b && b.awaiting.includes(seatId)) {
      const isAtk = b.attackerSeat === seatId
      const armyLimit = isAtk ? undefined : seat.armiesOwned[0]
      const cards = state.armies
        .filter((a) => a.ownerId === seatId && a.alive && (armyLimit === undefined || a.armyId === armyLimit))
        .flatMap((a) => a.cards.slice(0, isAtk ? 5 : 3).map((c) => ({ armyId: a.armyId, cardId: c.id })))
      tryAction(state, seatId, { type: 'battleCommit', cards })
      return true
    }
    return false
  }
  commitBattle()

  // resource phase
  tryAction(state, seatId, { type: 'drawResource' })
  // sell half of everything
  const sell = {
    iron: Math.floor(seat.iron / state.config.sellRate),
    wood: Math.floor(seat.wood / state.config.sellRate),
    food: Math.max(0, Math.floor(seat.food / state.config.sellRate) - 2),
  }
  tryAction(state, seatId, { type: 'sellResources', resources: sell })
  // buy up to 2 army cards
  for (let i = 0; i < 2; i++) {
    if (seat.coins >= state.config.armyCardCost) {
      const own = seat.armiesOwned[seat.armiesOwned.length - 1]
      tryAction(state, seatId, { type: 'buyArmyCard', armyId: own })
    }
  }
  tryAction(state, seatId, { type: 'endResource' })

  // action phase
  let guard = 40
  while (state.phase === 'action' && state.activeSeat === seatId && guard-- > 0) {
    if (state.pendingBattle) {
      if (!commitBattle()) break
      continue
    }
    // afflicted? try to remove
    const afflicted = Object.entries(kingdom.forts)
      .filter(([rid, kid]) => kid === kingdom.id && (state.regions[rid]?.eventTokens.length ?? 0) > 0)
    if (afflicted.length > 0) {
      const rid = afflicted[0][0]
      if (tryAction(state, seatId, { type: 'removeEvent', regionId: rid })) continue
      if (tryAction(state, seatId, { type: 'removeEvent', regionId: rid, useMedicine: true })) continue
      if (seat.medicine > 0) tryAction(state, seatId, { type: 'useAbility', ability: 'physician', payload: undefined })
      tryAction(state, seatId, { type: 'endTurn' })
      return
    }

    if (state.actionsLeft <= 0) {
      if (!tryAction(state, seatId, { type: 'buyExtraAction' })) break
      continue
    }

    // pick an army with cards
    const army = state.armies.find((a) => a.ownerId === seatId && a.alive && a.cards.length > 0) ?? state.armies.find((a) => a.ownerId === seatId && a.alive)
    if (!army || !army.regionId) break

    // goal: nearest region not ruled by us
    const start = army.regionId
    const goal = Object.keys(REGIONS)
      .filter((rid) => state.regionControl[rid] !== kingdom.id)
      .sort((a, b) => REGIONS[a].value - REGIONS[b].value)
      .sort((a, b) => {
        const da = bfsPathLen(start, a)
        const db = bfsPathLen(start, b)
        return da - db
      })[0]
    if (!goal) break

    if (start === goal) {
      // standing on it: conquer or battle
      const enemy = state.regions[start].armies.find((a) => state.seats[a.seatId].kingdomId !== kingdom.id)
      if (enemy) {
        if (tryAction(state, seatId, { type: 'battleInit', regionId: start })) {
          commitBattle()
          continue
        }
        break
      }
      if (state.regionControl[start] === kingdom.id) {
        // own region — search hidden or just end
        if (state.regions[start].hiddenToken && tryAction(state, seatId, { type: 'revealHidden', regionId: start })) continue
        tryAction(state, seatId, { type: 'endTurn' })
        return
      }
      const region = REGIONS[start]
      if (region.kind === 'province') {
        if (!tryAction(state, seatId, { type: 'conquer', regionId: start })) {
          tryAction(state, seatId, { type: 'endTurn' })
          return
        }
        continue
      } else {
        // mahajanapada — gather cards from armies
        const need = region.value
        const pay: { armyId: 1 | 2; cardId: string }[] = []
        for (const a of state.armies.filter((x) => x.ownerId === seatId)) {
          for (const c of a.cards) {
            if (pay.length < need) pay.push({ armyId: a.armyId, cardId: c.id })
          }
        }
        if (pay.length < need || !tryAction(state, seatId, { type: 'conquer', regionId: start, payWithCards: pay })) {
          tryAction(state, seatId, { type: 'endTurn' })
          return
        }
        continue
      }
    } else {
      const step = bfsStep(state, start, goal)
      if (!step || !tryAction(state, seatId, { type: 'moveArmy', armyId: army.armyId, to: step })) {
        tryAction(state, seatId, { type: 'endTurn' })
        return
      }
      if (state.pendingBattle) commitBattle()
      continue
    }
  }
  if (state.phase === 'action' && state.activeSeat === seatId) tryAction(state, seatId, { type: 'endTurn' })

  function bfsPathLen(from: string, to: string): number {
    const prev = new Map<string, number>([[from, 0]])
    const q = [from]
    while (q.length) {
      const cur = q.shift()!
      if (cur === to) return prev.get(cur)!
      for (const n of REGIONS[cur].neighbors) {
        if (!prev.has(n)) {
          prev.set(n, prev.get(cur)! + 1)
          q.push(n)
        }
      }
    }
    return 99
  }
}

// ---------------------------------------------------------------------------
console.log('— Bharata headless playthrough —')
const state = createGame(
  { vpTarget: 14, advanced: true, eventFrequency: 'every', hiddenTokens: 10, strictAffliction: true },
  [
    { id: 's0', name: 'Bimbisara' },
    { id: 's1', name: 'Prasenajit' },
  ],
)

assert(state.phase === 'draft', 'game starts in draft phase')
assert(state.kingdoms['k0'].capital !== state.kingdoms['k1'].capital, 'capitals are distinct')

// drafts
for (const [i, sid] of ['s0', 's1'].entries()) {
  handleAction(state, sid, {
    type: 'draft',
    personality: PERSONALITIES[i],
    abilities: [ABILITY_IDS[i * 2], ABILITY_IDS[i * 2 + 1]],
  })
}
assert(state.phase === 'resource', 'game enters resource phase after drafts')
assert(state.armies.length === 4, '2 kingdoms × 2 armies')
assert(Object.values(state.seats).every((s) => s.iron === 4 && s.wood === 4 && s.food === 4), 'starting resources 4/4/4')
assert(state.armies.filter((a) => a.armyId === 1).every((a) => a.cards.length === 2), 'each primary army starts with 2 cards')
assert(state.armies.every((a) => a.alive), 'all armies start alive')
assert(Object.keys(state.regions).every((rid) => state.regions[rid].hiddenToken !== undefined || !REGIONS[rid].hiddenSpot || state.config.hiddenTokens === 0), 'hidden token slots initialized')

// play up to 80 turns
let turns = 0
while (state.phase !== 'gameover' && turns < 80) {
  turns++
  const seatId = state.activeSeat
  runBotTurn(state, seatId)
  // event placement / prize resolution might be pending for the active seat
  let inner = 0
  while ((state.pendingEventPlacement || state.pendingPrize) && state.phase !== 'gameover' && inner++ < 10) {
    if (state.pendingEventPlacement) {
      const t = validEventTarget(state)
      if (t === null) {
        // omen has no legal foothold — the engine accepts a skip
        handleAction(state, state.activeSeat, { type: 'placeEventTarget', regionId: '__skip__' })
        continue
      }
      handleAction(state, seatId, { type: 'placeEventTarget', regionId: t })
    }
    if (state.pendingPrize) {
      handleAction(state, state.pendingPrize.seatId, { type: 'choosePrize', optionIndex: 0 })
    }
  }
}

console.log(`  turns played: ${turns}, phase: ${state.phase}`)
if (state.phase !== 'gameover') {
  for (const s of Object.values(state.seats)) {
    const k = state.kingdoms[s.kingdomId]
    const forts = Object.values(k.forts).filter((x) => x === k.id).length
    const armies = state.armies.filter((a) => a.ownerId === s.id).map((a) => `${a.alive ? `@${a.regionId}` : 'dead'}:${a.cards.length}`).join(' ')
    console.log(`  [timeout-diag] ${s.name}: vp=${s.vp} forts=${forts} coins=${s.coins} armies[${armies}]`)
  }
}
assert(state.phase === 'gameover', 'game reaches gameover')
if (state.phase === 'gameover') {
  const w = state.seats[state.winner!]
  console.log(`  winner: ${w.name} with ${w.vp} VP`)
  assert(w.vp >= state.config.vpTarget, 'winner reached VP target')
}

// invariants
for (const [rid, ctrl] of Object.entries(state.regionControl)) {
  if (ctrl) assert(state.kingdoms[ctrl].forts[rid] === ctrl, `control map consistent for ${rid}`)
}
for (const army of state.armies) {
  if (!army.alive) assert(army.regionId === null, 'dead armies have no region')
  if (army.alive) assert(army.regionId !== null && REGIONS[army.regionId] !== undefined, 'live armies are on the map')
}
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} checks failed`)

console.log('\n— last 12 chronicle entries —')
for (const l of state.log.slice(-12)) console.log(`  ${l.text}`)
process.exit(failures === 0 ? 0 : 1)
