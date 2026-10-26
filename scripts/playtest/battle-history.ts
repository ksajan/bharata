/**
 * Battle-record regression: set up a legal 2P battle, commit both hands, and
 * verify the resolved battle is persisted with totals, cards and log linkage.
 */
import { createGame, handleAction, syncOccupation } from '../../shared/engine'
import { REGIONS } from '../../shared/data'
import type { GameState } from '../../shared/types'

const state: GameState = createGame(
  { seats: 2, advanced: false, vpTarget: 20 },
  [
    { id: 's0', name: 'Asoka' },
    { id: 's1', name: 'Chandra' },
  ],
)

for (const seatId of ['s0', 's1']) {
  handleAction(state, seatId, { type: 'draft', personality: 'iron_raja', abilities: [] })
}

const rid = 'kuru'
const region = REGIONS[rid]
if (!region) throw new Error('test region missing')

for (const seatId of ['s0', 's1']) {
  const army = state.armies.find((a) => a.ownerId === seatId && a.armyId === 1)!
  army.alive = true
  army.regionId = rid
  if (army.cards.length < 2) throw new Error('starting army needs cards')
}
state.regionControl[rid] = null
state.phase = 'action'
state.resourceCardDrawn = true
state.actionsLeft = 2
state.activeSeat = 's0'
state.activeSeatIdx = 0
syncOccupation(state)

handleAction(state, 's0', { type: 'battleInit', regionId: rid })

for (const seatId of ['s0', 's1']) {
  const army = state.armies.find((a) => a.ownerId === seatId && a.armyId === 1)!
  const cards = army.cards.slice(0, 2).map((c) => ({ armyId: army.armyId, cardId: c.id }))
  handleAction(state, seatId, { type: 'battleCommit', cards })
}

const record = state.battleHistory[0]
if (!record) throw new Error('battle record missing')
if (record.regionId !== rid) throw new Error('wrong battle region')
if (record.cards.length !== 4) throw new Error(`expected 4 committed cards, got ${record.cards.length}`)
if (record.attackerTotal <= 0 || record.defenderTotal <= 0) throw new Error('missing totals')
if (!state.seats[record.winnerSeat]) throw new Error('winner missing')
if (!state.log.some((line) => line.battleId === record.id)) throw new Error('log not linked to battle')

console.log(
  `✓ battle ${record.id} recorded at ${REGIONS[record.regionId].name}: ` +
    `${record.attackerTotal} vs ${record.defenderTotal} ` +
    `(${record.cards.length} cards, winner ${state.seats[record.winnerSeat].name})`,
)
