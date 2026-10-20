import React from 'react'
import { ABILITIES, PERSONALITIES } from '../../shared/data'
import { Ico } from './icons'

export function RulesGuide(props: { onClose?: () => void }) {
  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div className="modal rules-guide" onClick={(e) => e.stopPropagation()}>
        <h2>📜 How to play Bharata</h2>
        <div className="sub">A five-minute read — everything a new ruler needs before taking the throne.</div>

        <h3>Your goal</h3>
        <p>
          Rule the richest realm of ancient Bharata. Every region you conquer is worth its number in{' '}
          <b>victory points (VP)</b> — the value badge on the map. First ruler to the VP target (20 by default,
          25 in a duel) wins the age. Regions change hands: conquering one that another ruler holds{' '}
          <b>steals its VP</b> from them.
        </p>

        <h3>A turn in three phases</h3>
        <ol>
          <li>
            <b>Resource</b> — draw & flip one resource card; <i>every</i> ruler gains what it grants. Then (only
            you): sell resources for coins (2 resources = 1 coin), sell trade objects for 2 coins each if you
            rule an export harbor ⚓, and recruit army cards (3 coins each) into Army I or II.
          </li>
          <li>
            <b>Actions</b> — take 2 free actions (extras cost 1 coin):
            <ul>
              <li><b>March</b> an army to a neighboring region.</li>
              <li><b>Conquer</b> a region where your army stands — pay its value in coins (provinces) or army cards (Mahajanapadas). Plant your fort, gain its VP, yields and trade.</li>
              <li><b>Battle</b> — march into enemy-held ground and both sides secretly commit army cards; the defender adds the region's value as terrain. Highest total wins; committed cards are spent either way.</li>
              <li><b>Search</b> (Advanced) — reveal a hidden token ❓ where your army stands.</li>
            </ul>
          </li>
          <li>
            <b>Events</b> (Advanced) — a disaster card strikes the map. The ruler of an afflicted region must
            spend 1 action + resources to clear it; a ignored <b>riot topples the fort</b>.
          </li>
        </ol>

        <h3>Reading the map</h3>
        <p className="legend">
          <span>🔢 region value = VP = conquer cost = terrain bonus</span>
          <span>⭐ historical capital (your start city)</span>
          <span>🚩 fort — marks who rules the region</span>
          <span>❓ hidden token — treasure or ambush</span>
          <span>⚓ export harbor — lets you sell trade objects</span>
          <span>blue lines = rivers (floods strike here)</span>
          <span>discs = armies (I / II, with their power)</span>
        </p>
        <p className="legend">
          <span><Ico kind="coin" title="coins"/> coins</span>
          <span><Ico kind="iron" title="iron"/> iron</span>
          <span><Ico kind="wood" title="wood"/> wood</span>
          <span><Ico kind="food" title="food"/> food</span>
          <span><Ico kind="trade" title="trade goods"/> trade goods</span>
          <span><Ico kind="medicine" title="medicine"/> medicine</span>
          <span><Ico kind="sword" title="battles won"/> battles won</span>
          <span><Ico kind="action" title="actions"/> actions</span>
          <span>Mahajanapada = a Great Kingdom (paid in army cards) · Province = paid in coins</span>
        </p>

        <h3>Your two armies</h3>
        <p>
          Each ruler commands two armies as separate battle hands — Army I starts with your two beginning
          cards, Army II starts empty until you reinforce it. If an army loses all its cards it is destroyed,
          and respawns at your capital when you reinforce it again. Lose your capital? Retake it first.
        </p>

        <h3>Your ruler (drafted at setup)</h3>
        <p>
          Every ruler drafts one permanent <b>personality</b>, and in Advanced mode two <b>abilities</b> (2 uses
          each, several grant immunity to disasters). This choice is permanent — pick the style you want to
          play: economy, war, or survival.
        </p>
        <div className="mini-grid">
          {Object.values(PERSONALITIES).map((p) => (
            <div key={p.id} className="mini-card"><b>{p.name}</b><br/>{p.desc}</div>
          ))}
        </div>

        <h3>Disasters & defense (Advanced)</h3>
        <p>
          Floods 🌊 strike river regions, outbreaks 🐀 where armies stand, riots 🔥 anywhere ruled, sea storms ⚡
          on harbors… Afflicted rulers can also clear disasters with coins if short on resources, or prevent
          them entirely with the right ability. Hidden tokens may hold medicine 🌿 — an instant cure.
        </p>
        <div className="mini-grid">
          {Object.values(ABILITIES).map((a) => (
            <div key={a.id} className="mini-card"><b>{a.name} ({a.uses} uses)</b><br/>{a.desc}</div>
          ))}
        </div>

        <h3>Play modes</h3>
        <p>
          <b>Same Screen</b> — pass one device around the table (2–8 rulers; with 5–8, partners co-rule a
          kingdom, each commanding one army). <b>Online</b> — one ruler hosts a room, shares the 4-letter code,
          and everyone plays live from their own browser.
        </p>
        <p className="hint">Learn as you play — every screen tells you what to do next, and the Rules button is always in the top bar.</p>

        {props.onClose && (
          <div className="btn-row">
            <button className="primary" onClick={props.onClose}>To the battlefield</button>
          </div>
        )}
      </div>
    </div>
  )
}
