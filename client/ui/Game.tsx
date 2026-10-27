import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ABILITIES, EVENT_CARDS, PERSONALITIES, REGIONS } from '../../shared/data'
import type { AbilityId, ArmyId, GameState } from '../../shared/types'
import type { Transport } from '../transport'
import { Board } from './Board'
import { RulesGuide } from './RulesGuideLazy'
import { Ico } from './icons'
import { KingdomCrest, VpTrack } from './art'
import { HistoryModal } from './History'
import { diffStates, type GameFx } from './fx'
import {
  BattleCommitModal,
  BattleRevealModal,
  DraftModal,
  EventModal,
  GameOverModal,
  PrizeModal,
  ResourceRevealModal,
  eventTargetsFor,
} from './Modals'

const EMOTES = ['👋', '👍', '🔥', '😮', '😅', '🙏', '⚔️', '👑']

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
  const [showRulers, setShowRulers] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showEmotes, setShowEmotes] = useState(false)
  const [emotes, setEmotes] = useState<{ id: string; seatId: string; name: string; emote: string }[]>([])
  const [sell, setSell] = useState({ iron: 0, wood: 0, food: 0, trade: 0 })
  const [conquerRegion, setConquerRegion] = useState<string | null>(null)
  const [revealDismissed, setRevealDismissed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ackedSeat, setAckedSeat] = useState<string | null>(null)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [turnToast, setTurnToast] = useState<string | null>(null)
  const [seenCard, setSeenCard] = useState<string | null>(null)
  const [fx, setFx] = useState<GameFx | null>(null)
  const prevStateRef = useRef<GameState | null>(null)
  const [logOpen, setLogOpen] = useState(true)
  const [logFilter, setLogFilter] = useState<'all' | 'battle' | 'event'>('all')
  const [unread, setUnread] = useState(0)

  const me = mySeatId ? state.seats[mySeatId] : null
  const isMyTurn = !!me && state.activeSeat === mySeatId && (state.phase === 'resource' || state.phase === 'action')
  const hotseat = transport.mode === 'hotseat'

  const sellRate = me?.personality === 'merchant_prince' ? 1 : state.config.sellRate
  const sellTotal = sell.iron + sell.wood + sell.food
  const tradeAllowed = !!me && (me.personality === 'merchant_prince' || kingdomHarborCount(state, me.kingdomId) > 0)
  const sellPairsValid = sellTotal === 0 || sellTotal % sellRate === 0
  const sellGain = Math.floor(sellTotal / sellRate) + (tradeAllowed ? sell.trade * state.config.tradeValue : 0)
  const spare = { iron: me?.iron ?? 0, wood: me?.wood ?? 0, food: me?.food ?? 0, trade: tradeAllowed ? (me?.trade ?? 0) : 0 }
  // the engine sells whole groups only — leave the odd unit behind
  const spareUnits = Math.floor((spare.iron + spare.wood + spare.food) / sellRate) * sellRate
  const spareGain = spareUnits / sellRate + spare.trade * state.config.tradeValue
  const spareSelection = (() => {
    let left = spareUnits
    const out = { iron: 0, wood: 0, food: 0, trade: spare.trade }
    for (const r of ['iron', 'wood', 'food'] as const) {
      out[r] = Math.min(spare[r], left)
      left -= out[r]
    }
    return out
  })()
  const cardKey = state.lastResourceCard ? `${state.round}:${state.activeSeat}:${state.lastResourceCard.id}` : null
  const showResourceReveal =
    !!cardKey &&
    cardKey !== seenCard &&
    state.resourceCardDrawn &&
    state.phase !== 'draft' &&
    state.activeSeat === mySeatId

  const submitSell = async (sel: typeof sell) => {
    const ok = await send({
      type: 'sellResources',
      resources: { iron: sel.iron, wood: sel.wood, food: sel.food },
      trade: sel.trade,
    })
    if (ok) setSell({ iron: 0, wood: 0, food: 0, trade: 0 })
  }

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 3000)
      return () => clearTimeout(t)
    }
  }, [error])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (document.querySelector('.modal-backdrop')) return
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        setShowHistory(true)
      }
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!showRulers) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowRulers(false)
    }
    const desktop = window.matchMedia('(min-width: 901px)')
    const onResize = () => {
      if (desktop.matches) setShowRulers(false)
    }
    window.addEventListener('keydown', onKey)
    desktop.addEventListener('change', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      desktop.removeEventListener('change', onResize)
    }
  }, [showRulers])

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
  const activeSeatName = state.seats[state.activeSeat]?.name ?? 'A ruler'
  const prevSeat = useRef(state.activeSeat)
  useEffect(() => {
    const prev = prevSeat.current
    prevSeat.current = state.activeSeat
    if (hotseat || prev === state.activeSeat || state.phase === 'draft' || state.phase === 'gameover') return
    setTurnToast(state.activeSeat === mySeatId ? 'Your turn' : `${activeSeatName}'s turn`)
    const t = setTimeout(() => setTurnToast(null), 2400)
    return () => clearTimeout(t)
  }, [state.activeSeat, state.phase, hotseat, mySeatId, activeSeatName])

  const send = useCallback(
    async (action: Parameters<Transport['send']>[0]) => {
      try {
        await transport.send(action)
        return true
      } catch (e) {
        setError((e as Error).message)
        return false
      }
    },
    [transport],
  )

  // end turn asks once when actions remain, so a stray click cannot forfeit them
  const toggleFocus = useCallback(() => setFocusBoard((f) => !f), [])
  const clearSelection = useCallback(() => setSelectedRegion(null), [])

  const requestEndTurn = useCallback(() => {
    if (state.actionsLeft > 0 && !confirmEnd) {
      setConfirmEnd(true)
      return
    }
    setConfirmEnd(false)
    send({ type: 'endTurn' })
  }, [state.actionsLeft, confirmEnd, send])

  // online quick emotes
  useEffect(() => {
    const off = transport.onEmote?.((e) => {
      const id = `${e.at}-${e.seatId}-${Math.random().toString(36).slice(2, 7)}`
      setEmotes((cur) => [...cur.slice(-4), { id, seatId: e.seatId, name: e.name, emote: e.emote }])
      setTimeout(() => setEmotes((cur) => cur.filter((x) => x.id !== id)), 2800)
    })
    return () => off?.()
  }, [transport])

  const sendEmote = async (emote: string) => {
    setShowEmotes(false)
    try {
      await transport.sendEmote?.(emote)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  // derive short-lived visual cues from real state transitions
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = state
    if (!prev) return
    const nextFx = diffStates(prev, state)
    if (nextFx) setFx(nextFx)
  }, [state])

  useEffect(() => {
    if (!fx) return
    const t = setTimeout(() => setFx(null), 1800)
    return () => clearTimeout(t)
  }, [fx])

  // chronicle unread count while collapsed
  const prevLogLen = useRef(state.log.length)
  useEffect(() => {
    const delta = state.log.length - prevLogLen.current
    prevLogLen.current = state.log.length
    if (delta > 0 && !logOpen) setUnread((u) => u + delta)
  }, [state.log.length, logOpen])
  useEffect(() => {
    if (logOpen) setUnread(0)
  }, [logOpen])

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
  const onRegion = useCallback(
    (rid: string) => {
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
    },
    [evtActive, state.activeSeat, mySeatId, evtTargets, selectedArmyObj, moveTargets, send],
  )

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
  const offlineSeats = hotseat ? [] : Object.values(state.seats).filter((s) => !s.connected)
  const hasLedger = !!fx && Object.keys(fx.deltas).length > 0
  const mySeatObj = mySeatId ? state.seats[mySeatId] : null
  const manySeats = Object.keys(state.seats).length > 4
  const showMyCourt = manySeats && !!mySeatObj && state.activeSeat !== mySeatId

  // exactly one recommended action for the current state — the coach strip
  const nextStep: { text: string; action?: { label: string; run: () => void } } = (() => {
    if (state.phase === 'gameover') return { text: 'The age is decided.' }
    if (state.phase === 'draft')
      return me
        ? { text: 'Choose your ruler’s persona to begin the age.' }
        : { text: 'The rulers are choosing their personas.' }
    if (state.pendingBattle) return { text: 'A battle awaits secret commitments.' }
    if (state.pendingPrize) return { text: 'A ruler is choosing a victory prize.' }
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
      if (!selectedArmyObj) return { text: 'Select an army below, then click a gold-lit neighbour to march.' }
      return { text: 'Click a gold-lit neighbouring region to march, or inspect a region for orders.' }
    }
    return { text: 'The table waits.' }
  })()

  return (
    <div className={`game ${focusBoard ? 'focus-board' : ''} ${showRulers ? 'show-rulers' : ''}`}>
      <a className="skip-link" href="#game-controls">
        Skip to controls
      </a>
      {/* ---------- top bar ---------- */}
      <div className="topbar">
        <div className="logo">भारत · BHARATA</div>
        {roomCode && <div className="pill room-pill">Room {roomCode}</div>}
        <div className="pill">{state.round === 0 ? 'Setup' : `Round ${state.round}`}</div>
        <div className="phase-steps">
          {['Resource', 'Actions', 'Events'].map((p, i) => (
            <div key={p} className={`phase-step ${phaseStep === i ? 'on' : ''}`}>
              {p}
            </div>
          ))}
        </div>
        <div
          className={`turn-banner ${offlineSeats.length > 0 ? 'offline' : ''}`}
          aria-live="polite"
          title={offlineSeats.length > 0 ? `${offlineSeats.map((s) => s.name).join(', ')} disconnected` : bannerText}
        >
          {offlineSeats.length > 0
            ? `⌁ ${offlineSeats.map((s) => s.name).join(', ')} disconnected — their court auto-plays`
            : bannerText}
        </div>
        <div className="pill vp-target">First to {state.config.vpTarget} VP</div>
        <button className="small ghost mobile-only" aria-expanded={showRulers} onClick={() => setShowRulers((v) => !v)}>
          Rulers ({Object.keys(state.seats).length})
        </button>
        {transport.mode === 'online' && mySeatId && (
          <button
            className="small ghost emote-btn"
            onClick={() => setShowEmotes((v) => !v)}
            title="Emote"
            aria-label="Emote"
            aria-expanded={showEmotes}
          >
            ☺
          </button>
        )}
        <button className="small ghost" onClick={() => setShowHistory(true)} title="History (H)">
          History
        </button>
        <button className="small ghost" onClick={() => setShowHelp(true)} title="Rules (?)">
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
      {emotes.length > 0 && (
        <div className="emote-stack" aria-live="polite">
          {emotes.map((e) => (
            <div key={e.id} className="emote-toast">
              <span className="emote-dot" style={{ background: state.seats[e.seatId]?.color }} />
              <b>{e.name}</b>
              <span className="emote-glyph">{e.emote}</span>
            </div>
          ))}
        </div>
      )}

      {showRulers && <div className="drawer-scrim" onClick={() => setShowRulers(false)} />}
      <div className="game-main">
        {/* ---------- board ---------- */}
        <div className="board-pane">
          <div className={`next-step ${hasLedger ? 'has-ledger' : ''} ${nextStep.action ? 'has-action' : ''}`} role="status">
            <span className="ns-kicker">Next</span>
            <span className="ns-text">{nextStep.text}</span>
            {hasLedger && (
              <div className="fx-ledger" aria-hidden="true">
                {Object.entries(fx.deltas)
                  .sort(([a], [b]) => (a === state.activeSeat ? -1 : b === state.activeSeat ? 1 : 0))
                  .map(([seatId, delta]) => {
                    const seat = state.seats[seatId]
                    if (!seat) return null
                    const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)
                    return (
                      <div key={seatId} className="fx-ledger-row">
                        <span className="fx-ledger-dot" style={{ background: seat.color }} />
                        <b>{seat.name}</b>
                        {delta.vp ? <span className="fx-chip fx-vp">{fmt(delta.vp)} VP</span> : null}
                        {(['coins', 'iron', 'wood', 'food', 'trade', 'medicine'] as const).map((key) =>
                          delta[key] ? (
                            <span key={key} className="fx-chip">
                              {fmt(delta[key]!)} <Ico kind={key === 'coins' ? 'coin' : key} title={key} />
                            </span>
                          ) : null,
                        )}
                      </div>
                    )
                  })}
              </div>
            )}
            {nextStep.action && (
              <button className="small primary" onClick={nextStep.action.run}>
                {nextStep.action.label}
              </button>
            )}
          </div>
          {(isMyTurn && afflictedRegions.length > 0 && state.phase === 'action') || state.pendingBattle ? (
            <div className="board-alerts" aria-live="polite">
              {isMyTurn && afflictedRegions.length > 0 && state.phase === 'action' && (
                <div className="board-alert danger">
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
                <div className="board-alert battle">
                  ⚔ Battle of {REGIONS[state.pendingBattle.regionId].name} — awaiting{' '}
                  {state.pendingBattle.awaiting.map((s) => state.seats[s]?.name).join(', ') || '…'}
                </div>
              )}
            </div>
          ) : null}
          <div className="board-scroll">
            <Board
              state={state}
              selectedRegion={selectedRegion}
              moveTargets={moveTargets}
              evtTargets={evtTargets}
              onRegion={onRegion}
              focusMode={focusBoard}
              onToggleFocus={toggleFocus}
              onClearSelection={clearSelection}
              fx={fx}
            />
          </div>
        </div>

        {/* ---------- sidebar ---------- */}
        <div
          className="sidebar"
          role={showRulers ? 'dialog' : undefined}
          aria-modal={showRulers ? true : undefined}
          aria-label={showRulers ? 'Rulers' : undefined}
        >
          <div className="drawer-head">
            <h3>Rulers</h3>
            <button className="small ghost" onClick={() => setShowRulers(false)}>
              Close
            </button>
          </div>
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
                ['●', 'black disc = region value (VP = conquer cost = terrain bonus, max +3)'],
                ['♟', 'wooden pawn = army (I/II, badge = power, pattern = ruler)'],
                ['⭐', 'capital'], ['🚩', 'fort'], ['❓', 'hidden token'], ['⚓', 'harbor'], ['⭕', 'red discs = disasters'],
              ].map(([i, l]) => (
                <span key={l} style={{ whiteSpace: 'nowrap', marginRight: 10 }}>
                  {i} {l}
                </span>
              ))}
            </div>
          </details>
          <div className="players-list">
            {showMyCourt && mySeatObj && (
              <div className="my-court" title="Your court while another ruler holds the stage">
                <KingdomCrest seed={mySeatObj.kingdomId} label={state.kingdoms[mySeatObj.kingdomId].name} size={14} color={mySeatObj.color} />
                <b>You</b>
                <span className="my-court-vp">
                  {mySeatObj.vp}/{state.config.vpTarget}
                </span>
                <span><Ico kind="coin" title="coins" /> {mySeatObj.coins}</span>
                <span><Ico kind="iron" title="iron" /> {mySeatObj.iron}</span>
                <span><Ico kind="wood" title="wood" /> {mySeatObj.wood}</span>
                <span><Ico kind="food" title="food" /> {mySeatObj.food}</span>
                <span><Ico kind="trade" title="trade" /> {mySeatObj.trade}</span>
              </div>
            )}
            {Object.values(state.seats).map((s, seatIndex) => {
              const k = state.kingdoms[s.kingdomId]
              const forts = Object.values(k.forts).filter((x) => x === k.id).length
              const active = s.id === state.activeSeat
              const armies = state.armies.filter((a) => a.ownerId === s.id)
              const compact = Object.keys(state.seats).length > 4 && !active
              const coRulers = Object.values(state.seats).filter((x) => x.kingdomId === s.kingdomId && x.id !== s.id)
              const delta = fx?.deltas[s.id] ?? {}
              return (
                <div
                  key={s.id}
                  className={`player-card ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}
                  title={
                    coRulers.length
                      ? `Co-ruled with ${coRulers.map((x) => x.name).join(', ')} — territory and forts are shared; resources, armies and VP are individual.`
                      : undefined
                  }
                >
                  <div className="pc-head">
                    <span className="pc-order" title={`Turn order ${seatIndex + 1}`}>
                      {seatIndex + 1}
                    </span>
                    <KingdomCrest seed={s.kingdomId} label={k.name} size={15} color={s.color} />
                    <span className="pc-name">{s.name}</span>
                    {s.id === mySeatId && <span className="pc-you">you</span>}
                    {coRulers.length > 0 && (
                      <span
                        className="pc-co"
                        title={`Co-ruled with ${coRulers.map((x) => x.name).join(', ')} — territory and forts are shared; resources, armies and VP are individual.`}
                      >
                        shared
                      </span>
                    )}
                    {active && <span className="pc-playing">playing</span>}
                    {!s.connected && (
                      <span className="pc-off" title="reconnecting">
                        ⌁{compact ? '' : ' reconnecting'}
                      </span>
                    )}
                    <span className="pc-vp">
                      <b>{s.vp}</b>
                      <span>/{state.config.vpTarget}</span>
                    </span>
                  </div>
                  <div className="pc-kingdom">
                    {k.name} · {forts} fort{forts === 1 ? '' : 's'}
                    {REGIONS[k.capital].name !== k.name ? ` · ${REGIONS[k.capital].name}` : ''}
                    {coRulers.length > 0 ? ` · shared with ${coRulers.map((x) => x.name).join(', ')}` : ''}
                  </div>
                  <VpTrack vp={s.vp} target={state.config.vpTarget} color={s.color} />
                  {!compact && (
                    <>
                      <div className="pc-stats">
                        <span className="pc-stat" title={`${s.coins} coins`}><Ico kind="coin" title="coins" /> <b>{s.coins}</b></span>
                        <span className="pc-stat" title={`${s.iron} iron`}><Ico kind="iron" title="iron" /> <b>{s.iron}</b></span>
                        <span className="pc-stat" title={`${s.wood} wood`}><Ico kind="wood" title="wood" /> <b>{s.wood}</b></span>
                        <span className="pc-stat" title={`${s.food} food`}><Ico kind="food" title="food" /> <b>{s.food}</b></span>
                        <span className="pc-stat" title={`${s.trade} trade goods`}><Ico kind="trade" title="trade" /> <b>{s.trade}</b></span>
                        {state.config.advanced && (
                          <span className="pc-stat" title={`${s.medicine} medicine`}><Ico kind="medicine" title="medicine" /> <b>{s.medicine}</b></span>
                        )}
                        <span className="pc-stat" title={`${s.winsBattles} battles won`}><Ico kind="sword" title="battles won" /> <b>{s.winsBattles}</b></span>
                      </div>
                      <div className="pc-armies">
                        {armies.map((a) => {
                          const power = a.cards.reduce((t, c) => t + c.value, 0)
                          return (
                            <span
                              key={a.id}
                              className={`pc-army ${a.alive ? '' : 'dead'}`}
                              title={
                                a.alive
                                  ? `${a.regionId ? REGIONS[a.regionId].name : 'in the field'} · ${a.cards.length} cards · power ${power}`
                                  : 'destroyed — reinforce at your capital'
                              }
                            >
                              <b>{a.armyId === 1 ? 'I' : 'II'}</b>
                              {a.alive ? <> {power}⚔️ · {a.cards.length}c</> : ' ☠'}
                            </span>
                          )
                        })}
                      </div>
                      {s.personality && (
                        <div
                          className="pc-traits"
                          title={s.abilities.map((ab) => `${ABILITIES[ab].name}: ${ABILITIES[ab].desc}`).join(' · ')}
                        >
                          {PERSONALITIES[s.personality].name}
                          {s.abilities.length > 0 && (
                            <> · {s.abilities.map((ab) => `${ABILITIES[ab].name} ${s.abilityUsesLeft[ab] ?? 0}`).join(' · ')}</>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {compact && (
                    <span
                      className="pc-mini"
                      style={{ width: `${Math.min(100, (s.vp / state.config.vpTarget) * 100)}%`, background: s.color }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className={`log-pane ${logOpen ? '' : 'collapsed'}`}>
            <div className="log-head">
              <button className="log-toggle" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen}>
                <h3>Chronicle</h3>
                {unread > 0 && <span className="log-unread">{unread}</span>}
                <span className="log-chev">{logOpen ? '▾' : '▸'}</span>
              </button>
              {logOpen && (
                <div className="log-filters">
                  {(['all', 'battle', 'event'] as const).map((f) => (
                    <button
                      key={f}
                      className={`log-filter ${logFilter === f ? 'on' : ''}`}
                      onClick={() => setLogFilter(f)}
                    >
                      {f === 'all' ? 'All' : f === 'battle' ? 'Battles' : 'Events'}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="log-expand"
                onClick={() => setShowHistory(true)}
                title="Open full history"
                aria-label="Open full history"
              >
                ⤢
              </button>
            </div>
            {logOpen && (
              <div className="log-feed" role="log" aria-live="polite" aria-relevant="additions">
                {[...state.log]
                  .reverse()
                  .filter((l) => logFilter === 'all' || l.kind === logFilter)
                  .map((l) => (
                    <div key={l.id} className={`log-entry ${l.kind ?? ''}`}>
                      {l.text}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---------- bottom controls ---------- */}
      <div className="controls" id="game-controls">
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
                      <div className="actions-row sell-row">
                        <span className="hint" style={{ width: '100%' }}>
                          Step 2 — click a good to add it to the sale; unspent goods carry over. Step 3 — recruit and press <b>To Actions</b>.
                        </span>
                        {(['iron', 'wood', 'food'] as const).map((r) => (
                          <span key={r} className="sell-pill">
                            <button
                              className="sell-add"
                              disabled={sell[r] >= me![r]}
                              title={`Add 1 ${r}`}
                              onClick={() => setSell((s) => ({ ...s, [r]: Math.min(me![r], s[r] + 1) }))}
                            >
                              <Ico kind={r} title={r} />
                              <b>{sell[r]}</b>
                              <span className="sell-have">/{me![r]}</span>
                            </button>
                            <button
                              className="sell-sub"
                              disabled={sell[r] === 0}
                              title={`Remove 1 ${r}`}
                              onClick={() => setSell((s) => ({ ...s, [r]: Math.max(0, s[r] - 1) }))}
                            >
                              −
                            </button>
                          </span>
                        ))}
                        <span className="sell-pill">
                          <button
                            className="sell-add"
                            disabled={!tradeAllowed || sell.trade >= me!.trade}
                            title={tradeAllowed ? 'Add 1 trade good' : 'Trade goods need an export harbor (⚓) or the Merchant Prince'}
                            onClick={() => setSell((s) => ({ ...s, trade: Math.min(me!.trade, s.trade + 1) }))}
                          >
                            <Ico kind="trade" title="trade goods" />
                            <b>{sell.trade}</b>
                            <span className="sell-have">/{me!.trade}</span>
                          </button>
                          <button
                            className="sell-sub"
                            disabled={sell.trade === 0}
                            title="Remove 1 trade good"
                            onClick={() => setSell((s) => ({ ...s, trade: Math.max(0, s.trade - 1) }))}
                          >
                            −
                          </button>
                        </span>
                        <button
                          className="ghost"
                          disabled={(sellTotal === 0 && sell.trade === 0) || !sellPairsValid}
                          title={!sellPairsValid ? `Resources sell in groups of ${sellRate}` : 'Sell the chosen goods'}
                          onClick={() => submitSell(sell)}
                        >
                          {!sellPairsValid ? `Sell · groups of ${sellRate}` : sellGain > 0 ? <>Sell → +{sellGain} <Ico kind="coin" title="coins" /></> : 'Sell'}
                        </button>
                        <button
                          className="ghost"
                          disabled={spareGain === 0}
                          title="Sell every spare good in one trade (whole groups only)"
                          onClick={() => submitSell(spareSelection)}
                        >
                          Sell all → +{spareGain} <Ico kind="coin" title="coins" />
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
                              Reinforce {aid === 1 ? 'I' : 'II'} · {state.config.armyCardCost} <Ico kind="coin" title="coins"/>
                            </button>
                            <button
                              className="ghost"
                              title={me!.iron < 2 ? `Need 2 iron — you have ${me!.iron}` : me!.coins < 1 ? 'Need 1 coin' : 'Bend iron into weapons: 2 iron + 1 coin for one army card'}
                              disabled={me!.iron < 2 || me!.coins < 1}
                              onClick={() => send({ type: 'buyArmyCard', armyId: aid, forge: true })}
                            >
                              Forge {aid === 1 ? 'I' : 'II'} · 2⛏ + 1 <Ico kind="coin" title="coins"/>
                            </button>
                          </span>
                        ))}
                        <button className="primary to-actions" onClick={() => send({ type: 'endResource' })}>
                          To Actions →
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="hint">
                  {state.seats[state.activeSeat]?.name} manages their court…
                  {state.resourceCardDrawn && state.lastResourceCard && (
                    <span style={{ marginLeft: 8 }}>
                      Drew <b>{state.lastResourceCard.title}</b> — its effects are applied to the table.
                    </span>
                  )}
                </div>
              )}
              {state.activeSeat === mySeatId && state.resourceCardDrawn && state.lastResourceCard && (
                <div className="resource-card" style={{ marginTop: 8 }} title="Drawn this turn — its gains applied to every ruler">
                  <div className="resource-owner">
                    {state.activeSeat === mySeatId
                      ? 'You drew'
                      : `${state.seats[state.activeSeat]?.name ?? 'A ruler'} drew`}
                  </div>
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
                        <button
                          key={aid}
                          type="button"
                          className={`army-box ${selectedArmy === aid ? 'selected' : ''}`}
                          aria-pressed={selectedArmy === aid}
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
                        </button>
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
      {state.pendingPrize && state.pendingPrize.seatId === mySeatId && (
        <PrizeModal state={state} onChoose={(i) => send({ type: 'choosePrize', optionIndex: i })} />
      )}
      {state.phase === 'gameover' && (
        <GameOverModal
          state={state}
          canAgain={hotseat || transport.isHost}
          onAgain={() => {
            if (hotseat) onLeave()
            else transport.reset().catch(() => {})
          }}
          onLeave={onLeave}
        />
      )}
      {showResourceReveal && state.lastResourceCard && (
        <ResourceRevealModal card={state.lastResourceCard} onClose={() => setSeenCard(cardKey)} />
      )}
      {showEmotes && (
        <>
          <div className="emote-scrim" onClick={() => setShowEmotes(false)} />
          <div className="emote-menu" role="menu" aria-label="Emotes">
            {EMOTES.map((em) => (
              <button key={em} role="menuitem" className="emote-option" onClick={() => sendEmote(em)}>
                {em}
              </button>
            ))}
          </div>
        </>
      )}
      {showHistory && (
        <HistoryModal
          state={state}
          mySeatId={mySeatId}
          onClose={() => setShowHistory(false)}
          onSelectRegion={(rid) => {
            setSelectedRegion(rid)
            setShowHistory(false)
          }}
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
                  <span className="bcard-mark" aria-hidden>
                    <Ico kind="sword" size={24} />
                  </span>
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
