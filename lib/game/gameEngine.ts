import { GameState, GameHex, Player, hexKey, HexCoord, Faction, Territory, PurchaseType, MapBounds } from './types';
import { generateIslandMap, assignStartingPositions } from './mapGenerator';
import {
  detectTerritories,
  enforceMinTerritorySize,
  updateTerritoryEconomy,
  getTerritoryForHex,
  getHexDefenseStrength,
  isInSameTerritory,
  mergeTerritoryTreasuries,
  syncTerritoryTreasuries,
  buildHexTerritoryMap,
} from './territoryManager';
import { executeAITurn } from './aiPlayer';
import { PEASANT_COST, CASTLE_COST, UNIT_UPKEEP, UNIT_STRENGTH, PLAYER_COLORS, getTierForCombinedStrength } from './constants';
import { getNeighbors, findConnectedRegion, hexToPixel } from './hexUtils';

function computeMapBounds(hexes: Map<string, GameHex>): MapBounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const hex of hexes.values()) {
    const { x, y } = hexToPixel(hex.q, hex.r);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

export function createNewGame(
  humanFaction: Faction,
  mapRadius: number = 10,
): GameState {
  const hexes = generateIslandMap(mapRadius);

  const aiFaction: Faction = humanFaction === 'coalition' ? 'insurgents' : 'coalition';

  const players: Player[] = [
    { id: 0, faction: humanFaction, isHuman: true, alive: true, color: PLAYER_COLORS[0] },
    { id: 1, faction: aiFaction, isHuman: false, alive: true, color: PLAYER_COLORS[1] },
  ];

  assignStartingPositions(hexes, 2);

  const territories = detectTerritories(hexes);
  for (const t of territories) {
    t.treasury = Math.max(t.income, 15);
  }

  const mapBounds = computeMapBounds(hexes);

  return {
    hexes,
    players,
    territories,
    currentPlayer: 0,
    turnNumber: 1,
    phase: 'playing',
    winner: null,
    selectedHex: null,
    purchaseType: null,
    combineMode: false,
    mapRadius,
    mapBounds,
  };
}

export function handleHexTap(state: GameState, q: number, r: number): GameState {
  if (state.phase !== 'playing') return state;

  const player = state.players[state.currentPlayer];
  if (!player.isHuman) return state;

  const tappedKey = hexKey(q, r);
  const tappedHex = state.hexes.get(tappedKey);
  if (!tappedHex) return state;

  if (state.purchaseType !== null) {
    return tryPlacePurchase(state, q, r);
  }

  if (state.selectedHex) {
    const selKey = hexKey(state.selectedHex.q, state.selectedHex.r);

    if (selKey === tappedKey) {
      return { ...state, selectedHex: null, combineMode: false };
    }

    const selHex = state.hexes.get(selKey);

    if (selHex && selHex.unitTier !== null && selHex.owner === state.currentPlayer) {
      if (tappedHex.owner === state.currentPlayer && tappedHex.unitTier !== null) {
        if (state.combineMode) {
          const result = tryMergeUnits(state, state.selectedHex, { q, r });
          if (result !== state) return result;
        }
        return { ...state, selectedHex: { q, r }, combineMode: state.combineMode };
      }

      const result = tryUnitAction(state, state.selectedHex, { q, r });
      if (result !== state) return result;
    }

    if (tappedHex.owner === state.currentPlayer) {
      return { ...state, selectedHex: { q, r }, combineMode: state.combineMode };
    }

    return { ...state, selectedHex: null, combineMode: false };
  }

  if (tappedHex.owner === state.currentPlayer) {
    return { ...state, selectedHex: { q, r }, combineMode: state.combineMode };
  }

  return { ...state, selectedHex: null, combineMode: false };
}

export function toggleCombineMode(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[state.currentPlayer];
  if (!player.isHuman) return state;
  return { ...state, combineMode: !state.combineMode, purchaseType: null };
}

function tryMergeUnits(state: GameState, from: HexCoord, to: HexCoord): GameState {
  const fromHex = state.hexes.get(hexKey(from.q, from.r));
  const toHex = state.hexes.get(hexKey(to.q, to.r));
  if (!fromHex || !toHex) return state;
  if (fromHex.unitTier === null || toHex.unitTier === null) return state;
  if (toHex.owner !== state.currentPlayer) return state;

  const sameTerritory = isInSameTerritory(from.q, from.r, to.q, to.r, state.territories);
  if (!sameTerritory) return state;

  const newTier = getTierForCombinedStrength(fromHex.unitTier, toHex.unitTier);
  if (newTier === -1 || newTier > 3) return state;

  const newHexes = cloneHexes(state.hexes);
  const newTo = newHexes.get(hexKey(to.q, to.r))!;
  const newFrom = newHexes.get(hexKey(from.q, from.r))!;
  newTo.unitTier = newTier;
  newTo.unitMoved = fromHex.unitMoved || toHex.unitMoved;
  newFrom.unitTier = null;
  newFrom.unitMoved = false;

  const newTerritories = detectTerritories(newHexes);
  syncTerritoryTreasuries(state.territories, newTerritories);

  return {
    ...state,
    hexes: newHexes,
    selectedHex: { q: to.q, r: to.r },
    territories: newTerritories,
    combineMode: false,
  };
}

function tryUnitAction(state: GameState, from: HexCoord, to: HexCoord): GameState {
  const fromHex = state.hexes.get(hexKey(from.q, from.r));
  const toHex = state.hexes.get(hexKey(to.q, to.r));

  if (!fromHex || !toHex) return state;
  if (fromHex.unitTier === null) return state;

  const unitStrength = UNIT_STRENGTH[fromHex.unitTier];

  if (toHex.owner === state.currentPlayer) {
    const sameTerritory = isInSameTerritory(
      from.q, from.r, to.q, to.r, state.territories,
    );

    if (!sameTerritory) return state;
    if (fromHex.unitMoved) return state;

    if (toHex.hasNomad) {
      // Classic Slay: unit stays in place, clears the nomad, loses its turn
      const newHexes = cloneHexes(state.hexes);
      const newTo = newHexes.get(hexKey(to.q, to.r))!;
      const newFrom = newHexes.get(hexKey(from.q, from.r))!;
      newTo.hasNomad = false;
      newTo.wasRelocated = true;
      newFrom.unitMoved = true;

      const newTerritories = detectTerritories(newHexes);
      syncTerritoryTreasuries(state.territories, newTerritories);

      return { ...state, hexes: newHexes, selectedHex: { q: from.q, r: from.r }, territories: newTerritories };
    }

    if (toHex.hasGrave) {
      const newHexes = cloneHexes(state.hexes);
      const newTo = newHexes.get(hexKey(to.q, to.r))!;
      const newFrom = newHexes.get(hexKey(from.q, from.r))!;
      newTo.hasGrave = false;
      newTo.unitTier = fromHex.unitTier;
      newTo.unitMoved = false; // free movement within territory
      newFrom.unitTier = null;
      newFrom.unitMoved = false;

      const newTerritories = detectTerritories(newHexes);
      syncTerritoryTreasuries(state.territories, newTerritories);

      return { ...state, hexes: newHexes, selectedHex: { q: to.q, r: to.r }, territories: newTerritories };
    }

    if (toHex.unitTier === null && !toHex.hasCastle) {
      const newHexes = cloneHexes(state.hexes);
      const newTo = newHexes.get(hexKey(to.q, to.r))!;
      const newFrom = newHexes.get(hexKey(from.q, from.r))!;
      newTo.unitTier = fromHex.unitTier;
      newTo.unitMoved = false; // free movement within territory; only attacks/chops cost the action
      newTo.hasNomad = false;
      newTo.hasGrave = false;
      newFrom.unitTier = null;
      newFrom.unitMoved = false;

      return {
        ...state,
        hexes: newHexes,
        selectedHex: { q: to.q, r: to.r },
      };
    }

    return state;
  }

  if (toHex.owner !== null && toHex.owner !== state.currentPlayer) {
    if (fromHex.unitMoved) return state;

    const neighbors = getNeighbors(from.q, from.r);
    const isNeighbor = neighbors.some((n) => n.q === to.q && n.r === to.r);
    if (!isNeighbor) return state;

    const hexTerritoryMap = buildHexTerritoryMap(state.territories);
    const defense = getHexDefenseStrength(to.q, to.r, state.hexes, hexTerritoryMap);

    // strict < so equal strength resolves to attacker win (classic Slay)
    if (unitStrength < defense) return state;

    const capturedCapital = toHex.hasCapital;
    const oldOwner = toHex.owner;

    const newHexes = cloneHexes(state.hexes);
    const newTo = newHexes.get(hexKey(to.q, to.r))!;
    const newFrom = newHexes.get(hexKey(from.q, from.r))!;
    newTo.owner = state.currentPlayer;
    newTo.unitTier = fromHex.unitTier;
    newTo.unitMoved = true;
    newTo.hasNomad = false;
    newTo.hasGrave = false;
    newTo.hasCapital = false;
    newTo.hasCastle = false;
    newFrom.unitTier = null;
    newFrom.unitMoved = false;

    const newTerritories = detectTerritories(newHexes);
    // Current player's territories may merge (conquest) — sum their treasuries
    mergeTerritoryTreasuries(
      state.territories.filter(t => t.owner === state.currentPlayer),
      newTerritories,
    );
    // Enemy territories may split — largest fragment keeps treasury, cut-off fragments start at 0
    syncTerritoryTreasuries(
      state.territories.filter(t => t.owner !== state.currentPlayer),
      newTerritories,
    );

    if (capturedCapital && oldOwner !== null) {
      for (const t of newTerritories) {
        if (t.owner === oldOwner) {
          const oldTerritory = state.territories.find(ot =>
            ot.owner === oldOwner &&
            ot.capitalHex &&
            ot.capitalHex.q === to.q &&
            ot.capitalHex.r === to.r
          );
          if (oldTerritory) {
            const lostHexes = new Set(
              oldTerritory.hexes.map(h => hexKey(h.q, h.r))
            );
            const overlap = t.hexes.some(h => lostHexes.has(hexKey(h.q, h.r)));
            if (overlap) {
              t.treasury = 0;
            }
          }
        }
      }
    }

    const winner = checkWinner(newHexes, state.players);

    return {
      ...state,
      hexes: newHexes,
      selectedHex: null,
      territories: newTerritories,
      winner,
      phase: winner !== null ? 'game_over' : 'playing',
    };
  }

  if (toHex.owner === null) {
    if (fromHex.unitMoved) return state;

    const neighbors = getNeighbors(from.q, from.r);
    const isNeighbor = neighbors.some((n) => n.q === to.q && n.r === to.r);
    if (!isNeighbor) return state;

    const newHexes = cloneHexes(state.hexes);
    const newTo = newHexes.get(hexKey(to.q, to.r))!;
    const newFrom = newHexes.get(hexKey(from.q, from.r))!;
    newTo.owner = state.currentPlayer;
    newTo.unitTier = fromHex.unitTier;
    newTo.unitMoved = true;
    newTo.hasNomad = false;
    newTo.hasGrave = false;
    newFrom.unitTier = null;
    newFrom.unitMoved = false;

    const newTerritories = detectTerritories(newHexes);
    mergeTerritoryTreasuries(state.territories, newTerritories);

    return {
      ...state,
      hexes: newHexes,
      selectedHex: null,
      territories: newTerritories,
    };
  }

  return state;
}

function tryPlacePurchase(state: GameState, q: number, r: number): GameState {
  const purchaseType = state.purchaseType!;
  const hex = state.hexes.get(hexKey(q, r));

  if (!hex || hex.owner !== state.currentPlayer) {
    return { ...state, purchaseType: null };
  }

  if (hex.unitTier !== null || hex.hasCastle || hex.hasCapital) {
    return { ...state, purchaseType: null };
  }

  const territory = getTerritoryForHex(q, r, state.territories);
  if (!territory) return { ...state, purchaseType: null };

  const cost = purchaseType === 'peasant' ? PEASANT_COST : CASTLE_COST;
  if (territory.treasury < cost) return { ...state, purchaseType: null };

  const newHexes = cloneHexes(state.hexes);
  const newHex = newHexes.get(hexKey(q, r))!;

  if (purchaseType === 'peasant') {
    newHex.unitTier = 0;
    newHex.unitMoved = false;
  } else {
    newHex.hasCastle = true;
  }
  newHex.hasNomad = false;
  newHex.hasGrave = false;

  const newTerritories = detectTerritories(newHexes);
  syncTerritoryTreasuries(state.territories, newTerritories);
  const purchasedTerritory = newTerritories.find(
    nt => nt.owner === state.currentPlayer &&
          nt.hexes.some(h => hexKey(h.q, h.r) === hexKey(q, r)),
  );
  if (purchasedTerritory) {
    purchasedTerritory.treasury -= cost;
  }

  return {
    ...state,
    hexes: newHexes,
    purchaseType: null,
    selectedHex: purchaseType === 'peasant' ? { q, r } : null,
    territories: newTerritories,
  };
}

export function startPurchase(state: GameState, type: PurchaseType): GameState {
  if (state.phase !== 'playing') return state;
  const player = state.players[state.currentPlayer];
  if (!player.isHuman) return state;

  if (state.purchaseType === type) {
    return { ...state, purchaseType: null };
  }

  return { ...state, purchaseType: type, selectedHex: null, combineMode: false };
}

function cloneHexes(hexes: Map<string, GameHex>): Map<string, GameHex> {
  const newMap = new Map<string, GameHex>();
  for (const [key, hex] of hexes) {
    newMap.set(key, { ...hex });
  }
  return newMap;
}

export function endTurn(state: GameState): GameState {
  const hexes = cloneHexes(state.hexes);
  const players = state.players.map(p => ({ ...p }));

  convertGravesToNomads(hexes);

  for (const hex of hexes.values()) {
    if (hex.owner === state.currentPlayer) {
      hex.unitMoved = false;
    }
  }

  let currentPlayerIdx = (state.currentPlayer + 1) % players.length;
  let turnNumber = state.turnNumber;

  if (currentPlayerIdx === 0) {
    turnNumber += 1;
  }

  let territories = detectTerritories(hexes);
  syncTerritoryTreasuries(state.territories, territories);
  enforceMinTerritorySize(hexes, territories);
  territories = updateTerritoryEconomy(territories, hexes, currentPlayerIdx);

  let winner = checkWinner(hexes, players);
  if (winner !== null) {
    return {
      ...state,
      hexes,
      players,
      territories,
      currentPlayer: currentPlayerIdx,
      turnNumber,
      phase: 'game_over',
      winner,
      selectedHex: null,
      purchaseType: null,
      combineMode: false,
    };
  }

  const currentPlayer = players[currentPlayerIdx];
  const hasHexes = Array.from(hexes.values()).some(
    (h) => h.owner === currentPlayerIdx,
  );
  if (!hasHexes) {
    currentPlayer.alive = false;
    winner = checkWinner(hexes, players);
    return {
      ...state,
      hexes,
      players,
      territories,
      currentPlayer: currentPlayerIdx,
      turnNumber,
      phase: winner !== null ? 'game_over' : 'playing',
      winner,
      selectedHex: null,
      purchaseType: null,
      combineMode: false,
    };
  }

  if (!currentPlayer.isHuman && currentPlayer.alive) {
    try {
      let aiState: GameState = {
        ...state,
        hexes,
        players,
        territories,
        currentPlayer: currentPlayerIdx,
        turnNumber,
        phase: 'playing',
        winner: null,
        selectedHex: null,
        purchaseType: null,
        combineMode: false,
      };
      aiState = executeAITurn(aiState);

      const aiHexes = cloneHexes(aiState.hexes);

      convertGravesToNomads(aiHexes);
      growTrees(aiHexes);
      resetChoppedFlags(aiHexes);

      for (const hex of aiHexes.values()) {
        if (hex.owner === currentPlayerIdx) {
          hex.unitMoved = false;
        }
      }

      let nextPlayerIdx = (currentPlayerIdx + 1) % players.length;
      if (nextPlayerIdx === 0) {
        turnNumber += 1;
      }

      territories = detectTerritories(aiHexes);
      syncTerritoryTreasuries(aiState.territories, territories);
      enforceMinTerritorySize(aiHexes, territories);
      territories = updateTerritoryEconomy(territories, aiHexes, nextPlayerIdx);

      winner = checkWinner(aiHexes, players);

      return {
        ...state,
        hexes: aiHexes,
        players,
        territories,
        currentPlayer: nextPlayerIdx,
        turnNumber,
        phase: winner !== null ? 'game_over' : 'playing',
        winner,
        selectedHex: null,
        purchaseType: null,
        combineMode: false,
      };
    } catch (e) {
      console.error('AI turn error:', e);
      let nextPlayerIdx = (currentPlayerIdx + 1) % players.length;
      if (nextPlayerIdx === 0) {
        turnNumber += 1;
      }
      return {
        ...state,
        hexes,
        players,
        territories,
        currentPlayer: nextPlayerIdx,
        turnNumber,
        phase: 'playing',
        winner: null,
        selectedHex: null,
        purchaseType: null,
        combineMode: false,
      };
    }
  }

  return {
    ...state,
    hexes,
    players,
    territories,
    currentPlayer: currentPlayerIdx,
    turnNumber,
    phase: 'playing',
    winner: null,
    selectedHex: null,
    purchaseType: null,
    combineMode: false,
  };
}

function convertGravesToNomads(hexes: Map<string, GameHex>): void {
  for (const hex of hexes.values()) {
    if (hex.hasGrave) {
      hex.hasGrave = false;
      hex.hasNomad = true;
    }
  }
}

function resetChoppedFlags(hexes: Map<string, GameHex>): void {
  for (const hex of hexes.values()) {
    hex.wasRelocated = false;
  }
}

/**
 * Grow nomad camps (trees) on eligible hexes.
 * Per PRD §14.5 (classic Slay rule): a camp spreads only to hexes
 * with 2+ adjacent camps. playerLandRate applies a reduced chance
 * when spreading onto owned territory vs neutral land.
 */
function growTrees(hexes: Map<string, GameHex>): void {
  const toGrow: string[] = [];

  for (const [key, hex] of hexes) {
    if (hex.hasNomad || hex.unitTier !== null || hex.hasCapital || hex.hasCastle || hex.hasGrave) continue;
    if (hex.wasRelocated) continue;

    let adjacentTreeCount = 0;
    for (const n of getNeighbors(hex.q, hex.r)) {
      const nh = hexes.get(hexKey(n.q, n.r));
      if (nh?.hasNomad) adjacentTreeCount++;
    }

    // Classic Slay: requires 2+ adjacent camps to spread
    if (adjacentTreeCount < 2) continue;

    const chance = hex.owner === null ? 0.25 : 0.18;
    if (Math.random() < chance) toGrow.push(key);
  }

  for (const key of toGrow) {
    const hex = hexes.get(key);
    if (hex) hex.hasNomad = true;
  }
}

function checkWinner(hexes: Map<string, GameHex>, players: Player[]): number | null {
  const ownersWithHexes = new Set<number>();
  for (const hex of hexes.values()) {
    if (hex.owner !== null) {
      ownersWithHexes.add(hex.owner);
    }
  }

  if (ownersWithHexes.size === 1) {
    return ownersWithHexes.values().next().value!;
  }

  return null;
}

