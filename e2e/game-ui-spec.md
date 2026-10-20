# Bharata — Game UI Exploration Spec

> Explored on: 2026-08-31
> Environment: local — http://localhost:3001 (production build served by the game server)
> Framework: Playwright (lightweight adaptation — no Page-Object/JSON-locator layer)

## 1. Screens

| Route / state | Description |
| ------------- | ----------- |
| `/` (menu) | Mode choice: Same Screen (hot-seat), Online multiplayer; ruler name; room-code join |
| Hot-seat setup | Ruler count 2–8, per-ruler names, house tweaks (VP target, ruleset, events, forts, free actions, hidden tokens) |
| Online lobby | Room code, seated rulers, host-only tweaks, "Sound the Conch" start |
| Game screen | Topbar (round/phase steps/turn banner/VP target), SVG board, right sidebar (players + chronicle log), bottom controls (phase actions / armies / region panel) |

## 2. Key elements & locators

| Element | Locator |
| ------- | ------- |
| Same Screen mode | `getByText('Same Screen')` |
| Host Online Room | `getByText('Host Online Room')` |
| Room-code input | `getByPlaceholder('ROOM CODE')` |
| Begin the Age | `getByText('Begin the Age')` |
| Lobby heading + code | `getByText(/Royal Court — Room ([A-Z2-9]{4})/)` |
| Start online game | `getByText('Sound the Conch')` |
| Draft modal | `getByText('Shape your Ruler')`, draft items `getByText('Iron Raja')` etc., submit `getByText('Take the Throne')` |
| Phase steps | `.phase-step.on` (Resource / Actions / Events) |
| Draw resource | `getByText('📜 Draw Resource Card')` |
| Sell steppers | `.pill` groups with `+`/`−` buttons, `getByText('Sell')` |
| Buy army card | `getByText(/🛒 Buy card → Army/)` |
| To Actions | `getByText('To Actions →')` |
| Army selector | `.army-box` (contains `Army I`/`Army II`) |
| Region on board | `page.locator('g.region', { hasText: '<RegionName>' })`; move targets also carry `.moveable` |
| Conquer / Attack / Search / Remove | region panel buttons (`🏳 Conquer`, `⚔ Attack`, `🔍 Search hidden token`, `🛠 Remove event`) |
| End turn | `getByText('End Turn →')` |
| Battle commit modal | `getByText(/⚔ Battle of/)`, cards `.bcard`, commit `getByText(/Commit .* card/)` |
| Battle reveal | `getByText('⚔', { exact: false })` verdict modal → `getByText('So it is written')` |
| Event modal | `getByText(/Event drawn/)` in log; modal shows card face; target buttons are region names; skip → `getByText('finds no foothold — Continue')` |
| Prize modal | `getByText(/achieves a victory point condition/)` → two `.choice-card` |
| Game over | `getByText(/Rules Bharata/)` |

## 3. Journeys verified

1. **Hot-seat full loop** — menu → setup (2 rulers, 10 VP) → draft ×2 (personality + 2 abilities each)
   → draw resource → to actions → select army → click `.moveable` region → conquer (province direct /
   Mahajanapada card picker) or battle (commit → reveal) → end turn → event placement (targets or
   skip) → turn passes to ruler 2. Console must stay free of page errors.
2. **Online 2-browser loop** — host creates room → code extracted from lobby → guest joins with code →
   host tweaks VP target → start → both draft → host plays resource phase → guest UI reflects live
   state (sync check). Console free of page errors in both contexts.

## 4. Edge cases & gotchas

- Random draws make flows branch: after a move the region panel may show Conquer, the Mahajanapada
  card picker, or a battle modal — the tests handle all three.
- Event targeting can be empty (e.g. Riot with nothing ruled) → skip button must appear.
- Hot-seat battles can involve the *defender* seat — the device must pass (`hotseatViewSeat` routes
  to `pendingBattle.awaiting[0]`).
- Fonts load from Google Fonts; tests wait on DOM content, not networkidle.
