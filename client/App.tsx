import React, { useEffect, useRef, useState } from 'react'
import type { GameConfig, GameState } from '../shared/types'
import { HotseatTransport, OnlineTransport, Transport, lastSeat, type LobbySnapshot } from './transport'
import { Game } from './ui/Game'
import { RulesGuide } from './ui/RulesGuide'

const RULER_NAMES = ['Bimbisara', 'Prasenajit', 'Chandaka', 'Udayana', 'Ajatashatru', 'Mahavira', 'Nandivardhana', 'Shishunaga']

/** hand-drawn mandala rosette — watermark for the menu & setup screens */
export function Mandala({ size = 520, opacity = 0.08 }: { size?: number; opacity?: number }) {
  const petals = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
  return (
    <svg width={size} height={size} viewBox="-260 -260 520 520" style={{ opacity }} aria-hidden>
      <g fill="none" stroke="#7a5a1c" strokeWidth="1.4">
        <circle r="238" />
        <circle r="196" strokeWidth="0.8" />
        <circle r="150" />
        <circle r="96" strokeWidth="0.8" />
        <circle r="34" />
        {petals.map((deg) => (
          <g key={deg} transform={`rotate(${deg})`}>
            <path d="M0,-150 C26,-110 26,-70 0,-34 C-26,-70 -26,-110 0,-150" />
            <path d="M0,-196 C12,-178 12,-160 0,-150 M0,-196 C-12,-178 -12,-160 0,-150" strokeWidth="0.8" />
            <circle cy="-172" r="3.2" />
            <path d="M0,-96 C14,-76 14,-54 0,-34 M0,-96 C-14,-76 -14,-54 0,-34" strokeWidth="0.7" />
          </g>
        ))}
        {petals.filter((d) => d % 90 === 0).map((deg) => (
          <g key={`c${deg}`} transform={`rotate(${deg + 45})`}>
            <path d="M0,-238 L7,-168 L0,-150 L-7,-168 Z" />
          </g>
        ))}
      </g>
    </svg>
  )
}

export function hotseatViewSeat(state: GameState): string | null {
  // battles & prizes may demand a seat that isn't the active ruler (pass the device)
  if (state.pendingBattle && state.pendingBattle.awaiting.length > 0) return state.pendingBattle.awaiting[0]
  if (state.pendingPrize) return state.pendingPrize.seatId
  if (state.phase === 'draft') return Object.values(state.seats).find((s) => !s.personality)?.id ?? null
  return state.activeSeat
}

export default function App() {
  const [screen, setScreen] = useState<'menu' | 'hotseat-setup' | 'lobby' | 'game'>('menu')
  const transportRef = useRef<Transport | null>(null)
  const [transport, setTransport] = useState<Transport | null>(null)
  const [room, setRoom] = useState<LobbySnapshot | null>(null)
  const [state, setState] = useState<GameState | null>(null)
  const [name, setName] = useState(localStorage.getItem('bharata-name') || '')
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    return () => transportRef.current?.dispose()
  }, [])

  const attach = (t: Transport) => {
    transportRef.current?.dispose()
    transportRef.current = t
    setTransport(t)
    t.onRoom((r) => {
      setRoom(r)
      if (!r) setScreen('menu')
      else if (!r.started && screenRef.current !== 'lobby') setScreen('lobby')
    })
    t.onState((s) => {
      setState(s)
      if (s) setScreen('game')
    })
    t.onError((m) => setError(m))
  }

  const screenRef = useRef(screen)
  screenRef.current = screen

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 3500)
      return () => clearTimeout(t)
    }
  }, [error])

  // ---------- flows ----------
  const startOnline = async (create: boolean) => {
    setError(null)
    localStorage.setItem('bharata-name', name)
    const t = new OnlineTransport()
    attach(t)
    try {
      if (create) await t.create(name || 'Host')
      else await t.join(joinCode.toUpperCase(), name || 'Ruler')
      setScreen('lobby')
    } catch (e) {
      setError((e as Error).message)
      t.dispose()
      transportRef.current = null
      setTransport(null)
    }
  }

  const startHotseat = () => setScreen('hotseat-setup')

  const rejoinLast = async () => {
    const seat = lastSeat()
    if (!seat) return
    setError(null)
    const t = new OnlineTransport()
    attach(t)
    try {
      await t.rejoin(seat.code)
      setScreen('lobby')
    } catch (e) {
      setError((e as Error).message)
      t.dispose()
      transportRef.current = null
      setTransport(null)
    }
  }

  // ---------- render ----------
  if (screen === 'menu') {
    return (
      <div className="app">
        <MenuScreen
          name={name}
          setName={setName}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onHotseat={startHotseat}
          onOnlineCreate={() => startOnline(true)}
          onOnlineJoin={() => startOnline(false)}
          onRejoin={rejoinLast}
          rejoinCode={lastSeat()?.code ?? null}
          onGuide={() => setShowGuide(true)}
          error={error}
        />
        {showGuide && <RulesGuide onClose={() => setShowGuide(false)} />}
      </div>
    )
  }

  if (screen === 'hotseat-setup') {
    return (
      <div className="app">
        <HotseatSetup
          onBack={() => setScreen('menu')}
          onStart={(names, cfg) => {
            const t = new HotseatTransport()
            attach(t)
            t.startLocal(names, cfg).then(() => setScreen('game'))
          }}
          error={error}
        />
      </div>
    )
  }

  if (screen === 'lobby' && transport && room) {
    return (
      <div className="app">
        <LobbyScreen
          transport={transport}
          room={room}
          error={error}
          onLeave={() => {
            transport.dispose()
            transportRef.current = null
            setTransport(null)
            setRoom(null)
            setScreen('menu')
          }}
        />
      </div>
    )
  }

  if (screen === 'game' && transport && state) {
    const mySeatId = transport.mode === 'hotseat' ? hotseatViewSeat(state) : transport.seatId
    return (
      <div className="app">
        <Game
          transport={transport}
          state={state}
          mySeatId={mySeatId}
          roomCode={transport.mode === 'hotseat' ? null : transport.code}
          onLeave={() => {
            if (transport.mode === 'hotseat') {
              transport.dispose()
              transportRef.current = null
              setTransport(null)
              setState(null)
              setScreen('menu')
            } else {
              setScreen('lobby')
            }
          }}
        />
        {error && <div className="toast">{error}</div>}
      </div>
    )
  }

  return (
    <div className="app">
      <div className="menu-wrap">
        <div className="menu-card">
          <div className="brand">
            <h1>BHARATA</h1>
            <div className="sub">Connecting…</div>
          </div>
        </div>
      </div>
      {error && <div className="toast">{error}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function MenuScreen(props: {
  name: string
  setName: (s: string) => void
  joinCode: string
  setJoinCode: (s: string) => void
  onHotseat: () => void
  onOnlineCreate: () => void
  onOnlineJoin: () => void
  onRejoin: () => void
  rejoinCode: string | null
  onGuide: () => void
  error: string | null
}) {
  return (
    <div className="menu-wrap">
      <div className="mandala-bg">
        <Mandala />
      </div>
      <div className="menu-card">
        <div className="brand">
          <div className="devanagari">भारत</div>
          <h1>BHARATA 600 BC</h1>
          <div className="sub">
            Rule a Mahajanapada of ancient Bharata: draw the land's bounty, coin it into armies, conquer and
            defend. <b>Each turn: draw resources → take 2 actions → face an event.</b> First to the VP target wins.
          </div>
        </div>
        <div className="menu-modes">
          <button className="mode-card" onClick={props.onHotseat}>
            <h3>Same Screen</h3>
            Pass-and-play with friends around one device. 2–8 rulers, one throne room. The engine runs locally —
            no server needed.
          </button>
          <button className="mode-card" onClick={props.onOnlineCreate}>
            <h3>Online Multiplayer</h3>
            Host a room and share the 5-character code. Competitive live play for 2–8 rulers, each on their own
            browser, with reconnects and seat reclaim.
          </button>
        </div>
        <div className="menu-form online-row">
          <span className="join-label">Your name in the court:</span>
          <input
            placeholder="e.g. Bimbisara"
            value={props.name}
            onChange={(e) => props.setName(e.target.value)}
          />
        </div>
        <div className="menu-form online-row">
          <button className="ghost" onClick={props.onOnlineCreate} style={{ flex: 1 }}>
            Host Online Room
          </button>
          <span className="join-label">Joining a friend? Enter their code:</span>
          <input
            placeholder="CODE"
            value={props.joinCode}
            maxLength={5}
            style={{ width: 110, textTransform: 'uppercase' }}
            onChange={(e) => props.setJoinCode(e.target.value.toUpperCase())}
          />
          <button className="primary" onClick={props.onOnlineJoin} disabled={props.joinCode.length < 4}>
            Join
          </button>
        </div>
        <div className="menu-form" style={{ justifyContent: 'center' }}>
          {props.rejoinCode && (
            <button className="ghost" style={{ flex: 1 }} onClick={props.onRejoin}>
              ↻ Rejoin room {props.rejoinCode}
            </button>
          )}
          <button className="ghost" style={{ flex: 1 }} onClick={props.onGuide}>
            ❖ How to play — goal, turns, war & every option explained
          </button>
        </div>
        {props.error && <div className="lobby-note" style={{ color: 'var(--danger)' }}>⚠ {props.error}</div>}
        <div className="lobby-note">
          New here? Press <b>❖ How to play</b> — then start with Same Screen and the Quick preset.
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hot-seat setup
// ---------------------------------------------------------------------------

function HotseatSetup(props: {
  onBack: () => void
  onStart: (names: string[], cfg: Partial<GameConfig>) => void
  error: string | null
}) {
  const [count, setCount] = useState(4)
  const [names, setNames] = useState<string[]>(RULER_NAMES.slice(0, 8))
  const [cfg, setCfg] = useState<Partial<GameConfig>>({ ...CLASSIC_CFG })
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    setCfg((c) => ({ ...c, vpTarget: count === 2 ? 25 : count > 4 ? 20 + Math.ceil((count - 4) / 2) * 5 : 20 }))
  }, [count])

  return (
    <div className="menu-wrap">
      <div className="mandala-bg">
        <Mandala />
      </div>
      <div className="lobby-card">
        <div className="brand">
          <h1 style={{ fontSize: 30 }}>Same-Screen Thrones</h1>
          <div className="sub">Set your table, name your rulers, tune the age — or use a preset and play.</div>
        </div>
        <div className="section-title">Rulers ({count})</div>
        <div className="menu-form">
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n} rulers {n > 4 ? '(shared kingdoms)' : ''}
              </option>
            ))}
          </select>
          <button className="ghost small" onClick={() => setShowGuide(true)}>
            ❖ How to play
          </button>
        </div>
        <div className="cfg-grid">
          {names.slice(0, count).map((n, i) => (
            <label key={i}>
              Ruler {i + 1}
              <input value={n} onChange={(e) => setNames((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
        </div>
        <div className="section-title">House Tweaks — hover any option for what it means</div>
        <ConfigEditor cfg={cfg} onChange={setCfg} />
        <div className="btn-row" style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button className="ghost" onClick={props.onBack}>
            ← Back
          </button>
          <button className="primary" style={{ flex: 1 }} onClick={() => props.onStart(names.slice(0, count), cfg)}>
            Begin the Age ⚔
          </button>
        </div>
        {props.error && <div className="lobby-note" style={{ color: 'var(--danger)' }}>⚠ {props.error}</div>}
        {showGuide && <RulesGuide onClose={() => setShowGuide(false)} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Online lobby
// ---------------------------------------------------------------------------

export const CLASSIC_CFG: Partial<GameConfig> = {
  vpTarget: 20,
  advanced: true,
  eventFrequency: 'alternate',
  hiddenTokens: 10,
  fortSupply: 6,
  freeActions: 2,
}

export function ConfigEditor(props: { cfg: Partial<GameConfig>; onChange: (c: Partial<GameConfig>) => void }) {
  const { cfg, onChange } = props
  const set = (k: keyof GameConfig, v: unknown) => onChange({ ...cfg, [k]: v })
  return (
    <>
      <div className="presets-row">
        <button className="ghost small" onClick={() => onChange({ ...CLASSIC_CFG, advanced: false, vpTarget: 15 })}>
          🌱 Quick — Basic, 15 VP
        </button>
        <button className="ghost small" onClick={() => onChange({ ...CLASSIC_CFG })}>
          🏛 Classic — Advanced, 20 VP (recommended)
        </button>
        <button className="ghost small" onClick={() => onChange({ ...CLASSIC_CFG, eventFrequency: 'every' })}>
          🔥 Full Chaos — disasters every turn
        </button>
      </div>
      <div className="cfg-grid">
        <label title="The first ruler to reach this many victory points wins the game.">
          Victory target
          <select value={cfg.vpTarget ?? 20} onChange={(e) => set('vpTarget', Number(e.target.value))}>
            {[10, 15, 20, 25, 30, 40].map((n) => (
              <option key={n} value={n}>{n} VP</option>
            ))}
          </select>
          <span className="cfg-desc">First ruler to reach this many VP wins. Conquering a region grants its value in VP.</span>
        </label>
        <label title="Basic is economy & conquest only. Advanced adds disasters, ruler abilities and hidden treasure tokens.">
          Ruleset
          <select value={cfg.advanced ? 'adv' : 'basic'} onChange={(e) => set('advanced', e.target.value === 'adv')}>
            <option value="basic">Basic — fast & simple</option>
            <option value="adv">Advanced — full game (recommended)</option>
          </select>
          <span className="cfg-desc">Basic: economy & conquest only. Advanced: adds disasters, ruler abilities and hidden treasure.</span>
        </label>
        <label title="How often a disaster card strikes the map. Requires Advanced.">
          Events
          <select
            value={cfg.eventFrequency ?? 'alternate'}
            onChange={(e) => set('eventFrequency', e.target.value)}
            disabled={!cfg.advanced}
          >
            <option value="every">Every turn — brutal</option>
            <option value="alternate">Every 2nd round — classic</option>
            <option value="every3">Every 3rd round — gentle (4+ players)</option>
            <option value="off">Off</option>
          </select>
          <span className="cfg-desc">How often disasters (floods, riots, outbreaks…) strike the map. Big tables play best on “gentle”. Requires Advanced.</span>
        </label>
        <label title="How many forts each kingdom can plant. Conquering plants a fort; forts mark and defend your realm.">
          Forts per kingdom
          <select value={cfg.fortSupply ?? 6} onChange={(e) => set('fortSupply', Number(e.target.value))}>
            {[4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="cfg-desc">Each conquest plants one of your forts; run out and you can't conquer until you lose some back.</span>
        </label>
        <label title="Moves/conquests/battles you may take each turn before paying coins (extras cost 1 coin).">
          Free actions per turn
          <select value={cfg.freeActions ?? 2} onChange={(e) => set('freeActions', Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="cfg-desc">Marches, conquests & battles per turn before paying coins (extras cost 1 coin).</span>
        </label>
        <label title="Mystery tokens scattered on the map — search them with an army for treasure… or an ambush. Requires Advanced.">
          Hidden tokens
          <select value={cfg.hiddenTokens ?? 10} onChange={(e) => set('hiddenTokens', Number(e.target.value))} disabled={!cfg.advanced}>
            {[0, 5, 8, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="cfg-desc">Mystery tokens on the map — search them with an army for treasure… or an ambush. Requires Advanced.</span>
        </label>
      </div>
    </>
  )
}

function LobbyScreen(props: { transport: Transport; room: LobbySnapshot; error: string | null; onLeave: () => void }) {
  const { transport, room } = props
  const isHost = transport.isHost
  const [cfg, setCfg] = useState<Partial<GameConfig>>({ ...CLASSIC_CFG, ...room.cfg })
  const [showGuide, setShowGuide] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => setCfg((c) => ({ ...CLASSIC_CFG, ...c, ...room.cfg })), [room.cfg])

  const pushCfg = (c: Partial<GameConfig>) => {
    setCfg(c)
    transport.setConfig(c).catch(() => {})
  }

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="lobby-wrap">
      <div className="mandala-bg">
        <Mandala size={460} />
      </div>
      <div className="lobby-card">
        <div className="brand">
          <h1 style={{ fontSize: 32 }}>Royal Court</h1>
          <div className="room-code-row">
            <span className="room-code">{room.code}</span>
            <button className="ghost small" onClick={copyCode}>{copied ? '✓ Copied' : '📋 Copy'}</button>
          </div>
          <div className="sub">Friends: main menu → type this code → Join. Then the host presses the conch.</div>
        </div>
        <div className="section-title">Seated Rulers ({room.players.length}/8)</div>
        <div className="lobby-players">
          {room.players.map((p, i) => (
            <div key={p.seatId} className={`lobby-seat ${'filled'}`}>
              <span className="crown">{i === 0 ? '👑' : ''}</span>
              <span className="dot" style={{ ['--seat-color' as never]: SEAT_COLORS_SAFE[i] }} />
              {p.name}
              {!p.connected && <span style={{ color: 'var(--danger)' }}> (reconnecting…)</span>}
            </div>
          ))}
          {Array.from({ length: Math.max(0, Math.min(8, room.players.length + 1) - room.players.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="lobby-seat" style={{ opacity: 0.55 }}>
              open seat…
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="ghost small" onClick={() => setShowGuide(true)}>
            ❖ How to play
          </button>
        </div>
        {isHost ? (
          <>
            <div className="section-title">House Tweaks (host) — hover any option for what it means</div>
            <ConfigEditor cfg={cfg} onChange={pushCfg} />
          </>
        ) : (
          <div className="lobby-note">
            The host is tuning the age… ({room.cfg.vpTarget ?? 20} VP · {room.cfg.advanced === false ? 'basic' : 'advanced'} rules)
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button className="ghost" onClick={props.onLeave}>
            Leave
          </button>
          {isHost && (
            <button
              className="primary"
              style={{ flex: 1 }}
              title={room.players.length < 2 ? 'Need at least 2 rulers — share the code!' : undefined}
              disabled={room.players.length < 2}
              onClick={() => transport.start().catch(() => {})}
            >
              Sound the Conch — Start ⚔
            </button>
          )}
        </div>
        {room.players.length < 2 && <div className="lobby-note">Waiting for at least one more ruler…</div>}
        {props.error && <div className="lobby-note" style={{ color: 'var(--danger)' }}>⚠ {props.error}</div>}
        {showGuide && <RulesGuide onClose={() => setShowGuide(false)} />}
      </div>
    </div>
  )
}

const SEAT_COLORS_SAFE = ['#b03a2e', '#1f618d', '#1e8449', '#6c3483', '#ca6f1e', '#148f77', '#a04000', '#5d6d7e']
