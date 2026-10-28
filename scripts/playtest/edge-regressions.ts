/**
 * Regression checks for the rules/state edge fixes. Run:
 *   npx tsx scripts/playtest/edge-regressions.ts
 */
import { createGame, handleAction, GameError } from '../../shared/engine'
import { PRIZE_CARDS, REGIONS } from '../../shared/data'
import type { GameState } from '../../shared/types'

let failures = 0
function check(cond: boolean, msg: string) {
  console.log(` ${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) failures++
}
function throws(fn: () => void, msg: string) {
  try {
    fn()
    check(false, `${msg} (did not throw)`)
  } catch (e) {
    check(e instanceof GameError, `${msg} (${e instanceof GameError ? e.message : (e as Error).message})`)
  }
}
function twoPlayer(cfg: Record<string, unknown> = {}): GameState {
  const s = createGame({ advanced: false, eventFrequency: 'off', ...cfg }, [
    { id: 's0', name: 'A' },
    { id: 's1', name: 'B' },
  ])
  for (const id of ['s0', 's1']) handleAction(s, id, { type: 'draft', personality: 'iron_raja', abilities: [] })
  return s
}

// F1: a pending prize is mandatory and cannot skip the next ruler's turn.
{
  const s = twoPlayer()
  s.phase = 'action'
  s.activeSeat = 's0'
  s.actionsLeft = 2
  s.seats.s0.coins = 15
  handleAction(s, 's0', { type: 'endTurn' })
  check(s.pendingPrize?.seatId === 's0', 'Magnate creates a pending prize')
  throws(() => handleAction(s, 's0', { type: 'moveArmy', armyId: 2, to: 'kuru' }), 'actions are blocked while a prize is pending')
  throws(() => handleAction(s, 's0', { type: 'endTurn' }), 'endTurn is blocked while a prize is pending')
  throws(() => handleAction(s, 's1', { type: 'choosePrize', optionIndex: 0 }), 'only the prize seat may choose')
  handleAction(s, 's0', { type: 'choosePrize', optionIndex: 0 })
  check(!s.pendingPrize && s.activeSeat === 's1', 'choosing a prize advances exactly one ruler')
}

// F12: NaN/fractional prize indexes are GameErrors, not TypeErrors.
{
  const s = twoPlayer()
  s.pendingPrize = { seatId: 's0', reason: 'test', queue: [], card: PRIZE_CARDS[0] }
  s.activeSeat = 's0'
  throws(() => handleAction(s, 's0', { type: 'choosePrize', optionIndex: NaN }), 'NaN prize index is rejected')
  throws(() => handleAction(s, 's0', { type: 'choosePrize', optionIndex: 1.5 }), 'fractional prize index is rejected')
}

// F10/F11: setup values are capped and the capital fort is part of the budget.
{
  const s = createGame({ advanced: false, eventFrequency: 'off', startResources: 10, resourceCap: 3, fortSupply: 3 }, [
    { id: 's0', name: 'A' },
    { id: 's1', name: 'B' },
  ])
  check(s.seats.s0.iron === 3 && s.seats.s0.wood === 3 && s.seats.s0.food === 3, 'start resources clamp to resourceCap')
  const k = s.kingdoms[s.seats.s0.kingdomId]
  const boardForts = Object.values(k.forts).filter((x) => x === k.id).length
  check(boardForts + k.fortSupply === 3, 'capital fort is included in fortSupply')
  check(createGameHiddenCount() <= 10, 'hidden token count is capped to the pool')
}
function createGameHiddenCount() {
  const s = createGame({ advanced: true, eventFrequency: 'off', hiddenTokens: 14 }, [
    { id: 's0', name: 'A' },
    { id: 's1', name: 'B' },
  ])
  return Object.values(s.regions).filter((r) => r.hiddenToken).length
}

// F14/F15: no actions after game over, and out-of-contract seat counts reject.
{
  const s = twoPlayer()
  s.phase = 'gameover'
  s.activeSeat = 's0'
  s.seats.s0.abilities = ['shipwright']
  s.seats.s0.abilityUsesLeft = { shipwright: 1 }
  throws(() => handleAction(s, 's0', { type: 'useAbility', ability: 'shipwright' }), 'abilities are blocked after game over')
  throws(
    () => createGame({}, Array.from({ length: 9 }, (_, i) => ({ id: `x${i}`, name: `X${i}` }))),
    'nine seats are rejected',
  )
}

// F3/F6: battle commitments require a live army in the battle region and at least one card.
{
  const s = twoPlayer()
  const a1 = s.armies.find((a) => a.ownerId === 's0' && a.armyId === 1)!
  const a2 = s.armies.find((a) => a.ownerId === 's0' && a.armyId === 2)!
  const d1 = s.armies.find((a) => a.ownerId === 's1' && a.armyId === 1)!
  const rid = 'kuru'
  a1.regionId = rid
  d1.regionId = rid
  a2.regionId = 'kashi'
  a2.cards = [{ id: 'probe-off-region', value: 5 }]
  s.regions[rid].armies = [
    { seatId: 's0', armyId: 1, armyRef: a1.id },
    { seatId: 's1', armyId: 1, armyRef: d1.id },
  ]
  s.pendingBattle = { id: 'probe-b', regionId: rid, attackerSeat: 's0', defenderSeat: 's1', commitments: {}, awaiting: ['s0', 's1'], phase: 'commit' }
  throws(() => handleAction(s, 's0', { type: 'battleCommit', cards: [] }), 'empty commitment is rejected when cards exist')
  throws(
    () => handleAction(s, 's0', { type: 'battleCommit', cards: [{ armyId: 2, cardId: a2.cards[0].id }] }),
    'an off-region army cannot commit',
  )
  check(a1.alive && a1.cards.length === 2, 'rejected commitments do not spend cards')
}


// F2: a failed garrison check must not delete the defender's fort or inflate supply.
{
  const s = twoPlayer()
  const rid = 'kuru'
  const atk = s.armies.find((a) => a.ownerId === 's0' && a.armyId === 1)!
  const def = s.armies.find((a) => a.ownerId === 's1' && a.armyId === 1)!
  atk.regionId = rid
  def.regionId = rid
  atk.cards = [{ id: 'f2-atk', value: 9 }]
  def.cards = [{ id: 'f2-def', value: 1 }]
  s.regions[rid].armies = [
    { seatId: 's0', armyId: 1, armyRef: atk.id },
    { seatId: 's1', armyId: 1, armyRef: def.id },
  ]
  s.regionControl[rid] = 'k1'
  s.kingdoms.k1.forts[rid] = 'k1'
  s.kingdoms.k0.fortSupply = 0
  s.pendingBattle = { id: 'f2-b', regionId: rid, attackerSeat: 's0', defenderSeat: 's1', commitments: {}, awaiting: ['s0', 's1'], phase: 'commit' }
  handleAction(s, 's0', { type: 'battleCommit', cards: [{ armyId: 1, cardId: 'f2-atk' }] })
  handleAction(s, 's1', { type: 'battleCommit', cards: [{ armyId: 1, cardId: 'f2-def' }] })
  check(s.regionControl[rid] === 'k1' && s.kingdoms.k1.forts[rid] === 'k1', 'a failed garrison keeps the defender fort/control')
  check(s.kingdoms.k0.fortSupply === 0, 'a failed garrison does not inflate the attacker supply')
}

// F4: rejected Mahajanapada payments are atomic and cannot use dead armies.
{
  const s = twoPlayer()
  const region = Object.values(REGIONS).find((r) => r.kind === 'mahajanapada' && r.value === 3)!
  const rid = region.id
  const army = s.armies.find((a) => a.ownerId === 's0' && a.armyId === 1)!
  army.cards = [1, 2, 3].map((n) => ({ id: `f4-${n}`, value: 1 }))
  army.regionId = rid
  s.regions[rid].armies = [{ seatId: 's0', armyId: 1, armyRef: army.id }]
  s.regionControl[rid] = null
  s.phase = 'action'
  s.activeSeat = 's0'
  s.actionsLeft = 1
  const beforeCards = army.cards.length
  const beforeDiscard = s.armyDiscard.length
  try {
    handleAction(s, 's0', {
      type: 'conquer',
      regionId: rid,
      payWithCards: [
        { armyId: 1, cardId: 'f4-1' },
        { armyId: 1, cardId: 'not-a-card' },
        { armyId: 1, cardId: 'f4-2' },
      ],
    })
    check(false, 'partial conquest payment is rejected')
  } catch (e) {
    check(e instanceof GameError, 'partial conquest payment is rejected')
  }
  check(army.cards.length === beforeCards && s.armyDiscard.length === beforeDiscard, 'rejected conquest payment leaves cards untouched')
}


// Multi-enemy region: winning one battle cannot transfer control while another enemy remains.
{
  const s = createGame({ advanced: false, eventFrequency: 'off' }, [
    { id: 's0', name: 'A' },
    { id: 's1', name: 'B' },
    { id: 's2', name: 'C' },
  ])
  for (const id of ['s0', 's1', 's2']) handleAction(s, id, { type: 'draft', personality: 'iron_raja', abilities: [] })
  const rid = 'kuru'
  const armies = ['s0', 's1', 's2'].map((id) => s.armies.find((a) => a.ownerId === id && a.armyId === 1)!)
  for (const [i, army] of armies.entries()) {
    army.regionId = rid
    army.cards = [{ id: `multi-${i}`, value: i === 0 ? 9 : 1 }]
  }
  s.regions[rid].armies = armies.map((a) => ({ seatId: a.ownerId, armyId: 1, armyRef: a.id }))
  s.regionControl[rid] = 'k1'
  s.kingdoms.k1.forts[rid] = 'k1'
  s.pendingBattle = { id: 'multi-b', regionId: rid, attackerSeat: 's0', defenderSeat: 's1', commitments: {}, awaiting: ['s0', 's1'], phase: 'commit' }
  handleAction(s, 's0', { type: 'battleCommit', cards: [{ armyId: 1, cardId: 'multi-0' }] })
  handleAction(s, 's1', { type: 'battleCommit', cards: [{ armyId: 1, cardId: 'multi-1' }] })
  check(s.regionControl[rid] === 'k1', 'a third hostile army prevents conquest transfer')
  check(s.seats.s0.vp === 1, 'the battle still awards its +1 VP')
}

// VP steal: the attacker cannot gain more VP than the victim actually loses.
{
  const s = twoPlayer()
  const rid = 'kuru'
  const atk = s.armies.find((a) => a.ownerId === 's0' && a.armyId === 1)!
  const def = s.armies.find((a) => a.ownerId === 's1' && a.armyId === 1)!
  atk.regionId = rid
  def.regionId = rid
  atk.cards = [{ id: 'vp-atk', value: 9 }]
  def.cards = [{ id: 'vp-def', value: 1 }]
  s.regions[rid].armies = [
    { seatId: 's0', armyId: 1, armyRef: atk.id },
    { seatId: 's1', armyId: 1, armyRef: def.id },
  ]
  s.regionControl[rid] = 'k1'
  s.kingdoms.k1.forts[rid] = 'k1'
  s.seats.s1.vp = 1
  s.pendingBattle = { id: 'vp-b', regionId: rid, attackerSeat: 's0', defenderSeat: 's1', commitments: {}, awaiting: ['s0', 's1'], phase: 'commit' }
  handleAction(s, 's0', { type: 'battleCommit', cards: [{ armyId: 1, cardId: 'vp-atk' }] })
  handleAction(s, 's1', { type: 'battleCommit', cards: [{ armyId: 1, cardId: 'vp-def' }] })
  check(s.seats.s1.vp === 0 && s.seats.s0.vp === 2, 'VP steal awards at most the victim loss (+ battle VP)')
}

console.log(failures === 0 ? '✅ EDGE REGRESSIONS PASSED' : `❌ ${failures} edge regressions failed`)
process.exit(failures === 0 ? 0 : 1)
