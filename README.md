# Crude

A turn-based hex territory strategy game for Android, built with Expo React Native. Inspired by the classic Slay game.

## Gameplay

Two factions fight for control of an oil-rich desert island. Capture territory, manage your economy, and crush your opponent.

- **Coalition** (blue) vs **Insurgents** (brown)
- Buy units, build castles, combine units into stronger tiers
- Each territory earns oil per turn; units cost upkeep
- Go bankrupt → your units die
- Capture all enemy territory to win

### Units

| Tier | Coalition | Insurgents | Upkeep | Strength |
|------|-----------|------------|--------|----------|
| 1 | Private | Fedayeen | 2 | 1 |
| 2 | Sergeant | Jihadi | 6 | 2 |
| 3 | Lieutenant | Takfiri | 18 | 3 |
| 4 | Major | Salafi | 54 | 4 |

Combine two same-tier units → next tier. Movement within your territory is free. Attacks and nomad clearing cost your action for that unit.

## Running

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go (Android).

## Project Structure

```
lib/game/
  gameEngine.ts        — core state machine
  aiPlayer.ts          — AI logic
  territoryManager.ts  — territory detection, economy, defense
  mapGenerator.ts      — island map generation
  hexUtils.ts          — hex math
  constants.ts         — game constants
  types.ts             — TypeScript types

components/game/
  HexGrid.tsx          — SVG map + gestures + sprite overlay
  HexTile.tsx          — per-hex SVG polygon + indicators
  ActionPanel.tsx      — buy, combine, end turn UI
  StatusBar.tsx        — turn/player info
  GameOverlay.tsx      — game over screen

assets/sprites/        — PNG sprites (units, buildings, capitals)
__tests__/             — Jest test suite (93 tests)
```

## Tech Stack

- Expo SDK 54 / React Native 0.81
- react-native-svg 15 (map rendering)
- react-native-gesture-handler (pan/pinch/tap)
- Jest + ts-jest (unit + simulation tests)
