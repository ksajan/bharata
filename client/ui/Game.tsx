import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ABILITIES, EVENT_CARDS, PERSONALITIES, REGIONS } from '../../shared/data'
import type { AbilityId, ArmyId, GameState } from '../../shared/types'
import type { Transport } from '../transport'
import { Board } from './Board'
import { RulesGuide } from './RulesGuide'
import { Ico } from './icons'
import {
  BattleCommitModal,
  BattleRevealModal,
  DraftModal,
  EventModal,
  GameOverModal,
  PrizeModal,
  eventTargetsFor,
} from './Modals'

export function Game(props: {
  transport: Transport
  state: GameState
  mySeatId: string | null
  roomCode: string | null
  onLeave: () => void
}) {
  const { transport, state, mySeatId, roomCode, onLeave } = props
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [selectedArmy, setSelectedArmy] = useState<ArmyId | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [focusBoard, setFocusBoard] = useState(false)
  const [sell, setSell] = useState({ iron: 0, wood: 0, food: 0, trade: 0 })
  const [conquerRegion, setConquerRegion] = useState<string | null>(null)
  const [revealDismissed, setRevealDismissed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ackedSeat, setAckedSeat] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [turnToast, setTurnToast] = useState<string | null>(null)

  const me = mySeatId ? state.seats[mySeatId] : null
  const isMyTurn = !!me && state.activeSeat === mySeatId && (state.phase === 'resource' || state.phase === 'action')
  const hotseat = transport.mode === 'hotseat'

  const sellRate = me?.personality === 'merchant_prince' ? 1 : state.config.sellRate
  const sellTotal = sell.iron + sell.wood + sell.food
  const tradeAllowed = !!me && (me.personality === 'merchant_prince' || kingdomHarborCount(state, me.kingdomId) > 0)
  const sellGain = Math.floor(sellTotal / sellRate) + (tradeAllowed ? sell.trade * state.config.tradeValue : 0)

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 3200)
      return () => clearTimeout(t)
    }
  }, [error])

  useEffect(() => {
    if (!focusBoard) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusBoard(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusBoard])

  // during the draft the device is already with the drafting ruler — acknowledge them silently
  useEffect(() => {
    if (hotseat && state.phase === 'draft') setAckedSeat(mySeatId)
  }, [hotseat, state.phase, mySeatId])

  // an armed end-turn confirm should not survive a change of turn
  useEffect(() => {
    setConfirmEnd(false)
  }, [state.activeSeat, state.phase, state.actionsLeft])

  // online: announce whose court the table is waiting on
  const prevSeat = useRef(state.activeSeat)
  useEffect(() => {
    const prev = prevSeat.current
    prevSeat.current = state.activeSeat
    if (hotseat || prev === state.activeSeat || state.phase === 'draft' || state.phase === 'gameover') return
    const name = state.seats[state.activeSeat]?.name ?? 'A ruler'
    setTurnToast(state.activeSeat === mySeatId ? 'Your turn' : `${name}'s turn`)
    const t = setTimeout(() => setTurnToast(null), 2600)
    return () => clearTimeout(t)
  }, [state.activeSeat, state.phase, hotseat, mySeatId, state.seats])

  const send = async (action: Parameters<Transport['send']>[0]) => {
    try {
      await transport.send(action)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // end turn asks once when actions remain, so a stray click cannot forfeit them
  const requestEndTurn = () => {
    if (state.actionsLeft > 0 && !confirmEnd) {
      setConfirmEnd(true)
      return
    }
    setConfirmEnd(false)
    send({ type: 'endTurn' })
  }

  // ----- derived gameplay sets -----
  const myArmies = useMemo(
    () => (mySeatId ? state.armies.filter((a) => a.ownerId === mySeatId && a.alive) : []),
    [state, mySeatId],
  )
  const selectedArmyObj = myArmies.find((a) => a.armyId === selectedArmy)
  const moveTargets = useMemo(() => {
    const out = new Set<string>()
    if (!isMyTurn || state.phase !== 'action' || state.actionsLeft <= 0 || !selectedArmyObj) return out
    for (const n of REGIONS[selectedArmyObj.regionId!].neighbors) out.add(n)
    return out
  }, [isMyTurn, state, selectedArmyObj])

  const evtActive = !!state.pendingEventPlacement && state.phase === 'event'
  const evtTargets = useMemo(
    () => (evtActive && mySeatId ? eventTargetsFor(state, mySeatId) : new Set<string>()),
    [evtActive, state, mySeatId],
  )

  const afflictedRegions = useMemo(() => {
    if (!me) return []
    const k = state.kingdoms[me.kingdomId]
    return Object.entries(k.forts)
      .filter(([rid, kid]) => kid === k.id && (state.regions[rid]?.eventTokens.length ?? 0) > 0)
      .map(([rid]) => rid)
  }, [state, me])

  // ----- region interaction -----
  const onRegion = (rid: string) => {
    if (evtActive && state.activeSeat === mySeatId && evtTargets.has(rid)) {
      send({ type: 'placeEventTarget', regionId: rid })
      return
    }
    if (selectedArmyObj && moveTargets.has(rid)) {
      send({ type: 'moveArmy', armyId: selectedArmyObj.armyId, to: rid })
      setSelectedArmy(null)
      setSelectedRegion(rid) // show the destination's orders (Conquer/Attack) immediately
      return
    }
    setSelectedRegion(rid)
  }

  // ----- legality helpers for context buttons -----
  const selected = selectedRegion ? REGIONS[selectedRegion] : null
  const selectedBState = selectedRegion ? state.regions[selectedRegion] : null
  const selectedEventNames = (selectedBState?.eventTokens ?? [])
    .map((t) => Object.values(EVENT_CARDS).find((c) => c.kind === t.kind)?.name)
    .filter((n): n is string => !!n)
  const myArmyInSelected = selectedRegion
    ? myArmies.filter((a) => a.regionId === selectedRegion && a.alive)
    : []
  const enemyInSelected = selectedRegion
    ? (selectedBState?.armies ?? []).filter((a) => a.seatId !== mySeatId && state.seats[a.seatId]?.kingdomId !== me?.kingdomId)
    : []
  const selRuler = selectedRegion ? state.regionControl[selectedRegion] : null
  const canConquer =
    isMyTurn &&
    state.phase === 'action' &&
    state.actionsLeft > 0 &&
    !!selectedRegion &&
    myArmyInSelected.length > 0 &&
    selRuler !== me?.kingdomId &&
    enemyInSelected.length === 0
  const canAttack = isMyTurn && state.phase === 'action' && myArmyInSelected.length > 0 && enemyInSelected.length > 0
  const canReveal =
    isMyTurn && state.config.advanced && !!selectedBState?.hiddenToken && myArmyInSelected.length > 0
  const canRemoveEvent =
    isMyTurn &&
    state.phase === 'action' &&
    !!selectedRegion &&
    selRuler === me?.kingdomId &&
    (selectedBState?.eventTokens.length ?? 0) > 0

  const doConquer = (rid: string) => {
    const region = REGIONS[rid]
    if (region.kind === 'province') {
      send({ type: 'conquer', regionId: rid })
    } else {
      setConquerRegion(rid)
    }
  }

  // ----- battle reveal key (stable per battle — no logSeq!) -----
  const revealKey = state.lastBattle?.resolved ? state.lastBattle.id : null
  const showReveal = !!state.lastBattle?.resolved && revealKey !== revealDismissed

  const phaseStep = state.phase === 'resource' ? 0 : state.phase === 'action' ? 1 : state.phase === 'event' ? 2 : -1
  const activeSeat = state.seats[state.activeSeat]
  const activeKingdom = activeSeat ? state.kingdoms[activeSeat.kingdomId] : null
  const bannerText =
    state.phase === 'draft'
      ? 'Setup — rulers choose their personas…'
      : state.phase === 'gameover'
        ? 'The age is decided'
        : state.pendingPrize
          ? `${state.seats[state.pendingPrize.seatId]?.name ?? 'A ruler'} chooses a prize`
          : state.phase === 'resource'
            ? `${activeSeat?.name} holds court — draw & trade`
            : state.phase === 'event'
              ? `${activeSeat?.name} must place the omen`
              : `Turn — ${activeSeat?.name} of ${activeKingdom?.name} (${state.actionsLeft} action${state.actionsLeft === 1 ? '' : 's'} left)`
  const needsHandoff = hotseat && !!mySeatId && ackedSeat !== mySeatId

  // exactly one recommended action for the current state — the coach strip
  const nextStep: { text: string; action?: { label: string; run: () => void } } | null = (() => {
    if (state.phase === 'gameover') return null
    if (state.phase === 'draft') return { text: 'Choose your ruler’s persona to begin the age.' }
    if (state.pendingBattle || state.pendingPrize) return null
    if (!me) return { text: 'Watching the court — pick a side.' }
    if (!isMyTurn) return { text: `Waiting for ${state.seats[state.activeSeat]?.name ?? 'the active ruler'}.` }
    if (state.phase === 'resource' && !state.resourceCardDrawn) {
      return { text: 'Draw the land’s bounty — every ruler gains it.', action: { label: 'Draw resource', run: () => send({ type: 'drawResource' }) } }
    }
    if (state.phase === 'resource') {
      return { text: 'Sell surplus, recruit a card, then move to actions.', action: { label: 'To actions →', run: () => send({ type: 'endResource' }) } }
    }
    if (state.phase === 'event') return { text: 'Place the omen in a legal region — or skip if none is valid.' }
    if (state.phase === 'action') {
      if (state.actionsLeft <= 0) return { text: 'No actions left — close out the turn.', action: { label: 'End turn →', run: requestEndTurn } }
      if (!selectedArmyObj) return { text: 'Select an army below, then click a dashed neighbour to march.' }
      return { text: 'Click a dashed neighbouring region to march, or inspect a region for orders.' }
    }
    return null
  })()

  return (
    <div className={`game ${focusBoard ? 'focus-board' : ''}`}>
      {/* ---------- top bar ---------- */}
      <div className="topbar">
        <div className="logo">भारत · BHARATA</div>
        {roomCode && <div className="pill">Room {roomCode}</div>}
        <div className="pill">{state.round === 0 ? 'Setup' : `Round ${state.round}`}</div>
        <div className="phase-steps">
          {['Resource', 'Actions', 'Events'].map((p, i) => (
            <div key={p} className={`phase-step ${phaseStep === i ? 'on' : ''}`}>
              {p}
            </div>
          ))}
        </div>
        <div className="turn-banner">{bannerText}</div>
        <div className="pill vp-target">First to {state.config.vpTarget} VP</div>
        <button className="small ghost" onClick={() => setShowHelp(true)}>
          Rules
        </button>
        <button
          className="small ghost"
          onClick={() => {
            if (hotseat && state.phase !== 'gameover') {
              if (!window.confirm('Abandon the age? The game will be lost for all rulers.')) return
            }
            onLeave()
          }}
        >
          {hotseat ? 'Menu' : 'Lobby'}
        </button>
      </div>

      {turnToast && <div className="turn-toast" role="status">{turnToast}</div>}

      <div className="game-main">
        {/* ---------- board ---------- */}
        <div className="board-pane">
          {nextStep && (
            <div className="next-step" role="status">
              <span className="ns-kicker">Next</span>
              <span className="ns-text">{nextStep.text}</span>
              {nextStep.action && (
                <button className="small primary" onClick={nextStep.action.run}>
                  {nextStep.action.label}
                </button>
              )}
            </div>
          )}
          {isMyTurn && afflictedRegions.length > 0 && state.phase === 'action' && (
            <div className="pill" style={{ margin: '8px 12px -2px', alignSelf: 'flex-start', borderColor: '#b03a2e', color: '#ffb0a0' }}>
              🔥 {afflictedRegions
                .map((r) => {
                  const kind = state.regions[r]?.eventTokens[0]?.kind
                  const card = Object.values(EVENT_CARDS).find((c) => c.kind === kind)
                  const rem = card?.removal
                  const cost = rem
                    ? [
                        rem.coins ? `${rem.coins} coins` : '',
                        rem.wood ? `${rem.wood} wood` : '',
                        rem.food ? `${rem.food} food` : '',
                      ]
                        .filter(Boolean)
                        .join(' + ') || 'resources'
                    : 'resources'
                  return `${card?.name ?? 'Disaster'} afflicts ${REGIONS[r].name} — clear it (1⚡ + ${cost})`
                })
                .join(' · ')}{' '}
              — no other action is possible until then.
            </div>
          )}
          {state.pendingBattle && state.phase !== 'draft' && (
            <div className="pill" style={{ margin: '8px 12px -2px', alignSelf: 'flex-start', borderColor: '#c99b3f' }}>
              ⚔ Battle of {REGIONS[state.pendingBattle.regionId].name} — awaiting{' '}
              {state.pendingBattle.awaiting.map((s) => state.seats[s]?.name).join(', ') || '…'}
            </div>
          )}
          <div className="board-scroll">
            <Board
              state={state}
              selectedRegion={selectedRegion}
              moveTargets={moveTargets}
              evtTargets={evtTargets}
              onRegion={onRegion}
              focusMode={focusBoard}
              onToggleFocus={() => setFocusBoard((f) => !f)}
            />
          </div>
        </div>

        {/* ---------- sidebar ---------- */}
        <div className="sidebar">
          <details className="legend-strip">
            <summary>Legend — what every icon means</summary>
            <div>
              {[
                ['🪙', 'coins'], ['⛏', 'iron'], ['🪵', 'wood'], ['🌾', 'food'],
                ['🧵', 'trade goods'], ['🌿', 'medicine'], ['⚔', 'battles won'], ['⚡', 'actions'],
              ].map(([i, l]) => (
                <span key={l} style={{ whiteSpace: 'nowrap', marginRight: 10 }}>
                  {i} {l}
                </span>
              ))}
              <br />
              {[
                ['🔢', 'value (= VP = cost = terrain bonus, max +3)'],
                ['⭐', 'capital'], ['🚩', 'fort'], ['❓', 'hidden token'], ['⚓', 'harbor'], ['⭕', 'red discs = disasters'],
              ].map(([i, l]) => (
                <span key={l} style={{ whiteSpace: 'nowrap', marginRight: 10 }}>
                  {i} {l}
                </span>
              ))}
            </div>
          </details>
          <div className="players-list">
            {Object.values(state.seats).map((s) => {
              const k = state.kingdoms[s.kingdomId]
              const forts = Object.values(k.forts).filter((x) => x === k.id).length
              return (
                <div key={s.id} className={`player-card ${s.id === state.activeSeat ? 'active' : ''}`}>
                  <div className="row1">
                    <span className="pc-dot" style={{ background: s.color }} />
                    {s.name}
                    {!s.connected && <span style={{ fontSize: 11, color: '#b03a2e' }}>⌁</span>}
                    <span style={{ marginLeft: 'auto', fontFamily: 'Rozha One, serif', fontWeight: 400 }}>
                      {s.vp}
                      <span style={{ fontSize: 11, color: '#95876a' }}>/{state.config.vpTarget}</span>
                    </span>
                  </div>
                  <div className="kingdom">
                    Kingdom of {k.name} · {forts} fort{forts === 1 ? '' : 's'} · capital {REGIONS[k.capital].name}
                  </div>
                  <div className="vp-bar">
                    <div style={{ width: `${Math.min(100, (s.vp / state.config.vpTarget) * 100)}%` }} />
                  </div>
                  <div className="pc-stats">
                    <span><Ico kind="coin" title="coins"/> <b>{s.coins}</b></span>
                    <span><Ico kind="iron" title="iron"/> <b>{s.iron}</b></span>
                    <span><Ico kind="wood" title="wood"/> <b>{s.wood}</b></span>
                    <span><Ico kind="food" title="food"/> <b>{s.food}</b></span>
                    <span><Ico kind="trade" title="trade goods"/> <b>{s.trade}</b></span>
                    {state.config.advanced && <span><Ico kind="medicine" title="medicine"/> <b>{s.medicine}</b></span>}
                    <span><Ico kind="sword" title="battles won"/> <b>{s.winsBattles}</b></span>
                  </div>
                  <div className="pc-armies">
                    {state.armies
                      .filter((a) => a.ownerId === s.id)
                      .map((a) => (
                        <span key={a.id}>
                          Army {a.armyId === 1 ? 'I' : 'II'}:{' '}
                          {a.alive ? `${a.cards.reduce((t, c) => t + c.value, 0)} @ ${a.regionId ? REGIONS[a.regionId].name : '?'}` : 'destroyed'}
                        </span>
                      ))}
                  </div>
                  {s.personality && (
                    <div className="pc-traits">
                      {PERSONALITIES[s.personality].name}
                      {s.abilities.length > 0 && ' · ' + s.abilities.map((ab) => `${ABILITIES[ab].name} (${s.abilityUsesLeft[ab] ?? 0})`).join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="log-pane">
            <h3>Chronicle</h3>
            <div className="log-feed">
              {[...state.log].reverse().map((l) => (
                <div key={l.id} className={`log-entry ${l.kind ?? ''}`}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- bottom controls ---------- */}
      <div className="controls">
        {/* phase column */}
        <div className="col main">
          <h4>{state.phase === 'resource' ? 'Resource Phase' : state.phase === 'action' ? 'Action Phase' : state.phase === 'draft' ? 'Drafting' : 'Events'}</h4>
          {state.phase === 'draft' && <div className="hint">Each ruler is choosing their personality and abilities…</div>}

          {state.phase === 'resource' && (
            <>
              {isMyTurn ? (
                <>
                  {!state.resourceCardDrawn ? (
                    <div className="actions-row">
                      <button className="primary" onClick={() => send({ type: 'drawResource' })}>
                        Step 1 — Draw Resource Card
                      </button>
                      <span className="hint">Every ruler gains its bounty — then your court trades.</span>
                    </div>
                  ) : (
                    <>
                      <div className="actions-row">
                        <span className="hint" style={{ width: '100%' }}>
                          Step 2 — choose what to sell (free & repeatable; unspent goods carry over) · Step 3 —
                          recruit & press <b>To Actions</b>.
                        </span>
                        {(['iron', 'wood', 'food'] as const).map((r) => (
                          <span key={r} className="pill" style={{ padding: '2px 8px' }}>
                            <Ico kind={r} title={r}/> {me![r]} −
                            <button className="small ghost" style={{ padding: '0 5px' }} onClick={() => setSell((s) => ({ ...s, [r]: Math.max(0, s[r] - 1) }))}>
                              −
                            </button>
                            <b style={{ margin: '0 4px' }}>{sell[r]}</b>
                            <button className="small ghost" style={{ padding: '0 5px' }} onClick={() => setSell((s) => ({ ...s, [r]: Math.min(me![r], s[r] + 1) }))}>
                              +
                            </button>
                          </span>
                        ))}
                        <span className="pill" style={{ padding: '2px 8px' }} title="Trade objects sell for coins if you rule an export harbor (anchor on the map)">
                          <Ico kind="trade" title="trade goods"/> {me!.trade} −
                          <button className="small ghost" style={{ padding: '0 5px' }} onClick={() => setSell((s) => ({ ...s, trade: Math.max(0, s.trade - 1) }))}>
                            −
                          </button>
                          <b style={{ margin: '0 4px' }}>{sell.trade}</b>
                          <button className="small ghost" style={{ padding: '0 5px' }} onClick={() => setSell((s) => ({ ...s, trade: Math.min(me!.trade, s.trade + 1) }))}>
                            +
                          </button>
                        </span>
                        <button
                          className="ghost"
                          disabled={sellTotal === 0 && sell.trade === 0}
                          onClick={() => {
                            send({
                              type: 'sellResources',
                              resources: { iron: sell.iron, wood: sell.wood, food: sell.food },
                              trade: sell.trade,
                            })
                            setSell({ iron: 0, wood: 0, food: 0, trade: 0 })
                          }}
                        >
                          {sellGain > 0 ? <>Sell → +{sellGain} <Ico kind="coin" title="coins"/></> : 'Sell'}
                        </button>
                        <span className="hint">
                          {me!.personality === 'merchant_prince'
                            ? 'Merchant Prince: 1 resource = 1 coin; trade sells anywhere.'
                            : `${state.config.sellRate} resources = 1 coin · trade = ${state.config.tradeValue} 🪙 each (needs ⚓ harbor)`}
                        </span>
                      </div>
                      <div className="actions-row">
                        {me!.armiesOwned.map((aid) => (
                          <span key={aid} className="actions-row">
                            <button
                              className="ghost"
                              title={me!.coins < state.config.armyCardCost ? `Need ${state.config.armyCardCost} coins — you have ${me!.coins}` : 'Army cards are that hand\'s battle strength. Reinforcing a destroyed army re-awakens it at your capital.'}
                              disabled={me!.coins < state.config.armyCardCost}
                              onClick={() => send({ type: 'buyArmyCard', armyId: aid })}
                            >
                              Reinforce Army {aid === 1 ? 'I' : 'II'} — +1 card · {state.config.armyCardCost} <Ico kind="coin" title="coins"/>
                            </button>
                            <button
                              className="ghost"
                              title={me!.iron < 2 ? `Need 2 iron — you have ${me!.iron}` : me!.coins < 1 ? 'Need 1 coin' : 'Bend iron into weapons: 2 iron + 1 coin for one army card'}
                              disabled={me!.iron < 2 || me!.coins < 1}
                              onClick={() => send({ type: 'buyArmyCard', armyId: aid, forge: true })}
                            >
                              Forge Army {aid === 1 ? 'I' : 'II'} · 2 iron + 1 <Ico kind="coin" title="coins"/>
                            </button>
                          </span>
                        ))}
                        <button className="primary" onClick={() => send({ type: 'endResource' })}>
                          To Actions →
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="hint">
                  {state.seats[state.activeSeat]?.name} manages their court…
                  {state.lastResourceCard && (
                    <span style={{ marginLeft: 8 }}>
                      Drawn by {state.seats[state.activeSeat]?.name}: <b>{state.lastResourceCard.title}</b> —{' '}
                      {state.lastResourceCard.text}
                    </span>
                  )}
                </div>
              )}
              {state.lastResourceCard && (
                <div className="resource-card" style={{ marginTop: 8 }} title="Drawn this turn — its gains applied to every ruler">
                  <h5>{state.lastResourceCard.title}</h5>
                  {state.lastResourceCard.text}
                </div>
              )}
            </>
          )}

          {state.phase === 'action' &&
            (isMyTurn ? (
              <>
                <div className="actions-row">
                  <span className="pill">⚡ {state.actionsLeft} action{state.actionsLeft === 1 ? '' : 's'} left</span>
                  {transport.canUndo(state) && (
                    <button className="ghost small" title="Take back your last march" onClick={() => send({ type: 'undoMove' })}>
                      ↺ Undo march
                    </button>
                  )}
                  <button
                    className="ghost small"
                    disabled={me!.coins < state.config.extraActionCost}
                    title={me!.coins < state.config.extraActionCost ? `Need ${state.config.extraActionCost} coin — you have ${me!.coins}` : 'Buy one more action this turn'}
                    onClick={() => send({ type: 'buyExtraAction' })}
                  >
                    + Buy action · {state.config.extraActionCost} <Ico kind="coin" title="coins"/>
                  </button>
                  {me!.abilities
                    .filter((ab) => ab !== 'strategist' && ab !== 'seer')
                    .map((ab) => (
                      <button
                        key={ab}
                        className="ghost small"
                        disabled={(me!.abilityUsesLeft[ab] ?? 0) <= 0}
                        title={(me!.abilityUsesLeft[ab] ?? 0) <= 0 ? 'No uses left this game' : ABILITIES[ab].desc}
                        onClick={() => {
                          if (ab === 'river_sage') {
                            const withEvents = Object.entries(state.regions)
                              .filter(([, bs]) => bs.eventTokens.length > 0)
                              .map(([rid]) => rid)
                            const rid = window.prompt(`Remove an event from which region? ${withEvents.map((r) => REGIONS[r].name).join(', ')}`)
                            if (rid) {
                              const match = withEvents.find((x) => REGIONS[x].name.toLowerCase() === rid.trim().toLowerCase()) ?? withEvents.find((x) => x === rid.trim())
                              if (match) send({ type: 'useAbility', ability: 'river_sage', payload: { regionId: match } })
                              else setError('No event there')
                            }
                          } else {
                            send({ type: 'useAbility', ability: ab })
                          }
                        }}
                      >
                        {ABILITIES[ab].name} ({me!.abilityUsesLeft[ab] ?? 0})
                      </button>
                    ))}
                  <button className="primary" onClick={requestEndTurn}>
                    {confirmEnd ? 'End with actions left?' : 'End Turn →'}
                  </button>
                  {confirmEnd && (
                    <button className="ghost small" onClick={() => setConfirmEnd(false)}>
                      Keep playing
                    </button>
                  )}
                </div>
                <div className="hint">
                  Select an army below, then click a neighboring region to march. Click any region for details & orders.
                  {selectedArmyObj && selectedArmyObj.regionId && (
                    <b style={{ color: '#ffe9b8' }}> Army {selectedArmyObj.armyId === 1 ? 'I' : 'II'} marches from {REGIONS[selectedArmyObj.regionId].name} — pick a neighbor.</b>
                  )}
                </div>
              </>
            ) : (
              <div className="hint">{state.seats[state.activeSeat]?.name} commands their armies…</div>
            ))}

          {state.phase === 'event' && !state.pendingPrize && <div className="hint">The omen must be placed…</div>}
          {state.phase === 'gameover' && <div className="hint">The chronicle is complete.</div>}
        </div>

        {/* armies column */}
        {state.phase === 'action' && isMyTurn && (
          <div className="col">
            <h4>Your Armies</h4>
                  <div className="army-strip">
                    {me!.armiesOwned.map((aid) => {
                      const army = myArmies.find((a) => a.armyId === aid)
                      if (!army) return null
                      return (
                        <div
                          key={aid}
                          className={`army-box ${selectedArmy === aid ? 'selected' : ''}`}
                          onClick={() => army.alive && setSelectedArmy(selectedArmy === aid ? null : aid)}
                          title="Each army is a separate battle hand. Select one, then click a highlighted region to march."
                        >
                          <div>
                            Army {aid === 1 ? 'I' : 'II'} {selectedArmy === aid ? '◀ marching' : ''}{' '}
                            {!army.alive && <span style={{ color: '#b03a2e' }}>☠</span>}
                          </div>
                          <div style={{ fontSize: 12 }}>
                            {army.alive
                              ? REGIONS[army.regionId!].name
                              : 'retake your capital'}{' '}
                            · power {army.cards.reduce((t, c) => t + c.value, 0)} ({army.cards.length} cards)
                          </div>
                          {army.alive && army.cards.length === 0 && (
                            <div style={{ fontSize: 11, color: '#b3a480' }}>
                              No cards yet — reinforce it ({state.config.armyCardCost} coins) so it can fight
                            </div>
                          )}
                          <div className="army-chips">
                            {army.cards.map((c) => (
                              <span key={c.id} className="army-chip">
                                {c.value}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
          </div>
        )}

        {/* region inspector */}
        <div className="col region">
          <h4>Region</h4>
          {selected ? (
            <>
              <div className="region-title">
                {selected.name}
                <span className="region-kind">{selected.kind === 'province' ? 'Province' : 'Great Kingdom'}</span>
                <span className="region-value" title="Value = VP = conquer cost = terrain bonus">
                  ★ {selected.value}
                </span>
              </div>
              <div className="region-meta">
                {selRuler ? (
                  <span style={{ color: state.kingdoms[selRuler]?.color }}>
                    ⚑ {state.kingdoms[selRuler]?.name} ({Object.values(state.seats).find((s) => s.kingdomId === selRuler)?.name})
                  </span>
                ) : (
                  <span>unclaimed</span>
                )}
                {(selectedBState?.armies.length ?? 0) > 0 && (
                  <span>
                    ⚔ {selectedBState!.armies.map((a) => `${state.seats[a.seatId]?.name} ${a.armyId === 1 ? 'I' : 'II'}`).join(', ')}
                  </span>
                )}
                {(selectedBState?.eventTokens.length ?? 0) > 0 && (
                  <span className="region-danger">⭕ {selectedEventNames.join(', ')}</span>
                )}
                {selectedBState?.hiddenToken && <span className="region-gold">❓ hidden token</span>}
              </div>
              <div className="actions-row region-actions">
                {canConquer && (
                  <button className="primary small" onClick={() => doConquer(selectedRegion!)}>
                    🏳 Conquer ({selected.kind === 'province' ? `${selected.value - (me!.personality === 'master_mason' ? 1 : 0)}🪙` : `${selected.value} cards`})
                  </button>
                )}
                {canAttack && state.actionsLeft > 0 && (
                  <button className="primary small" onClick={() => send({ type: 'battleInit', regionId: selectedRegion! })}>
                    ⚔ Attack
                  </button>
                )}
                {canReveal && (
                  <button className="ghost small" onClick={() => send({ type: 'revealHidden', regionId: selectedRegion! })}>
                    🔍 Search token
                  </button>
                )}
                {canRemoveEvent && (
                  <>
                    <button
                      className="ghost small"
                      onClick={() => send({ type: 'removeEvent', regionId: selectedRegion! })}
                      title="Costs 1 action plus the resources shown on the event"
                    >
                      🛠 Remove event
                    </button>
                    <button
                      className="ghost small"
                      title="Coin alternative: 3 coins per missing resource, minimum 3 coins"
                      onClick={() => send({ type: 'removeEvent', regionId: selectedRegion!, useCoins: true })}
                    >
                      Clear with coins
                    </button>
                    {me!.medicine > 0 && (
                      <button className="ghost small" onClick={() => send({ type: 'removeEvent', regionId: selectedRegion!, useMedicine: true })}>
                        🌿 Cure
                      </button>
                    )}
                  </>
                )}
              </div>
              <details className="region-more">
                <summary>Details & costs</summary>
                <div className="region-body">
                  <div>
                    Value {selected.value} = its VP = conquer cost = defender's terrain bonus (max +3).
                  </div>
                  <div>
                    Yields:{' '}
                    {Object.entries(selected.yields).filter(([, n]) => n).map(([r, n]) => `+${n} ${r}`).join(', ') || 'none'}
                    {selected.trade ? ` · +${selected.trade} trade` : ''}
                    {selected.harbor ? ' · ⚓ export harbor' : ''}
                    {selected.river ? ' · river' : ''}
                    {selected.arid ? ' · arid' : ''}
                  </div>
                  {selected.isCapitalOf && <div>Capital of {selected.isCapitalOf}.</div>}
                  {selectedBState?.hiddenToken && <div>❓ Hidden token — march an army in and search it.</div>}
                  <div>Ruled by {selRuler ? state.kingdoms[selRuler]?.name : 'no one'}.</div>
                </div>
              </details>
            </>
          ) : (
            <div className="hint">Pick a region to see its value, owner and orders.</div>
          )}
        </div>
      </div>

      {/* ---------- modals ---------- */}
      {needsHandoff && (
        <div className="modal-backdrop">
          <div className="modal" style={{ textAlign: 'center', width: 420 }}>
            <h2>🛕 Pass the device</h2>
            <div className="sub" style={{ fontSize: 17 }}>
              Hand the screen to <b>{mySeatId ? state.seats[mySeatId]?.name : ''}</b>
              {state.pendingBattle ? ' — a battle awaits their order.' : state.pendingPrize ? ' — a prize awaits their choice.' : '.'}
            </div>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <button className="primary" onClick={() => setAckedSeat(mySeatId)}>
                I am {mySeatId ? state.seats[mySeatId]?.name : ''}
              </button>
            </div>
          </div>
        </div>
      )}
      {state.phase === 'draft' && mySeatId && !state.seats[mySeatId].personality && (
        <DraftModal
          key={mySeatId}
          state={state}
          seatId={mySeatId}
          onSubmit={(p, ab) => send({ type: 'draft', personality: p, abilities: ab })}
        />
      )}
      {state.pendingBattle && state.phase !== 'gameover' && mySeatId && state.pendingBattle.awaiting.includes(mySeatId) && (
        <BattleCommitModal
          state={state}
          mySeatId={mySeatId}
          onCommit={(cards, useStrategist) => send({ type: 'battleCommit', cards, useStrategist })}
        />
      )}
      {showReveal && state.phase !== 'gameover' && (
        <BattleRevealModal state={state} onDismiss={() => setRevealDismissed(revealKey)} />
      )}
      {evtActive && <EventModal state={state} mySeatId={mySeatId ?? ''} onTarget={(rid) => send({ type: 'placeEventTarget', regionId: rid })} onSeer={() => send({ type: 'useAbility', ability: 'seer' })} />}
      {state.pendingPrize && (
        <PrizeModal state={state} onChoose={(i) => send({ type: 'choosePrize', optionIndex: i })} />
      )}
      {state.phase === 'gameover' && (
        <GameOverModal
          state={state}
          onAgain={() => {
            if (hotseat) onLeave()
            else transport.reset().catch(() => {})
          }}
          onLeave={onLeave}
        />
      )}
      {showHelp && <RulesGuide onClose={() => setShowHelp(false)} />}
      {conquerRegion && (
        <ConquerCardPicker
          state={state}
          regionId={conquerRegion}
          mySeatId={mySeatId!}
          onCancel={() => setConquerRegion(null)}
          onConfirm={(cards) => {
            send({ type: 'conquer', regionId: conquerRegion, payWithCards: cards })
            setConquerRegion(null)
          }}
        />
      )}
      {error && <div className="toast">{error}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mahajanapada conquest — pick N army cards as payment
// ---------------------------------------------------------------------------

function ConquerCardPicker(props: {
  state: GameState
  regionId: string
  mySeatId: string
  onCancel: () => void
  onConfirm: (cards: { armyId: ArmyId; cardId: string }[]) => void
}) {
  const region = REGIONS[props.regionId]
  const [picked, setPicked] = useState<string[]>([])
  const armies = props.state.armies.filter((a) => a.ownerId === props.mySeatId && a.alive)
  const toggle = (armyId: ArmyId, cardId: string) => {
    setPicked((cur) => (cur.includes(cardId) ? cur.filter((x) => x !== cardId) : [...cur, cardId]))
  }
  const build = () => {
    const out: { armyId: ArmyId; cardId: string }[] = []
    for (const a of armies) {
      for (const c of a.cards) if (picked.includes(c.id)) out.push({ armyId: a.armyId, cardId: c.id })
    }
    return out
  }
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>🏳 Conquer {region.name}</h2>
        <div className="sub">
          A Mahajanapada of value {region.value} — pay exactly {region.value} army cards. They are spent from your
          armies (armies left with no cards disband!).
        </div>
        {armies.map((army) => (
          <div key={army.id}>
            <div style={{ fontWeight: 700 }}>Army {army.armyId === 1 ? 'I' : 'II'}</div>
            <div className="battle-cards">
              {army.cards.map((c) => (
                <div key={c.id} className={`bcard ${picked.includes(c.id) ? 'picked' : ''}`} onClick={() => toggle(army.armyId, c.id)}>
                  {c.value}
                  <small>pay</small>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          Selected <b>{picked.length}</b> / {region.value}
        </div>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="ghost" onClick={props.onCancel}>
            Not yet
          </button>
          <button className="primary" disabled={picked.length !== region.value} onClick={() => props.onConfirm(build())}>
            Pay & Conquer
          </button>
        </div>
      </div>
    </div>
  )
}

const SELL_ICON: Record<string, string> = { iron: '⛏', wood: '🪵', food: '🌾' }

function kingdomHarborCount(state: GameState, kingdomId: string): number {
  return Object.keys(state.kingdoms[kingdomId]?.forts ?? {}).filter((rid) => REGIONS[rid]?.harbor).length
}
