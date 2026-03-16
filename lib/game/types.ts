export type Faction = 'coalition' | 'insurgents';

export interface FactionInfo {
  id: Faction;
  name: string;
  unitNames: [string, string, string, string];
  colors: {
    primary: string;
    secondary: string;
    territory: string;
    border: string;
  };
}

export interface HexCoord {
  q: number;
  r: number;
}

export interface GameHex {
  q: number;
  r: number;
  owner: number | null;
  unitTier: number | null;
  unitMoved: boolean;
  hasNomad: boolean;
  hasCapital: boolean;
  hasCastle: boolean;
  hasGrave: boolean;
  wasRelocated: boolean;
}

export interface Territory {
  id: string;
  owner: number;
  hexes: HexCoord[];
  treasury: number;
  income: number;
  upkeep: number;
  capitalHex: HexCoord | null;
}

export interface Player {
  id: number;
  faction: Faction;
  isHuman: boolean;
  alive: boolean;
  color: string;
}

export type GamePhase = 'setup' | 'playing' | 'game_over';

export type PurchaseType = 'peasant' | 'castle' | null;

export interface MapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface GameState {
  hexes: Map<string, GameHex>;
  players: Player[];
  territories: Territory[];
  currentPlayer: number;
  turnNumber: number;
  phase: GamePhase;
  winner: number | null;
  selectedHex: HexCoord | null;
  purchaseType: PurchaseType;
  combineMode: boolean;
  mapRadius: number;
  mapBounds: MapBounds;
}

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function coordFromKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}
