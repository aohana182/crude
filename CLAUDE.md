# Crude — CLAUDE.md

## Project
- Expo React Native (TypeScript) turn-based hex strategy game
- Inspired by classic "Slay" game
- 2 players: Human vs AI, factions: `coalition` vs `insurgents`
- Main entry: `app/game.tsx` → `app/index.tsx` (menu)
- Map radius: 10 (set in `game.tsx`)

## Architecture
```
lib/game/
  gameEngine.ts     — core state machine (handleHexTap, endTurn, etc.)
  aiPlayer.ts       — AI turn logic
  territoryManager.ts — territory detection, economy, defense
  hexUtils.ts       — neighbor/pixel math
  mapGenerator.ts   — island map generation
  constants.ts      — costs, strengths, colors
  types.ts          — all TypeScript interfaces

components/game/
  HexGrid.tsx       — SVG render + pan/pinch/tap gestures
  HexTile.tsx       — individual hex render
  ActionPanel.tsx   — buy unit, castle, combine, end turn
  StatusBar.tsx     — turn/player info
  GameOverlay.tsx   — game over screen

assets/sprites/     — PNG sprites per faction/tier
```

## Engineering Rules
- Think MECE and end-to-end — no gaps, no overlaps
- No hacks without explicit user approval
- Testing: design full test scenarios first → user approves → then execute
- **Commit at end of every session** — any session that changes code ends with a git commit. Run tests first, then commit with a clear message. Do not rely on memory as a substitute for git history.

## If Falling Into a Cycle
A cycle is: the same action failing twice, or 3+ steps with no meaningful progress.

**Stop immediately. Do not retry the same approach.**

1. State what you tried and what failed — one sentence each.
2. Identify the assumption that is wrong.
3. Propose a different approach, or ask the user to unblock.

Signs you are in a cycle:
- Retrying a failed command with minor variations
- Rewriting the same code block repeatedly
- Running tests that keep failing for the same reason
- Searching for a file/symbol that isn't where you expect it

The cost of pausing is zero. The cost of spinning is wasted quota and lost context.
If stuck: stop, diagnose, ask.

## Key Rules (Game Logic)
- Units: tier 0–3, strength [1,2,3,4], upkeep [2,6,18,54]
- Movement within own territory is FREE (`unitMoved` stays false); only attacks and nomad chops cost the action
- Castle defense = +2; capital capture wipes treasury
- Nomad camps spread only when 2+ adjacent nomads exist
- Territory min size = 2 hexes; smaller ones die
- AI runs synchronously inside `endTurn()`

## Known Bugs / TODO
- [ ] Game length: PRD target 20-40 turns. At radius 10 avg is ~47 turns. Close enough for now.
- [ ] Sprite rendering — army shield was reported cut/shifted (verify on device)
- [ ] UI: hex tap offset (verify on device)
- [ ] Level 2 faction asymmetry not implemented (out of scope until Level 1 validated)

## PRD Level 1 Compliance (verified 2026-03-09)
- Economy, units, upkeep, combat rules ✅
- Free movement within territory (only attacks/chops cost action) ✅ fixed
- Nomad spread, bankruptcy, graves, capitals ✅
- Win condition ✅
- Turn resolution ~7.6ms (PRD req < 200ms) ✅
- Nomad relocation visual feedback ✅ (sprite disappears)
- Game length: ❌ ~51-58 turns vs PRD 20-40 (architectural — see above)

