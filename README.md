# Crude — Hex Strategy

A turn-based hex strategy game for mobile, built with Expo React Native.
Inspired by the classic [Slay](http://www.windowsgames.co.uk/slay.html) by Sean O'Connor.

**This project is vibe coded.** Built entirely through AI-human collaboration (Claude Code) — no traditional dev team. From game logic and map generation to AI and UI, every system was designed and iterated with AI assistance.

---

## Concept

Two factions fight for control of an oil-rich island. Capture hexes, build units, expand your territory, and bankrupt your opponent.

- **Factions:** Coalition vs Insurgents
- **Map:** Procedurally generated island (organic shape, no two games alike)
- **Economy:** Hex income → treasury → units and castles
- **Units:** 4 tiers, combine two same-tier units to promote
- **Neutral threats:** Nomad camps spread and harass undefended land

### Units

| Tier | Coalition | Insurgents | Upkeep | Strength |
|------|-----------|------------|--------|----------|
| 1 | Private | Fedayeen | 2 | 1 |
| 2 | Sergeant | Jihadi | 6 | 2 |
| 3 | Lieutenant | Takfiri | 18 | 3 |
| 4 | Major | Salafi | 54 | 4 |

Movement within your territory is free. Attacks and nomad clearing cost the unit's action for that turn.

---

## Status: v0.1 — Playable Prototype

Core gameplay is complete:

- Full economy loop (income, upkeep, bankruptcy, graves)
- Combat, territory splitting and merging
- Neutral castle capture
- Nomad camp spread mechanics
- Human vs AI

---

## Looking for Partners

This project is looking for collaborators to take it from playable prototype to polished product. Open areas:

**Graphics & Art**
Current sprites are functional but need a proper visual identity. Looking for someone to create a cohesive style — units, terrain, UI elements.

**Difficulty Levels**
The AI plays at a single fixed level. Need Easy / Normal / Hard / Brutal with meaningfully different behaviour.

**New Mechanics**
Ideas on the table:
- Faction asymmetry (coalition and insurgents play differently)
- Fog of war
- Resource types beyond oil
- Campaign / scenario mode
- Multiplayer (local pass-and-play or async)

If you're interested, open an issue or reach out directly.

---

## Running Locally

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go (Android/iOS) or run on a simulator.

---

## Project Structure

```
lib/game/          — game logic (engine, AI, territory, map generation)
components/game/   — UI components (hex grid, action panel, overlays)
assets/sprites/    — unit and building sprites
scripts/           — sprite processing tools (background removal, scaling)
```

---

## Tech Stack

- Expo SDK 54 / React Native 0.81.5
- TypeScript
- react-native-svg (hex grid rendering)
- react-native-gesture-handler (pan, pinch, tap)
- Custom seeded map generator with organic island shapes
- Synchronous AI engine (~8ms per turn)
