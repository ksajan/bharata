import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { GameState, LogEntry } from '../../shared/types'

type Filter = 'all' | 'mine' | 'battle' | 'event' | 'gain'

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

const KIND_GLYPH: Record<string, string> = {
  battle: '⚔',
  event: '⚠',
  gain: '✦',
  turn: '❖',
  action: '·',
  system: '◇',
}

export function HistoryModal(props: { state: GameState; mySeatId: string | null; onClose: () => void }) {
  const { state, mySeatId, onClose } = props
  const [filter, setFilter] = useState<Filter>('all')
  const [ruler, setRuler] = useState<string>('all')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

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
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    searchRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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

  const needle = query.trim().toLowerCase()
  const contains = (text: string, term: string) => text.toLowerCase().includes(term.toLowerCase())

  const matches = (entry: LogEntry) => {
    if (needle && !entry.text.toLowerCase().includes(needle)) return false
    if (rulerSeat && !contains(entry.text, rulerSeat.name)) return false
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
      // kind filters keep the turn header as context when the section has matches
      const showHeader =
        !!section.header &&
        (headerMatches || (filter !== 'all' && filter !== 'mine' && entries.length > 0))
      return { ...section, entries, showHeader }
    })
    .filter((section) => {
      if (section.entries.length > 0) return true
      if (!section.header) return false
      if (filter === 'all') return true
      return section.showHeader
    })
    .reverse()

  const count = filtered.reduce((n, s) => n + s.entries.length, 0)

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
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
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
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              aria-label="Search history"
            />
            {(filter !== 'all' || ruler !== 'all' || query) && (
              <button
                className="ghost small"
                onClick={() => {
                  setFilter('all')
                  setRuler('all')
                  setQuery('')
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="history-feed">
          {filtered.length === 0 && <div className="history-empty">No entries match these filters.</div>}
          {filtered.map((section) => (
            <section key={section.key} className="hist-section">
              {section.header && section.showHeader && (
                <div className={`hist-turn ${section.header.kind ?? ''}`}>{section.header.text}</div>
              )}
              {!section.header && <div className="hist-turn setup">Setup</div>}
              {section.entries.map((entry) => (
                <div key={entry.id} className={`hist-entry ${entry.kind ?? 'action'}`}>
                  <span className="hist-dots">{seatDots(entry.text)}</span>
                  <span className="hist-glyph" aria-hidden>
                    {KIND_GLYPH[entry.kind ?? 'action'] ?? '·'}
                  </span>
                  <span className="hist-text">{entry.text}</span>
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="history-foot">Newest first · turn headers group the actions · resources and draws are public</div>
      </div>
    </div>
  )
}
