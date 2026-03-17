# Changelog

## v1.2.0 — 2026-03-17

### Features
- New map generator: 4-octave noise island shape, inland lakes, forest clusters, neutral castles
- Scattered starting positions: 3 separate territory clusters per player (classic Slay style), not one large blob
- Unit names: Coalition → Private / Sergeant / Lieutenant / Major; Insurgents → Fedayeen / Jihadi / Takfiri / Salafi
- New sprites: faction capitals, neutral castle, full unit set

### Fixes
- AI combine exploit: AI could reach tier-3 units by turn 3 by chain-combining without `unitMoved` guard — fixed
- Cut-off units not dying: after splitting enemy territory, treasury sync duplicated funds into all fragments instead of applying split rules — fixed
- Double capital on territory merge: merging two territories left both capitals active — fixed
- Sprite checkerboard backgrounds on Android: `react-native-svg` SvgImage does not composite PNG alpha correctly on Android; moved all sprite rendering to a React Native Image overlay layer above the SVG
- Capital and neutral castle sprites had opaque gray backgrounds baked into pixel data — replaced with properly transparent 128×128 assets

### Technical
- All sprites now rendered as React Native `Image` components in an absolute-positioned overlay in HexGrid, scaling correctly with pan/zoom
- Individual per-unit PNG files used instead of sprite sheet (no ClipPath needed)
- HexTile simplified to SVG-only (polygon + indicators); removed `factions`/`currentPlayer` props
- 93/93 tests passing

---

## v1.1.0 — 2026-03-09

### Features
- Free movement within own territory (no action cost); only attacks and nomad clearing cost the unit's turn
- Starting territory increased from 15% to 20% of map
- Map radius set to 10 (down from 13) — faster games

### Fixes
- AI draw rate: 70% → 0% after free movement fix
- Fisher-Yates shuffle corrected in two places in mapGenerator.ts
- Combine mode bug: combineMode was not reset at all tap sites in gameEngine.ts
- Purchase highlights: only showed affordable territory hexes, not all owned hexes

### Technical
- PRD Level 1 full compliance verified
- Turn resolution ~7.6ms (requirement: < 200ms)
- Unmoved-units indicator dot added to END TURN button

---

## v1.0.0 — 2026-03-08

### Features
- Core Slay mechanics: territory economy, 4-tier units, upkeep, bankruptcy, graves, nomad spread
- Deterministic combat: attacker wins on equal strength
- Castle defense (+2), capital capture wipes treasury
- Territory min size = 2 hexes; smaller fragments die
- AI player: expansion, unit purchasing, combining, nomad clearing
- Pan/pinch/tap gesture map with zoom
- 88 tests passing
