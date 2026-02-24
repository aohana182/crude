# Hex Command

## Version History

### V1 — Stable (February 22, 2026) — Commit: 2de5290
Core gameplay complete and tested on Android + Web:
- Two factions (Army / Insurgents) with 4-tier unit system
- Procedurally generated hexagonal island maps with neutral territory
- Unit selection, movement, combat, merging, and purchasing (peasants + castles)
- AI opponent with expansion, attack, and economy logic
- Pinch-to-zoom (centers on pinch point), pan, and tap interactions
- Touch system uses react-native-gesture-handler Gesture API (Tap, Pan, Pinch)
- Oil barrel economy with income, upkeep, bankruptcy, gravestones, tree growth

## Overview

Hex Command is a turn-based strategy game built as a cross-platform mobile/web application using Expo (React Native). Players choose between two factions (Army or Insurgents) and compete on a procedurally generated hexagonal island map. The game features territory control, unit purchasing with tiered units, treasury/economy management, and AI opponents. The app has an Express backend server, though the core game logic runs client-side.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend (Expo / React Native)

- **Framework**: Expo SDK 54 with React Native 0.81, targeting iOS, Android, and Web
- **Routing**: expo-router with file-based routing (`app/` directory). Two main screens: `index.tsx` (main menu with faction picker) and `game.tsx` (the game screen)
- **State Management**: Game state is managed locally with React `useState` in the game screen. No global state store — the `GameState` object is passed down as props to child components
- **Data Fetching**: TanStack React Query with a custom `apiRequest` helper that resolves the API URL from `EXPO_PUBLIC_DOMAIN` environment variable
- **Fonts**: Rajdhani font family loaded via `@expo-google-fonts/rajdhani`
- **UI Libraries**: react-native-svg for hex grid rendering, expo-linear-gradient for backgrounds, @expo/vector-icons for icons, react-native-gesture-handler and react-native-reanimated for interactions

### Game Engine (`lib/game/`) — Authentic Slay Mechanics

The game logic is entirely client-side and implements authentic Slay rules:

- **Purchase System**: Only peasants (10 barrels) and castles (15 barrels) can be bought directly. Higher tier units are created EXCLUSIVELY by combining existing units (two tier-1 units = one tier-2, etc.)
- **Economy**: Currency is oil barrels (bbl). Income = 1 barrel per clear hex (trees block income). Unit upkeep: [2, 6, 18, 54] (exponential). Peasants cost 10bbl, Castles cost 15bbl (0 upkeep)
- **Castles**: Permanent defensive structures, cost 15bbl, zero upkeep, defend at spearman strength (2), cannot move, block tree growth
- **Neutral Territory**: Map starts with only ~15% land assigned to players, rest is neutral (brown) for expansion
- **Free Movement**: Units move freely within their own territory (connected hexes). Only attacks/tree chops consume the unit's action for the turn
- **Defense Zones**: A hex's defense = max strength of: unit on hex, adjacent units in same territory, adjacent capital (strength 1), adjacent castle (strength 2). Attacker must STRICTLY exceed defense to win
- **Unit Merging**: Dragging a unit onto another in the same territory combines them into the next tier (strength addition). E.g., two Tier 1 units merge into Tier 2
- **Trees**: Generated on map (especially coastal hexes), block income, can be chopped by units (uses action), grow gradually on empty hexes adjacent to trees
- **Gravestones**: Bankrupt units become gravestones first (cross marker), then convert to trees on the next turn (two-step process)
- **Territory Linking**: Capturing a hex that connects two of your territories merges them and pools their oil barrel reserves
- **Bankruptcy**: If a territory's treasury goes negative after income/upkeep, all units in that territory die and become gravestones
- **Capitals**: Auto-placed in each territory center. Have peasant-level defense strength (1). Relocate if destroyed

Module files:
- **`types.ts`** — Core type definitions: `GameState`, `GameHex`, `Territory`, `Player`, `Faction`, coordinate types. GameHex includes `hasCastle`, `hasGrave` fields. `PurchaseType` = 'peasant' | 'castle'
- **`gameEngine.ts`** — Main game loop: hex tap handling (select, move, attack, merge, chop), peasant/castle purchasing, turn management with tree growth and grave→tree conversion
- **`mapGenerator.ts`** — Procedural hexagonal island generation with noise-based land/water, water pockets, peninsula trimming, initial tree placement, and neutral territory (~85% unowned)
- **`hexUtils.ts`** — Hex math: axial coordinate system, hex-to-pixel conversion, neighbor finding, distance calculation, corner generation for SVG rendering
- **`territoryManager.ts`** — Territory detection via flood-fill, economy calculations (income excluding trees, upkeep), defense zone strength calculation including castles, territory membership checks, bankruptcy with gravestone conversion
- **`aiPlayer.ts`** — AI opponent: moves units toward borders, attacks with strength check, chops trees, buys peasants/castles, combines peasants into higher units, expands into neutral territory
- **`constants.ts`** — PEASANT_COST=10, CASTLE_COST=15, CASTLE_DEFENSE=2, UNIT_UPKEEP=[2,6,18,54], UNIT_STRENGTH=[1,2,3,4], faction definitions, color palettes. Currency is oil barrels (bbl)

### Sprite Assets (`assets/sprites/`)

Pixel art sprites for units and buildings, cropped from sprite sheets with transparent backgrounds:
- **Units**: `army_1.png` through `army_4.png` (tier 1-4), `insurgent_1.png` through `insurgent_4.png` (tier 1-4)
- **Towers**: `tower_army.png`, `tower_insurgent.png`
- Rendered via `SvgImage` (react-native-svg `Image` component) inside the hex grid SVG
- Also used as thumbnails in ActionPanel buy buttons via React Native `Image`

### Game Components (`components/game/`)

- **`HexGrid`** — SVG-based hex map renderer using react-native-svg
- **`HexTile`** — Individual hex cell with owner coloring, sprite-based unit/castle rendering, selection/purchase highlighting
- **`StatusBar`** — Turn counter, current faction indicator, player status dots
- **`ActionPanel`** — Unit purchase buttons (Peasant and Castle only), end turn button, territory economy display
- **`GameOverlay`** — Victory/defeat modal shown at game end
- **`FactionPicker`** — Faction selection cards on main menu
- **`UnitIcon`** — Icon component mapping unit tiers to faction-specific icons

### Backend (Express)

- **Server**: Express 5 running on the same Replit instance, with CORS configured for Replit domains and localhost
- **Routes**: Defined in `server/routes.ts` — currently minimal with no game-specific API endpoints (game runs client-side)
- **Storage**: `server/storage.ts` implements `IStorage` interface with `MemStorage` (in-memory Map-based storage for users). Ready to swap to database-backed implementation
- **Static Serving**: In production, serves the Expo web build from `dist/` directory
- **Dev Mode**: Uses `http-proxy-middleware` to proxy requests to Expo's Metro bundler

### Database Schema

- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema** (`shared/schema.ts`): Single `users` table with `id` (UUID), `username` (unique text), `password` (text)
- **Validation**: Zod schemas generated via `drizzle-zod`
- **Migrations**: Output to `./migrations` directory, pushed via `drizzle-kit push`
- **Note**: The database is defined but not actively used by the game — the game state is entirely client-side. The DB infrastructure is scaffolded for future features like user accounts or persistent game saves

### Build & Development

- **Dev**: Two processes — `expo:dev` (Metro bundler) and `server:dev` (Express with tsx)
- **Production Build**: `expo:static:build` creates a static web export, `server:build` bundles server with esbuild, `server:prod` serves everything
- **DB Management**: `db:push` for schema migrations via drizzle-kit

## External Dependencies

- **PostgreSQL**: Database provisioned via Replit, connected through `DATABASE_URL` environment variable. Used by Drizzle ORM but not yet actively queried by the game
- **Expo Services**: Splash screen management, font loading, various Expo SDK modules
- **No external APIs**: The game is fully self-contained with no third-party API calls. AI runs locally, maps are procedurally generated client-side
- **Environment Variables**: `DATABASE_URL` (Postgres connection), `EXPO_PUBLIC_DOMAIN` (API base URL), `REPLIT_DEV_DOMAIN` and `REPLIT_DOMAINS` (CORS configuration)