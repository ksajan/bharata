/** Variant configs: basic 3P + team 7P. Run: npx tsx scripts/simulate-variants.ts */
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

function runBotTurn(state: GameState, seatId: string) {
  const seat = state.seats[seatId]
  const kingdom = state.kingdoms[seat.kingdomId]
  const commitBattle = () => {
    const b = state.pendingBattle
    if (b && b.awaiting.includes(seatId)) {
      const isAtk = b.attackerSeat === seatId
      const limit = isAtk ? undefined : seat.armiesOwned[0]
      const cards = state.armies
        .filter((a) => a.ownerId === seatId && a.alive && (limit === undefined || a.armyId === limit))
        .flatMap((a) => a.cards.slice(0, isAtk ? 4 : 3).map((c) => ({ armyId: a.armyId, cardId: c.id })))
      tryAction(state, seatId, { type: 'battleCommit', cards })
      return true
    }
    return false
  }
  commitBattle()
  tryAction(state, seatId, { type: 'drawResource' })
  tryAction(state, seatId, {
    type: 'sellResources',
    resources: {
      iron: Math.floor(seat.iron / state.config.sellRate),
      wood: Math.floor(seat.wood / state.config.sellRate),
      food: Math.max(0, Math.floor(seat.food / state.config.sellRate) - 2),
    },
  })
  for (let i = 0; i < 3; i++) {
    if (seat.coins >= state.config.armyCardCost) {
      // reinforce the weaker hand
      const armies = state.armies.filter((a) => a.ownerId === seatId && a.alive)
      armies.sort((a, b) => a.cards.length - b.cards.length)
      tryAction(state, seatId, { type: 'buyArmyCard', armyId: (armies[0]?.armyId ?? seat.armiesOwned[0]) as 1 | 2 })
    } else if (seat.iron >= 2 && seat.coins >= 2) {
      const armies = state.armies.filter((a) => a.ownerId === seatId && a.alive)
      armies.sort((a, b) => a.cards.length - b.cards.length)
      tryAction(state, seatId, { type: 'buyArmyCard', armyId: (armies[0]?.armyId ?? seat.armiesOwned[0]) as 1 | 2, forge: true })
    } else break
  }
  tryAction(state, seatId, { type: 'endResource' })

  let guard = 30
  while (state.phase === 'action' && state.activeSeat === seatId && guard-- > 0) {
    if (state.pendingBattle) {
      if (!commitBattle()) break
      continue
    }
    const afflicted = Object.entries(kingdom.forts).filter(([rid, kid]) => kid === kingdom.id && (state.regions[rid]?.eventTokens.length ?? 0) > 0)
    if (afflicted.length > 0) {
      const rid = afflicted[0][0]
      if (tryAction(state, seatId, { type: 'removeEvent', regionId: rid })) continue
      if (tryAction(state, seatId, { type: 'removeEvent', regionId: rid, useMedicine: true })) continue
      tryAction(state, seatId, { type: 'endTurn' })
      return
    }
    if (state.actionsLeft <= 0) break

    const army = state.armies.find((a) => a.ownerId === seatId && a.alive && a.cards.length > 0)
    if (!army || !army.regionId) break
    const start = army.regionId
    // go for the juiciest adjacent-ish unruled region within 3 steps
    const goals = Object.keys(REGIONS)
      .filter((rid) => state.regionControl[rid] !== kingdom.id)
      .map((rid) => ({ rid, d: pathLen(start, rid), v: REGIONS[rid].value }))
      .filter((g) => g.d <= 3)
      .sort((a, b) => b.v - a.v)
    const goal = goals[0]
    if (!goal) {
      tryAction(state, seatId, { type: 'endTurn' })
      return
    }
    if (start === goal.rid) {
      const enemy = state.regions[start].armies.find((a) => state.seats[a.seatId].kingdomId !== kingdom.id)
      if (enemy) {
        if (tryAction(state, seatId, { type: 'battleInit', regionId: start })) {
          commitBattle()
          continue
        }
        break
      }
      if (state.regionControl[start] === kingdom.id) {
        tryAction(state, seatId, { type: 'endTurn' })
        return
      }
      const region = REGIONS[start]
      if (region.kind === 'province') {
        if (!tryAction(state, seatId, { type: 'conquer', regionId: start })) break
        continue
      }
      const pay: { armyId: 1 | 2; cardId: string }[] = []
      for (const a of state.armies.filter((x) => x.ownerId === seatId && x.alive)) {
        for (const c of a.cards) if (pay.length < region.value) pay.push({ armyId: a.armyId, cardId: c.id })
      }
      if (pay.length < region.value || !tryAction(state, seatId, { type: 'conquer', regionId: start, payWithCards: pay })) break
      continue
    }
    // one step toward goal
    const prev = new Map<string, string | null>([[start, null]])
    const q = [start]
    let step: string | null = null
    while (q.length && !step) {
      const cur = q.shift()!
      for (const n of REGIONS[cur].neighbors) {
        if (!prev.has(n)) {
          prev.set(n, cur)
          if (n === goal.rid) {
            let s = n
            let p = prev.get(n) ?? null
            while (p !== start && p) {
              s = p
              p = prev.get(p) ?? null
            }
            step = s
            break
          }
          q.push(n)
        }
      }
    }
    if (!step || !tryAction(state, seatId, { type: 'moveArmy', armyId: army.armyId, to: step })) {
      tryAction(state, seatId, { type: 'endTurn' })
      return
    }
    if (state.pendingBattle) commitBattle()
  }
  if (state.phase === 'action' && state.activeSeat === seatId) tryAction(state, seatId, { type: 'endTurn' })

  function pathLen(from: string, to: string): number {
    const dist = new Map<string, number>([[from, 0]])
    const q = [from]
    while (q.length) {
      const cur = q.shift()!
      if (cur === to) return dist.get(cur)!
      for (const n of REGIONS[cur].neighbors) {
        if (!dist.has(n)) {
          dist.set(n, dist.get(cur)! + 1)
          q.push(n)
        }
      }
    }
    return 99
  }
}

function playGame(name: string, seats: number, cfg: Parameters<typeof createGame>[0], maxTurns = 300) {
  console.log(`— ${name} —`)
  const seatInfos = Array.from({ length: seats }, (_, i) => ({ id: `s${i}`, name: `Ruler${i}` }))
  const state = createGame(cfg, seatInfos)
  for (let i = 0; i < seats; i++) {
    handleAction(state, `s${i}`, {
      type: 'draft',
      personality: PERSONALITIES[i % PERSONALITIES.length],
      abilities: [ABILITY_IDS[(i * 2) % ABILITY_IDS.length], ABILITY_IDS[(i * 2 + 1) % ABILITY_IDS.length]],
    })
  }
  assert(state.kingdomIds.length === Math.min(seats, 4), 'kingdom count = min(seats,4)')
  if (seats > 4) {
    const k0seats = state.kingdoms['k0'].seats.length
    assert(k0seats === 2, 'team kingdoms have 2 co-rulers')
    const s4 = state.seats['s4']
    assert(s4.kingdomId === 'k0' && s4.armiesOwned.length === 1 && s4.armiesOwned[0] === 2, 'co-ruler owns army II')
  }

  let turns = 0
  while (state.phase !== 'gameover' && turns < maxTurns) {
    turns++
    const seatId = state.activeSeat
    runBotTurn(state, seatId)
    let inner = 0
    while ((state.pendingEventPlacement || state.pendingPrize) && state.phase !== 'gameover' && inner++ < 10) {
      if (state.pendingEventPlacement) {
        const t = validEventTarget(state)
        if (t === null) handleAction(state, state.activeSeat, { type: 'placeEventTarget', regionId: '__skip__' })
        else tryAction(state, seatId, { type: 'placeEventTarget', regionId: t })
      }
      if (state.pendingPrize) tryAction(state, state.pendingPrize.seatId, { type: 'choosePrize', optionIndex: 0 })
    }
  }
  console.log(`  turns: ${turns}, phase: ${state.phase}`)
  assert(state.phase === 'gameover', `${name}: reaches gameover`)
  if (state.phase === 'gameover') console.log(`  winner: ${state.seats[state.winner!].name} (${state.seats[state.winner!].vp} VP)`)
  for (const [rid, ctrl] of Object.entries(state.regionControl)) {
    if (ctrl) assert(state.kingdoms[ctrl].forts[rid] === ctrl, `${name}: control consistent @${rid}`)
  }
  return state
}

playGame('Basic 3P (no events, no tokens)', 3, { advanced: false, vpTarget: 10 }, 60)
playGame('Team 7P advanced', 7, { advanced: true, vpTarget: 12, eventFrequency: 'every' }, 150)
playGame('8P basic', 8, { advanced: false, vpTarget: 12 }, 450)

console.log(failures === 0 ? '✅ VARIANT CHECKS PASSED' : `❌ ${failures} checks failed`)
process.exit(failures === 0 ? 0 : 1)
