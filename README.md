# भारत · BHARATA 600 BC — Online

A faithful web adaptation of **Bharata 600 BC** (GoIndia Games) — the strategy board game of the
16 Mahajanapadas. Rule a kingdom of ancient Bharata: draw the resources of the land, coin them into
armies, conquer provinces and Great Kingdoms, defend your forts against rivals, disasters and riots —
and be the first to the victory target.

Supports **2–8 rulers** (2–4 solo kingdoms, 5–8 as co-ruled kingdoms), in two modes:

- **⚔️ Online multiplayer** — host a room, share the 4-letter code, play live with friends anywhere.
- **🛕 Same screen (hot-seat)** — pass-and-play on one device; the engine runs locally.

---

## Quick start

```bash
npm install

# development (server on :3001 + vite dev client on :5173)
npm run dev

# production (build once, serve everything from :3001)
npm start          # = vite build + node server, PORT env supported
```

Open http://localhost:5173 (dev) or http://localhost:3001 (prod), pick a mode, and rule.

## Hosting it for friends

Any Node 18+ host works — the server is a single process serving both the API and the built client.

- **VPS / your machine:** `npm run build && PORT=3001 npm run serve`, open/forward port 3001.
  For friends on other networks, expose it via your favourite tunnel (cloudflared, tailscale funnel,
  ngrok) or a $5 VPS (Render, Railway, Fly.io — set `npm run serve` as the start command, build
  command `npm run build`).
- Share the **room code** shown in the lobby; players join from the main menu → *Join*.
- Reconnects are safe: each browser keeps a player key and rejoins into its seat automatically.

## How the game maps to the physical board

| Physical component | Web adaptation |
| --- | --- |
| Map of Bharata (provinces + 16 Mahajanapadas) | 38-region map with historical realms, rivers, export harbors (⚓), capitals (⭐) |
| Player tracker (VP / iron / wood / food) | Live tracker in every player card, capped at 10 (tweakable) |
| Resource modifier deck | 24-card deck; flips publicly, **all rulers gain** its grants, then the active court trades |
| Coins & selling | Sell resources 2:1 for coins (tweakable); trade objects 2 coins each **if you control a harbor** |
| Army cards (Army I & II) | Buy cards (3 coins) into either army; army stacks are public (like face-up cards) |
| 2 free actions, 3rd+ costs 1 coin | Enforced exactly; buy extra actions with coins |
| Move / conquer / battle | Move = 1 region; conquer = pay the region's number (coins for provinces, army cards for Mahajanapadas); battle = secret simultaneous commit, defender adds terrain value |
| Forts & VP | Conquering places a fort, gains the region's value in VP plus its yields/trade; seizing a ruled region **steals** those VPs (tweakable) |
| Army loss & respawn | Lose all battle cards → army destroyed; respawn at capital when you reinforce (or rise in rebellion if you hold nothing) |
| Personality cards | 6 personalities drafted at setup (permanent perks) |
| VP condition prize cards | 6 conditions auto-checked at end of turn → draw a prize card, choose 1 of 2 boons |
| Advanced: events | Floods, outbreaks, locusts, riots, droughts, sandstorms, sea storms placed on the map; afflicted rulers must spend an action + resources to clear them (ignored riots topple forts) |
| Advanced: ability cards | 8 abilities, 2 uses each, several grant event immunity |
| Advanced: hidden tokens | 10 tokens hidden on the map; search with an army — VPs, coins, trade, medicine… or an ambush |

### Documented adaptations (house choices where the physical rules are ambiguous)

- Committed battle cards are spent permanently (per "lose all battle cards → lose the army").
- Battle ties go to the defender; losing armies retreat to their capital (tweak: destroyed instead).
- Defense bonus applies when the defender's kingdom rules the region.
- Mahajanapada conquest payment comes from your army card stacks.
- A player with zero armies and a lost capital rises in rebellion at the capital when reinforcing.
- 5–8 players: co-rulers share a kingdom's banners and forts; each commands one army and their own court.
- Events that find no legal target pass without effect.

## Tweaks (host configures before start)

Every option carries a plain-language description on the setup screens (hover for tooltips), plus
presets: **🌱 Quick** (Basic, 15 VP), **🏛 Classic** (Advanced, 20 VP — recommended), **🔥 Full Chaos**
(disasters every turn).

- Victory target (10–40 VP; defaults: 20, 25 for duels, +5 per extra team)
- Basic vs Advanced rules; event frequency (every turn / every 2nd / every 3rd / off — 4+ rulers
  default to every 3rd round)
- Forts per kingdom, free actions per turn, hidden token count
- (More constants — sell rate, card cost, resource cap, VP steal, affliction strictness, retreat
  policy — are engine defaults in `shared/engine.ts → DEFAULT_CONFIG`.)

A **📜 How to play** guide lives on the start page, the setup screens, the lobby, and behind the
in-game Rules button: goal, the three phases, war & terrain, reading the map and icons, personalities
& abilities, and what every tweak means.

## Balance & integrity notes (from automated playtesting)

- Events default to every 3rd round at 4+ players; max 2 tokens per region; most disasters clear
  for 1 resource, and any can be cleared with coins (3 per missing resource, min 3).
- Armies with no battle cards cannot march into enemy-held ground; a defender beaten at their own
  capital is destroyed rather than "retreating" in place; ANY army that spends its last card
  disbands, winner or loser.
- Iron has a sink: ⚒ Forge an army card for 2 iron + 1 coin (a coin-strapped conqueror's buy).
- Defender terrain bonus is capped at +3 (walls don't stop a horde); each battle won grants +1 VP
  so the martial path stays live. Army stacks hold at most 10 cards.
- VP-condition thresholds: Empire 5 regions, Warlord 1 battle win, Magnate 15 coins, Grand
  Stockpile 9 of a resource; prize VP trimmed so condition-farming doesn't dominate conquest.
- Server hardening: 5-character room codes, per-IP failed-join throttling, host-config whitelisting
  and clamping, RNG state never sent to clients, hidden-token contents masked, battle/commit
  validation before any mutation.
- Disconnects never stall the table: a dropped ruler's seat auto-plays minimal actions (draw,
  clear afflictions, commit one card, pass) after a grace period. Seats are reclaimed by secret
  seat tokens (stored per browser; the menu offers ↻ Rejoin), so nobody can hijack a throne.
- The last march can be rolled back with ↺ Undo march — until anything else happens on the table.
- Cross-origin socket access is closed by default (the server serves its own client); hosted
  deployments can open selected origins with `ALLOWED_ORIGINS="https://a.example,…"`.
- The whole interface is hand-drawn SVG/CSS art — manuscript grain, ocean waves, compass rose,
  ornate frames, silk-sheen cards, mandala watermark — no image assets, crisp at any zoom.

## Project structure

```
shared/    rules engine + all game data (pure TS, used by server AND hot-seat client)
server/    Express + Socket.IO room manager (authoritative)
client/    React UI: menu, lobby, SVG board, dashboards, battle/event/draft modals
scripts/   headless playthroughs: npm run sim · npm run sim:variants · npm run e2e
```

## Testing

```bash
npm run typecheck       # strict TS across client+server+shared
npm run sim             # full 2P advanced game driven by bots, with invariant asserts
npm run sim:variants    # basic 3P, team 7P, 8P configs
npm run sim:invariants  # deck/resource/board invariants checked after EVERY action
npm run sim:logic4p     # 4 distinct-strategy bots, 4P+6P playtest harness
npm run e2e             # real socket clients: create/join/config/start/draft/act/rejoin (needs server up)
npm run test:ui         # Playwright UI journeys: hot-seat full loop + online 2-browser sync
```

*"Players have a great level of control over their play style and outcome — opt in or out of combat,
objectives, competition or collaboration."* — the designers' intent, kept intact here.
