import { GameState, GameHex, Player, hexKey, HexCoord, Faction, Territory, PurchaseType } from './types';
import { generateIslandMap, assignStartingPositions } from './mapGenerator';
import {
  detectTerritories,
  updateTerritoryEconomy,
  getTerritoryForHex,
  getHexDefenseStrength,
  isInSameTerritory,
} from './territoryManager';
import { executeAITurn } from './aiPlayer';
import { PEASANT_COST, CASTLE_COST, UNIT_UPKEEP, UNIT_STRENGTH, PLAYER_COLORS } from './constants';
import { getNeighbors, findConnectedRegion } from './hexUtils';

export function createNewGame(
  humanFaction: Faction,
  mapRadius: number = 10,
): GameState {
  const hexes = generateIslandMap(mapRadius);

  const aiFaction: Faction = humanFaction === 'army' ? 'insurgents' : 'army';

  const players: Player[] = [
    { id: 0, faction: humanFaction, isHuman: true, alive: true, color: PLAYER_COLORS[0] },
    { id: 1, faction: aiFaction, isHuman: false, alive: true, color: PLAYER_COLORS[1] },
  ];

  assignStartingPositions(hexes, 2);

  const territories = detectTerritories(hexes);
  for (const t of territories) {
    t.treasury = Math.max(t.income, 15);
  }

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
        return { ...state, selectedHex: { q, r }, combineMode: false };
      }

      const result = tryUnitAction(state, state.selectedHex, { q, r });
      if (result !== state) return result;
    }

    if (tappedHex.owner === state.currentPlayer) {
      return { ...state, selectedHex: { q, r }, combineMode: false };
    }

    return { ...state, selectedHex: null, combineMode: false };
  }

  if (tappedHex.owner === state.currentPlayer) {
    return { ...state, selectedHex: { q, r }, combineMode: false };
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

  const combinedStrength = UNIT_STRENGTH[fromHex.unitTier] + UNIT_STRENGTH[toHex.unitTier];
  let newTier = -1;
  for (let i = 0; i < UNIT_STRENGTH.length; i++) {
    if (UNIT_STRENGTH[i] === combinedStrength) {
      newTier = i;
      break;
    }
  }
  if (newTier === -1 || newTier > 3) return state;

  const newHexes = cloneHexes(state.hexes);
  const newTo = newHexes.get(hexKey(to.q, to.r))!;
  const newFrom = newHexes.get(hexKey(from.q, from.r))!;
  newTo.unitTier = newTier;
  newTo.unitMoved = fromHex.unitMoved || toHex.unitMoved;
  newFrom.unitTier = null;
  newFrom.unitMoved = false;

  const newTerritories = detectTerritories(newHexes);
  syncTreasuryToNewTerritories(state.territories, newTerritories);

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

    const isNeighbor = getNeighbors(from.q, from.r).some(
      (n) => n.q === to.q && n.r === to.r,
    );

    if (!isNeighbor) return state;
    if (fromHex.unitMoved) return state;

    if (toHex.hasTree) {
      const newHexes = cloneHexes(state.hexes);
      const newTo = newHexes.get(hexKey(to.q, to.r))!;
      const newFrom = newHexes.get(hexKey(from.q, from.r))!;
      newTo.hasTree = false;
      newTo.wasChopped = true;
      newTo.unitTier = fromHex.unitTier;
      newTo.unitMoved = true;
      newFrom.unitTier = null;
      newFrom.unitMoved = false;

      const newTerritories = detectTerritories(newHexes);
      syncTreasuryToNewTerritories(state.territories, newTerritories);

      return { ...state, hexes: newHexes, selectedHex: { q: to.q, r: to.r }, territories: newTerritories };
    }

    if (toHex.hasGrave) {
      const newHexes = cloneHexes(state.hexes);
      const newTo = newHexes.get(hexKey(to.q, to.r))!;
      const newFrom = newHexes.get(hexKey(from.q, from.r))!;
      newTo.hasGrave = false;
      newTo.unitTier = fromHex.unitTier;
      newTo.unitMoved = true;
      newFrom.unitTier = null;
      newFrom.unitMoved = false;

      const newTerritories = detectTerritories(newHexes);
      syncTreasuryToNewTerritories(state.territories, newTerritories);

      return { ...state, hexes: newHexes, selectedHex: { q: to.q, r: to.r }, territories: newTerritories };
    }

    if (toHex.unitTier === null && !toHex.hasCastle) {
      const newHexes = cloneHexes(state.hexes);
      const newTo = newHexes.get(hexKey(to.q, to.r))!;
      const newFrom = newHexes.get(hexKey(from.q, from.r))!;
      newTo.unitTier = fromHex.unitTier;
      newTo.unitMoved = true;
      newTo.hasTree = false;
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

    const defense = getHexDefenseStrength(to.q, to.r, state.hexes);

    if (unitStrength <= defense) return state;

    const capturedCapital = toHex.hasCapital;
    const oldOwner = toHex.owner;

    const newHexes = cloneHexes(state.hexes);
    const newTo = newHexes.get(hexKey(to.q, to.r))!;
    const newFrom = newHexes.get(hexKey(from.q, from.r))!;
    newTo.owner = state.currentPlayer;
    newTo.unitTier = fromHex.unitTier;
    newTo.unitMoved = true;
    newTo.hasTree = false;
    newTo.hasGrave = false;
    newTo.hasCapital = false;
    newTo.hasCastle = false;
    newFrom.unitTier = null;
    newFrom.unitMoved = false;

    const newTerritories = detectTerritories(newHexes);
    mergeTerritoryTreasuries(state.territories, newTerritories);

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
    newTo.hasTree = false;
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
    newHex.unitMoved = true;
  } else {
    newHex.hasCastle = true;
  }
  newHex.hasTree = false;
  newHex.hasGrave = false;

  const newTerritories = detectTerritories(newHexes);
  for (const nt of newTerritories) {
    const matchKey = hexKey(q, r);
    const isThisTerritory = nt.hexes.some(h => hexKey(h.q, h.r) === matchKey);
    if (isThisTerritory && nt.owner === state.currentPlayer) {
      syncTreasuryToNewTerritories(state.territories, [nt]);
      nt.treasury -= cost;
    } else {
      syncTreasuryToNewTerritories(state.territories, [nt]);
    }
  }

  return {
    ...state,
    hexes: newHexes,
    purchaseType: null,
    selectedHex: null,
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

  convertGravesToTrees(hexes);

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
  syncTreasuryToNewTerritories(state.territories, territories);
  territories = updateTerritoryEconomy(territories, hexes, currentPlayerIdx);

  let winner = checkWinner(hexes, players);
  if (winner !== null) {
    return {
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
      mapRadius: state.mapRadius,
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
      mapRadius: state.mapRadius,
    };
  }

  if (!currentPlayer.isHuman && currentPlayer.alive) {
    try {
      let aiState: GameState = {
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
        mapRadius: state.mapRadius,
      };
      aiState = executeAITurn(aiState);

      const aiHexes = cloneHexes(aiState.hexes);

      convertGravesToTrees(aiHexes);
      growTrees(aiHexes);
      growTreesOnPlayerLand(aiHexes);

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
      syncTreasuryToNewTerritories(aiState.territories, territories);
      territories = updateTerritoryEconomy(territories, aiHexes, nextPlayerIdx);

      winner = checkWinner(aiHexes, players);

      return {
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
        mapRadius: state.mapRadius,
      };
    } catch (e) {
      console.error('AI turn error:', e);
      let nextPlayerIdx = (currentPlayerIdx + 1) % players.length;
      if (nextPlayerIdx === 0) {
        turnNumber += 1;
      }
      return {
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
        mapRadius: state.mapRadius,
      };
    }
  }

  return {
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
    mapRadius: state.mapRadius,
  };
}

function convertGravesToTrees(hexes: Map<string, GameHex>): void {
  for (const hex of hexes.values()) {
    if (hex.hasGrave) {
      hex.hasGrave = false;
      hex.hasTree = true;
    }
  }
}

function growTrees(hexes: Map<string, GameHex>): void {
  const treesToGrow: string[] = [];

  for (const [key, hex] of hexes) {
    if (hex.hasTree || hex.unitTier !== null || hex.hasCapital || hex.hasCastle || hex.hasGrave) continue;
    if (hex.wasChopped) continue;

    const neighbors = getNeighbors(hex.q, hex.r);
    let adjacentTreeCount = 0;
    let isCoastal = false;

    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      const nh = hexes.get(nk);
      if (!nh) {
        isCoastal = true;
      } else if (nh.hasTree) {
        adjacentTreeCount++;
      }
    }

    if (!isCoastal || adjacentTreeCount === 0) continue;

    const growChance = adjacentTreeCount >= 2 ? 0.25 : 0.15;

    if (Math.random() < growChance) {
      treesToGrow.push(key);
    }
  }

  for (const key of treesToGrow) {
    const hex = hexes.get(key);
    if (hex) {
      hex.hasTree = true;
    }
  }
}

function growTreesOnPlayerLand(hexes: Map<string, GameHex>): void {
  const treesToGrow: string[] = [];

  for (const [key, hex] of hexes) {
    if (hex.hasTree || hex.unitTier !== null || hex.hasCapital || hex.hasCastle || hex.hasGrave) continue;
    if (hex.owner === null) continue;
    if (hex.wasChopped) continue;

    const neighbors = getNeighbors(hex.q, hex.r);
    let adjacentTreeCount = 0;
    let isCoastal = false;

    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      const nh = hexes.get(nk);
      if (!nh) {
        isCoastal = true;
      } else if (nh.hasTree) {
        adjacentTreeCount++;
      }
    }

    if (!isCoastal || adjacentTreeCount === 0) continue;

    const playerGrowChance = adjacentTreeCount >= 2 ? 0.18 : 0.10;
    if (Math.random() < playerGrowChance) {
      treesToGrow.push(key);
    }
  }

  for (const key of treesToGrow) {
    const hex = hexes.get(key);
    if (hex) {
      hex.hasTree = true;
    }
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

function syncTreasuryToNewTerritories(
  oldTerritories: Territory[],
  newTerritories: Territory[],
): void {
  for (const newT of newTerritories) {
    let bestMatch: Territory | null = null;
    let bestOverlap = 0;

    const newHexSet = new Set(newT.hexes.map((h: HexCoord) => hexKey(h.q, h.r)));

    for (const oldT of oldTerritories) {
      if (oldT.owner !== newT.owner) continue;
      let overlap = 0;
      for (const h of oldT.hexes) {
        if (newHexSet.has(hexKey(h.q, h.r))) overlap++;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = oldT;
      }
    }

    if (bestMatch) {
      newT.treasury = bestMatch.treasury;
    }
  }
}

function mergeTerritoryTreasuries(
  oldTerritories: Territory[],
  newTerritories: Territory[],
): void {
  for (const newT of newTerritories) {
    const newHexSet = new Set(newT.hexes.map((h: HexCoord) => hexKey(h.q, h.r)));

    let totalTreasury = 0;
    let matchCount = 0;

    for (const oldT of oldTerritories) {
      if (oldT.owner !== newT.owner) continue;
      let overlap = 0;
      for (const h of oldT.hexes) {
        if (newHexSet.has(hexKey(h.q, h.r))) overlap++;
      }
      if (overlap > 0) {
        totalTreasury += oldT.treasury;
        matchCount++;
      }
    }

    if (matchCount > 0) {
      newT.treasury = totalTreasury;
    }
  }
}
