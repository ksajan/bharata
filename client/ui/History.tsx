import React, { useEffect, useMemo, useRef, useState } from 'react'
import { REGIONS, RESOURCE_CARDS } from '../../shared/data'
import type { BattleRecord, GameState, LogEntry, ResourceCardDef } from '../../shared/types'

type Filter = 'all' | 'mine' | 'battle' | 'event' | 'gain'
type RoundFilter = 'all' | number

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My actions' },
  { id: 'battle', label: 'Battles' },
  { id: 'event', label: 'Events' },
  { id: 'gain', label: 'Resources' },
]

interface Section {
  key: string
  header?: LogEntry
  entries: LogEntry[]
}

const RESOURCE_GLYPH: Record<string, string> = {
  iron: '⛏',
  wood: '🪵',
  food: '🌾',
  trade: '🧵',
  coins: '🪙',
  medicine: '🌿',
}

function grantChips(gains?: Partial<Record<string, number>>) {
  if (!gains) return null
  return Object.entries(gains)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] !== 0)
    .map(([kind, n]) => (
      <span key={kind} className="grant-chip">
        {RESOURCE_GLYPH[kind] ?? kind} {n > 0 ? `+${n}` : n}
      </span>
    ))
}

function ResourceCardFace({ card }: { card: ResourceCardDef }) {
  return (
    <div className="hist-card-face">
      <div className="hist-card-title">{card.title}</div>
      <div className="hist-card-text">{card.text}</div>
      <div className="hist-card-grants">
        {card.all && (
          <div>
            <span className="hist-card-label">All rulers</span>
            {grantChips(card.all)}
          </div>
        )}
        {card.active && (
          <div>
            <span className="hist-card-label">Drawer</span>
            {grantChips(card.active)}
          </div>
        )}
      </div>
    </div>
  )
}

function BattleDetail(props: { record: BattleRecord; state: GameState; onReplay: () => void }) {
  const { record, state, onReplay } = props
  const atk = state.seats[record.attackerSeat]
  const def = state.seats[record.defenderSeat]
  const winner = state.seats[record.winnerSeat]
  const groups = [
    { seat: atk, seatId: record.attackerSeat, role: 'attacker', cards: record.cards.filter((c) => c.seatId === record.attackerSeat) },
    { seat: def, seatId: record.defenderSeat, role: 'defender', cards: record.cards.filter((c) => c.seatId === record.defenderSeat) },
  ].filter((g) => g.seat)
  return (
    <div className="hist-battle-body">
      <div className="hist-battle-meta">
        <span>Round {record.round}</span>
        <span>·</span>
        <span>Winner: <b>{winner?.name ?? '—'}</b></span>
      </div>
      <div className="battle-totals hist-battle-totals">
        <div className={`tot ${record.winnerSeat === record.attackerSeat ? 'win' : ''}`}>
          <div className="n">{record.attackerTotal}</div>
          <div>{atk?.name ?? '—'}</div>
          <div className="hist-role">attacker</div>
        </div>
        <div className={`tot ${record.winnerSeat === record.defenderSeat ? 'win' : ''}`}>
          <div className="n">{record.defenderTotal}</div>
          <div>{def?.name ?? '—'}</div>
          <div className="hist-role">defender{record.defenderBonus ? ` (+${record.defenderBonus} terrain)` : ''}</div>
        </div>
      </div>
      <div className="hist-battle-cards">
        {groups.map((g) => (
          <div key={g.seatId} className="hist-battle-side">
            <div className="hist-battle-side-head">
              <span className="hist-battle-dot" style={{ background: g.seat!.color }} />
              {g.seat!.name} · {g.role}
            </div>
            <div className="battle-cards">
              {g.cards.map((c, i) => (
                <span key={`${g.seatId}-${i}`} className="bcard hist-mini-card" style={{ borderColor: g.seat!.color }}>
                  {c.value}
                  <small>{c.armyId === 1 ? 'I' : 'II'}</small>
                </span>
              ))}
              {g.cards.length === 0 && <span className="hint">no cards committed</span>}
            </div>
          </div>
        ))}
      </div>
      <button className="ghost small" onClick={onReplay}>
        ⚔ Replay battle
      </button>
    </div>
  )
}

function BattleReplay(props: { record: BattleRecord; state: GameState; onClose: () => void }) {
  const { record, state, onClose } = props
  const atk = state.seats[record.attackerSeat]
  const def = state.seats[record.defenderSeat]
  const groups = [
    { seat: atk, seatId: record.attackerSeat, role: 'attacker', cards: record.cards.filter((c) => c.seatId === record.attackerSeat) },
    { seat: def, seatId: record.defenderSeat, role: 'defender', cards: record.cards.filter((c) => c.seatId === record.defenderSeat) },
  ].filter((g) => g.seat)
  const winner = state.seats[record.winnerSeat]
  return (
    <div className="modal-backdrop battle-replay-backdrop" onClick={onClose}>
      <div className="modal battle-replay" role="dialog" aria-modal="true" aria-label="Battle replay" onClick={(e) => e.stopPropagation()}>
        <div className="history-kicker">Battle replay · round {record.round}</div>
        <h2>⚔ {REGIONS[record.regionId]?.name ?? 'Battle'}</h2>
        <div className="battle-totals">
          <div className={`tot ${record.winnerSeat === record.attackerSeat ? 'win' : ''}`}>
            <div className="n">{record.attackerTotal}</div>
            <div>{atk?.name ?? '—'}</div>
            <div className="hist-role">attacker</div>
          </div>
          <div className={`tot ${record.winnerSeat === record.defenderSeat ? 'win' : ''}`}>
            <div className="n">{record.defenderTotal}</div>
            <div>{def?.name ?? '—'}</div>
            <div className="hist-role">defender{record.defenderBonus ? ` (+${record.defenderBonus} terrain)` : ''}</div>
          </div>
        </div>
        <div className="hist-replay-cards">
          {groups.map((g) => (
            <div key={g.seatId} className="hist-battle-side">
              <div className="hist-battle-side-head">
                <span className="hist-battle-dot" style={{ background: g.seat!.color }} />
                {g.seat!.name} · {g.role}
              </div>
              <div className="battle-cards">
                {g.cards.map((c, i) => (
                  <span
                    key={`${g.seatId}-${i}`}
                    className="bcard hist-mini-card"
                    style={{ borderColor: g.seat!.color, animationDelay: `${i * 40}ms` }}
                  >
                    {c.value}
                    <small>{c.armyId === 1 ? 'I' : 'II'}</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <h3 style={{ textAlign: 'center', margin: '14px 0 0' }}>
          {winner?.name} {record.winnerSeat === record.attackerSeat ? 'carries the field!' : 'holds the ground!'}
        </h3>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={onClose}>
            Close replay
          </button>
        </div>
      </div>
    </div>
  )
}

export function HistoryModal(props: {
  state: GameState
  mySeatId: string | null
  onClose: () => void
  onSelectRegion?: (regionId: string) => void
}) {
  const { state, mySeatId, onClose, onSelectRegion } = props
  const [filter, setFilter] = useState<Filter>('all')
  const [ruler, setRuler] = useState<string>('all')
  const [round, setRound] = useState<RoundFilter>('all')
  const [query, setQuery] = useState('')
  const [replay, setReplay] = useState<BattleRecord | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const seats = useMemo(
    () =>
      Object.values(state.seats).sort((a, b) =>
        a.id.localeCompare(b.id, undefined, { numeric: true }),
      ),
    [state.seats],
  )
  const mySeat = mySeatId ? state.seats[mySeatId] : null
  const rulerSeat = ruler === 'all' ? null : state.seats[ruler]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (replay) setReplay(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    searchRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, replay])

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = []
    for (const entry of state.log) {
      const isHeader = entry.text.startsWith('— ')
      if (isHeader) out.push({ key: `h${entry.id}`, header: entry, entries: [] })
      else {
        if (out.length === 0) out.push({ key: 'setup', entries: [] })
        out[out.length - 1].entries.push(entry)
      }
    }
    return out
  }, [state.log])

  const battleById = useMemo(
    () => new Map((state.battleHistory ?? []).map((b) => [b.id, b])),
    [state.battleHistory],
  )
  const lastBattleEntry = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of state.log) if (e.battleId) m.set(e.battleId, e.id)
    return m
  }, [state.log])

  const regionNames = useMemo(
    () => Object.values(REGIONS).sort((a, b) => b.name.length - a.name.length),
    [],
  )
  const regionFor = (entry: LogEntry): string | null => {
    if (entry.battleId) {
      const b = battleById.get(entry.battleId)
      if (b) return b.regionId
    }
    return regionNames.find((r) => entry.text.includes(r.name))?.id ?? null
  }

  const needle = query.trim().toLowerCase()
  const contains = (text: string, term: string) => text.toLowerCase().includes(term.toLowerCase())

  const matches = (entry: LogEntry) => {
    if (needle && !entry.text.toLowerCase().includes(needle)) return false
    if (rulerSeat && !contains(entry.text, rulerSeat.name)) return false
    if (round !== 'all' && (entry.round ?? 0) !== round) return false
    if (filter === 'mine') {
      if (!mySeat || !contains(entry.text, mySeat.name)) return false
    }
    if (filter === 'battle' && entry.kind !== 'battle') return false
    if (filter === 'event' && entry.kind !== 'event') return false
    if (filter === 'gain' && entry.kind !== 'gain') return false
    return true
  }

  const filtered = sections
    .map((section) => {
      const entries = section.entries.filter(matches).slice().reverse()
      const headerMatches = section.header ? matches(section.header) : false
      const showHeader =
        !!section.header &&
        (headerMatches || (filter !== 'all' && filter !== 'mine' && entries.length > 0))
      return { ...section, entries, showHeader }
    })
    .filter((section) => {
      if (section.entries.length > 0) return true
      if (!section.header) return false
      if (filter === 'all' && round === 'all') return true
      return section.showHeader
    })
    .reverse()

  const count = filtered.reduce((n, s) => n + s.entries.length, 0)
  const maxRound = Math.max(state.round, ...state.log.map((l) => l.round ?? 0))

  const jumpToMine = () => {
    setFilter('mine')
    setRuler('all')
    setRound('all')
    setQuery('')
    requestAnimationFrame(() => feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  const reset = () => {
    setFilter('all')
    setRuler('all')
    setRound('all')
    setQuery('')
  }

  const seatDots = (text: string) =>
    [...seats]
      .sort((a, b) => b.name.length - a.name.length)
      .filter((s) => contains(text, s.name))
      .map((s) => <i key={s.id} style={{ background: s.color }} title={s.name} />)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal history-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Action history"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="history-head">
          <div>
            <div className="history-kicker">The chronicle of the age</div>
            <h2>History</h2>
            <div className="sub">
              {count} entr{count === 1 ? 'y' : 'ies'} · round {state.round} · every ruler sees the same record
            </div>
          </div>
          <div className="history-head-actions">
            <button className="ghost small" onClick={jumpToMine}>
              My last action
            </button>
            <button className="ghost small" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="history-filters">
          <div className="hist-chips" role="group" aria-label="Filter history">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                className={`hist-chip ${filter === f.id ? 'on' : ''}`}
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="hist-controls">
            <select value={ruler} onChange={(e) => setRuler(e.target.value)} aria-label="Filter by ruler">
              <option value="all">All rulers</option>
              {seats.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={String(round)}
              onChange={(e) => setRound(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              aria-label="Filter by round"
            >
              <option value="all">All rounds</option>
              {Array.from({ length: maxRound }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Round {n}
                </option>
              ))}
            </select>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              aria-label="Search history"
            />
            {(filter !== 'all' || ruler !== 'all' || round !== 'all' || query) && (
              <button className="ghost small" onClick={reset}>
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="history-feed" ref={feedRef}>
          {filtered.length === 0 && <div className="history-empty">No entries match these filters.</div>}
          {filtered.map((section) => (
            <section key={section.key} className="hist-section">
              {section.header && section.showHeader && (
                <div className={`hist-turn ${section.header.kind ?? ''}`}>{section.header.text}</div>
              )}
              {!section.header && <div className="hist-turn setup">Setup</div>}
              {section.entries.map((entry) => {
                const battle = entry.battleId ? battleById.get(entry.battleId) : undefined
                const showBattle =
                  !!battle && lastBattleEntry.get(entry.battleId ?? '') === entry.id
                const drawnCard = Object.values(RESOURCE_CARDS).find((c) =>
                  entry.text.includes(`“${c.title}”`),
                )
                const regionId = regionFor(entry)
                return (
                  <div key={entry.id} className={`hist-entry ${entry.kind ?? 'action'}`}>
                    <span className="hist-dots">{seatDots(entry.text)}</span>
                    <div className="hist-content">
                      <div className="hist-line">
                        <span className="hist-text">{entry.text}</span>
                        {regionId && onSelectRegion && (
                          <button
                            className="hist-map"
                            title={`Show ${REGIONS[regionId]?.name} on the map`}
                            aria-label={`Show ${REGIONS[regionId]?.name} on the map`}
                            onClick={() => onSelectRegion(regionId)}
                          >
                            ◎
                          </button>
                        )}
                      </div>
                      {drawnCard && <ResourceCardFace card={drawnCard} />}
                      {showBattle && (
                        <details className="hist-battle">
                          <summary>Battle record — committed cards & totals</summary>
                          <BattleDetail record={battle!} state={state} onReplay={() => setReplay(battle!)} />
                        </details>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        <div className="history-foot">
          Newest first · turn headers group the actions · resources and draws are public
        </div>

        {replay && <BattleReplay record={replay} state={state} onClose={() => setReplay(null)} />}
      </div>
    </div>
  )
}
