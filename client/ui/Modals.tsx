import React, { useMemo, useState } from 'react'
import { ABILITIES, CONDITIONS, EVENT_CARDS, HIDDEN_TOKEN_LABEL, PERSONALITIES, REGIONS } from '../../shared/data'
import type { AbilityId, GameState, PersonalityId } from '../../shared/types'
import type { Transport } from '../transport'

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export function DraftModal(props: { state: GameState; seatId: string; onSubmit: (p: PersonalityId, ab: AbilityId[]) => void }) {
  const { state, seatId } = props
  const [personality, setPersonality] = useState<PersonalityId | null>(null)
  const [abilities, setAbilities] = useState<AbilityId[]>([])
  const seat = state.seats[seatId]
  const others = Object.values(state.seats).filter((s) => s.id !== seatId && s.personality)

  const toggleAbility = (id: AbilityId) => {
    setAbilities((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1], id] : [...cur, id]))
  }

  const canSubmit = personality && (!state.config.advanced || abilities.length === 2)

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Shape your Ruler</h2>
        <div className="sub">
          {seat.name}, ruler of the Kingdom of {state.kingdoms[seat.kingdomId].name} — choose a personality
          {state.config.advanced ? ' and two abilities (each usable twice per game).' : '.'}
        </div>

        <div className="section-title">Personality</div>
        <div className="draft-grid">
          {Object.values(PERSONALITIES).map((p) => (
            <button key={p.id} className={`draft-item ${personality === p.id ? 'selected' : ''}`} onClick={() => setPersonality(p.id)}>
              <b>{p.name}</b>
              <br />
              {p.desc}
            </button>
          ))}
        </div>

        {state.config.advanced && (
          <>
            <div className="section-title">Abilities — pick 2 ({abilities.length}/2)</div>
            <div className="draft-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {Object.values(ABILITIES).map((a) => (
                <button
                  key={a.id}
                  className={`draft-item ${abilities.includes(a.id) ? 'selected' : ''}`}
                  onClick={() => toggleAbility(a.id)}
                >
                  <span className="uses">2 uses</span>
                  <b>{a.name}</b>
                  <br />
                  {a.desc}
                </button>
              ))}
            </div>
          </>
        )}

        {others.length > 0 && (
          <div className="sub" style={{ marginTop: 14 }}>
            Already sworn in: {others.map((s) => `${s.name} (${PERSONALITIES[s.personality!].name})`).join(', ')}
          </div>
        )}

        <div className="btn-row">
          <button className="primary" disabled={!canSubmit} onClick={() => personality && props.onSubmit(personality, abilities)}>
            Take the Throne
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Battle commit
// ---------------------------------------------------------------------------

export function BattleCommitModal(props: {
  state: GameState
  mySeatId: string
  onCommit: (cards: { armyId: 1 | 2; cardId: string }[], useStrategist: boolean) => void
}) {
  const { state, mySeatId } = props
  const battle = state.pendingBattle!
  const [picked, setPicked] = useState<string[]>([])
  const [strategist, setStrategist] = useState(false)
  const region = REGIONS[battle.regionId]
  const isAttacker = battle.attackerSeat === mySeatId
  const me = state.seats[mySeatId]
  const myArmies = state.armies.filter((a) => a.ownerId === mySeatId && a.alive)
  const defBonus = state.regionControl[battle.regionId] === state.seats[battle.defenderSeat].kingdomId ? region.value : 0

  const toggle = (armyId: 1 | 2, cardId: string) => {
    setPicked((cur) => {
      if (cur.includes(cardId)) return cur.filter((x) => x !== cardId)
      // defender commits from a single army
      if (!isAttacker && cur.length > 0) {
        const firstArmy = myArmies.find((a) => a.cards.some((c) => c.id === cur[0]))?.armyId
        if (firstArmy !== undefined && firstArmy !== armyId) return [cardId]
      }
      return [...cur, cardId]
    })
  }

  const total =
    myArmies.flatMap((a) => a.cards.filter((c) => picked.includes(c.id)).map((c) => c.value)).reduce((t, v) => t + v, 0) +
    (strategist ? 3 : 0) +
    (me.personality === 'war_elephants' ? 2 : 0) +
    (!isAttacker ? defBonus : 0)

  const enemyName = isAttacker ? state.seats[battle.defenderSeat].name : state.seats[battle.attackerSeat].name
  const hasStrategist = (me.abilityUsesLeft['strategist'] ?? 0) > 0

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>⚔ Battle of {region.name}</h2>
        <div className="sub">
          You are the <b>{isAttacker ? 'attacker' : 'defender'}</b> against {enemyName}. Commit any number of battle
          cards secretly{!isAttacker ? ' — from a single army' : ' — from one or both armies'}. Committed cards are spent
          whatever the outcome.
          {!isAttacker && defBonus > 0 && (
            <>
              {' '}
              As ruler of the region you add <b>+{defBonus} terrain</b>.
            </>
          )}
        </div>

        {myArmies.map((army) => (
          <div key={army.id} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700 }}>
              Army {army.armyId === 1 ? 'I' : 'II'} — power {army.cards.reduce((t, c) => t + c.value, 0)}
            </div>
            <div className="battle-cards">
              {army.cards.map((c) => (
                <div
                  key={c.id}
                  className={`bcard ${picked.includes(c.id) ? 'picked' : ''}`}
                  onClick={() => toggle(army.armyId, c.id)}
                >
                  {c.value}
                  <small>commit</small>
                </div>
              ))}
            </div>
          </div>
        ))}

        {hasStrategist && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
            <input type="checkbox" checked={strategist} onChange={(e) => setStrategist(e.target.checked)} />
            Declare Strategist (+3) — {me.abilityUsesLeft['strategist']} use(s) left
          </label>
        )}

        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 18 }}>
          Your total: <b>{total}</b>
          {!isAttacker && defBonus > 0 ? ' (terrain included)' : ''}
        </div>

        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="verdict-btn" onClick={() => props.onCommit(buildCommit(myArmies, picked), strategist)}>
            Commit {picked.length} card{picked.length === 1 ? '' : 's'} in Secret
          </button>
        </div>
      </div>
    </div>
  )
}

function buildCommit(
  armies: { armyId: 1 | 2; cards: { id: string }[] }[],
  picked: string[],
): { armyId: 1 | 2; cardId: string }[] {
  const out: { armyId: 1 | 2; cardId: string }[] = []
  for (const a of armies) {
    for (const c of a.cards) {
      if (picked.includes(c.id)) out.push({ armyId: a.armyId, cardId: c.id })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Battle reveal
// ---------------------------------------------------------------------------

export function BattleRevealModal(props: { state: GameState; onDismiss: () => void }) {
  const battle = props.state.lastBattle!
  const res = battle.resolved!
  const region = REGIONS[battle.regionId]
  const winnerName = props.state.seats[res.winnerSeat]?.name ?? '—'
  const atkName = props.state.seats[battle.attackerSeat]?.name
  const defName = props.state.seats[battle.defenderSeat]?.name
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ textAlign: 'center' }}>
        <h2>⚔ {region.name} — The Verdict</h2>
        <div className="battle-totals">
          <div className={`tot ${res.winnerSeat === battle.attackerSeat ? 'win' : ''}`}>
            <div className="n">{res.attackerTotal}</div>
            <div>{atkName}</div>
            <div style={{ fontSize: 13, color: '#5c452a' }}>attacker</div>
          </div>
          <div className={`tot ${res.winnerSeat === battle.defenderSeat ? 'win' : ''}`}>
            <div className="n">{res.defenderTotal}</div>
            <div>{defName}</div>
            <div style={{ fontSize: 13, color: '#5c452a' }}>
              defender{res.defenderBonus ? ` (+${res.defenderBonus} terrain)` : ''}
            </div>
          </div>
        </div>
        <div style={{ margin: '10px 0' }}>
          {res.cards.map((c, i) => (
            <span
              key={i}
              className="bcard"
              style={{ display: 'inline-flex', margin: 3, cursor: 'default', borderColor: props.state.seats[c.seatId]?.color }}
            >
              {c.value}
              <small>{props.state.seats[c.seatId]?.name.split(' ')[0]}</small>
            </span>
          ))}
        </div>
        <h3 style={{ margin: '10px 0' }}>
          {res.winnerSeat === battle.attackerSeat ? `${atkName} carries the field!` : `${defName} holds the ground!`}
        </h3>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="verdict-btn" onClick={props.onDismiss}>
            So it is written
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Event placement
// ---------------------------------------------------------------------------

export { eventTargetsFor } from '../../shared/engine'
import { eventTargetsFor as _eventTargetsFor } from '../../shared/engine'

export function EventModal(props: { state: GameState; mySeatId: string; onTarget: (rid: string) => void; onSeer: () => void }) {
  const { state, mySeatId } = props
  const pe = state.pendingEventPlacement!
  const card = pe.card
  const targets = useMemo(() => _eventTargetsFor(state, mySeatId), [state, mySeatId])
  const isPlacer = state.activeSeat === mySeatId
  const placerName = state.seats[state.activeSeat]?.name

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="event-card-face">
          <div className="icon">{card.icon}</div>
          <h3>{card.name}</h3>
          <p>{card.text}</p>
        </div>
        {isPlacer ? (
          <>
            <div className="sub">
              {targets.size === 1
                ? 'The only legal target is highlighted below — the omen must land there.'
                : `Choose where it strikes — ${pe.targetsLeft} target${pe.targetsLeft === 1 ? '' : 's'} left. These region buttons are the only legal targets.`}
            </div>
            <div className="actions-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[...targets].map((rid) => (
                <button key={rid} className="ghost small" onClick={() => props.onTarget(rid)}>
                  {REGIONS[rid].name}
                </button>
              ))}
            </div>
            {targets.size === 0 && (
              <div className="btn-row">
                <button className="primary" onClick={() => props.onTarget('__skip__')}>
                  The omen finds no foothold — Continue
                </button>
              </div>
            )}
            {immuneRulerNames(pe.card.kind, state).length > 0 && (
              <div className="hint" style={{ marginTop: 10 }}>
                🛡 Spared by immunity: {immuneRulerNames(pe.card.kind, state).join(', ')}.
              </div>
            )}
          </>
        ) : (
          <div className="sub">
            {placerName} must place this omen{pe.targetsLeft > 0 ? ` (${pe.targetsLeft} target(s) left)` : ''}…
          </div>
        )}
        {isPlacer && (state.seats[mySeatId].abilityUsesLeft['seer'] ?? 0) > 0 && pe.placed === 0 && (
          <div className="btn-row">
            <button className="ghost" onClick={props.onSeer}>
              🔮 Use the Seer — avert this omen ({state.seats[mySeatId].abilityUsesLeft['seer']} left)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function immuneRulerNames(kind: string, state: GameState): string[] {
  const out: string[] = []
  for (const s of Object.values(state.seats)) {
    if (s.abilities.some((ab) => (ABILITIES[ab].immuneTo ?? []).includes(kind))) {
      out.push(`${s.name} (${ABILITIES[s.abilities.find((ab) => (ABILITIES[ab].immuneTo ?? []).includes(kind))!].name})`)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Prize (VP condition) choice
// ---------------------------------------------------------------------------

export function PrizeModal(props: { state: GameState; onChoose: (i: number) => void }) {
  const pp = props.state.pendingPrize!
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>🏆 {pp.reason}</h2>
        <div className="sub">
          {props.state.seats[pp.seatId].name} achieves a victory point condition and draws the prize card{' '}
          <b>“{pp.card.title}”</b> — choose one:
        </div>
        <div className="choice-grid">
          {pp.card.options.map((o, i) => (
            <button key={i} className="choice-card" onClick={() => props.onChoose(i)}>
              <h4>{o.text}</h4>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

export function GameOverModal(props: { state: GameState; onAgain: () => void; onLeave: () => void }) {
  const standings = Object.values(props.state.seats).sort((a, b) => b.vp - a.vp)
  return (
    <div className="modal-backdrop lite">
      <div className="modal" style={{ textAlign: 'center' }}>
        <h2>{props.state.seats[props.state.winner!]?.name} Rules Bharata</h2>
        <div className="sub">The age of the Mahajanapadas has found its predominant power.</div>
        <table className="final-table" style={{ margin: '12px auto' }}>
          <thead>
            <tr>
              <th>Ruler</th>
              <th>Kingdom</th>
              <th>VP</th>
              <th>Regions</th>
              <th>Battles won</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className="pc-dot" style={{ display: 'inline-block', background: s.color, marginRight: 6 }} />
                  {s.name}
                </td>
                <td>{props.state.kingdoms[s.kingdomId].name}</td>
                <td>
                  <b>{s.vp}</b>
                </td>
                <td>{Object.values(props.state.kingdoms[s.kingdomId].forts).filter((k) => k === s.kingdomId).length}</td>
                <td>{s.winsBattles}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={props.onAgain}>
            Play Again
          </button>
          <button className="ghost" onClick={props.onLeave}>
            Leave the Table
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

export function HelpModal(props: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>How Bharata is Played</h2>
        <div className="sub">Each turn has three phases. First ruler to the VP target wins.</div>
        <ol style={{ lineHeight: 1.5, paddingLeft: 20 }}>
          <li>
            <b>Resource Phase</b> — draw & flip one resource card; <i>all</i> players gain what it grants. Then (only
            you): sell resources for coins (2:1), sell trade objects (2 coins each, needs an export harbor ⚓), buy army
            cards (3 coins) into Army I or II.
          </li>
          <li>
            <b>Action Phase</b> — two free actions (more cost 1 coin each):
            <ul>
              <li><b>Move</b> an army to a neighboring region.</li>
              <li><b>Conquer</b> a region where your army stands: provinces cost coins, Mahajanapadas cost army cards (both = the region's number). Place a fort, gain its VP value, its yields and trade.</li>
              <li><b>Battle</b> — enter a region held by an enemy army; both sides secretly commit army cards, reveal together; the defender adds the region's value. Highest total wins; committed cards are spent; the loser's army retreats (or dies if out of cards).</li>
              <li><b>Search</b> (advanced) — reveal a hidden token where your army stands.</li>
            </ul>
          </li>
          <li>
            <b>Event Phase</b> (advanced) — draw an event; place its token where the card says. Rulers of afflicted
            regions must spend an action + resources to remove it (riots topple forts if ignored). Abilities grant
            immunities and powers (2 uses each).
          </li>
        </ol>
        <div style={{ marginTop: 10 }}>
          {CONDITIONS.map((c) => (
            <div key={c.id}>🏆 <b>{c.title}</b> — {c.desc}</div>
          ))}
        </div>
        <div className="btn-row">
          <button className="primary" onClick={props.onClose}>
            Understood
          </button>
        </div>
      </div>
    </div>
  )
}

export function HiddenTokenToast(props: { label: string; onClose: () => void }) {
  void HIDDEN_TOKEN_LABEL
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal" style={{ textAlign: 'center', width: 340 }}>
        <h2>🔍 The Search</h2>
        <p style={{ fontSize: 20 }}>{props.label}</p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="primary" onClick={props.onClose}>
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

export type { Transport }
