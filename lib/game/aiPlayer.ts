import { GameHex, GameState, hexKey, HexCoord, Territory } from './types';
import { getNeighbors, findConnectedRegion } from './hexUtils';
import { PEASANT_COST, CASTLE_COST, UNIT_UPKEEP, UNIT_STRENGTH, CASTLE_DEFENSE } from './constants';
import {
  getTerritoryForHex,
  getHexDefenseStrength,
  detectTerritories,
} from './territoryManager';

export function executeAITurn(state: GameState): GameState {
  let newState = { ...state };
  const playerId = newState.currentPlayer;

  newState = aiExpandToNeutral(newState, playerId);
  newState = aiMoveUnits(newState, playerId);

  let midTerritories = detectTerritories(newState.hexes);
  mergeTreasuries(newState.territories, midTerritories);
  newState.territories = midTerritories;

  newState = aiChopTrees(newState, playerId);
  newState = aiBuyPeasants(newState, playerId);
  newState = aiBuyCastles(newState, playerId);
  newState = aiCombineUnits(newState, playerId);

  const newTerritories = detectTerritories(newState.hexes);
  mergeTreasuries(newState.territories, newTerritories);
  newState.territories = newTerritories;

  return newState;
}

function aiMoveUnits(state: GameState, playerId: number): GameState {
  const movedKeys = new Set<string>();
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 200;

  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    iterations++;
    for (const [key, hex] of state.hexes) {
      if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;
      if (movedKeys.has(key)) continue;

      const neighbors = getNeighbors(hex.q, hex.r);
      let bestTarget: { q: number; r: number; score: number } | null = null;

      for (const n of neighbors) {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (!nh) continue;

        if (nh.owner !== null && nh.owner !== playerId) {
          const defense = getHexDefenseStrength(n.q, n.r, state.hexes);
          if (UNIT_STRENGTH[hex.unitTier] > defense) {
            let score = 10;
            if (nh.unitTier !== null) score += 5;
            if (nh.hasCapital) score += 8;
            if (nh.hasCastle) score += 6;
            if (!bestTarget || score > bestTarget.score) {
              bestTarget = { q: n.q, r: n.r, score };
            }
          }
        }
      }

      if (bestTarget) {
        const toHex = state.hexes.get(hexKey(bestTarget.q, bestTarget.r))!;
        toHex.owner = playerId;
        toHex.unitTier = hex.unitTier;
        toHex.unitMoved = true;
        toHex.hasTree = false;
        toHex.hasGrave = false;
        toHex.hasCapital = false;
        toHex.hasCastle = false;
        hex.unitTier = null;
        hex.unitMoved = false;
        movedKeys.add(hexKey(bestTarget.q, bestTarget.r));
        changed = true;
        continue;
      }

      const territory = getTerritoryForHex(hex.q, hex.r, state.territories);
      if (!territory) continue;

      const isBorder = neighbors.some((n) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner !== null && nh.owner !== playerId;
      });

      if (!isBorder) {
        let bestMove: HexCoord | null = null;
        const territorySet = new Set(territory.hexes.map((h) => hexKey(h.q, h.r)));

        for (const n of neighbors) {
          const nk = hexKey(n.q, n.r);
          if (!territorySet.has(nk)) continue;
          const nh = state.hexes.get(nk);
          if (!nh || nh.unitTier !== null || nh.hasCastle) continue;

          const nNeighbors = getNeighbors(n.q, n.r);
          const bordersEnemy = nNeighbors.some((nn) => {
            const nnh = state.hexes.get(hexKey(nn.q, nn.r));
            return nnh && nnh.owner !== null && nnh.owner !== playerId;
          });

          if (bordersEnemy) {
            bestMove = { q: n.q, r: n.r };
            break;
          }
        }

        if (bestMove) {
          const toHex = state.hexes.get(hexKey(bestMove.q, bestMove.r))!;
          toHex.unitTier = hex.unitTier;
          toHex.unitMoved = hex.unitMoved;
          hex.unitTier = null;
          hex.unitMoved = false;
          movedKeys.add(hexKey(bestMove.q, bestMove.r));
          changed = true;
        }
      }
    }
  }

  return state;
}

function aiChopTrees(state: GameState, playerId: number): GameState {
  for (const [key, hex] of state.hexes) {
    if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;

    const territory = getTerritoryForHex(hex.q, hex.r, state.territories);
    if (!territory) continue;

    const treeCount = territory.hexes.filter(c => {
      const h = state.hexes.get(hexKey(c.q, c.r));
      return h && h.hasTree;
    }).length;
    const treeRatio = treeCount / territory.hexes.length;

    if (treeRatio < 0.15) continue;

    const neighbors = getNeighbors(hex.q, hex.r);

    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      const nh = state.hexes.get(nk);
      if (!nh || nh.owner !== playerId || !nh.hasTree) continue;

      const sameTerritory = territory.hexes.some(
        (h) => hexKey(h.q, h.r) === nk,
      );
      if (!sameTerritory) continue;

      nh.hasTree = false;
      nh.wasChopped = true;
      hex.unitMoved = true;
      break;
    }
  }

  return state;
}

function aiExpandToNeutral(state: GameState, playerId: number): GameState {
  let expanded = 0;
  const maxExpansions = 3;

  for (const [key, hex] of state.hexes) {
    if (expanded >= maxExpansions) break;
    if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;

    const neighbors = getNeighbors(hex.q, hex.r);
    for (const n of neighbors) {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (nh && nh.owner === null) {
        nh.owner = playerId;
        nh.unitTier = hex.unitTier;
        nh.unitMoved = true;
        nh.hasTree = false;
        nh.hasGrave = false;
        hex.unitTier = null;
        hex.unitMoved = false;
        expanded++;
        break;
      }
    }
  }

  return state;
}

function aiBuyPeasants(state: GameState, playerId: number): GameState {
  const territories = state.territories.filter((t) => t.owner === playerId);

  for (const territory of territories) {
    let bought = 0;
    const netIncome = territory.income - territory.upkeep;
    const maxBuy = netIncome > 8 ? 2 : 1;

    for (const coord of territory.hexes) {
      if (bought >= maxBuy) break;
      if (territory.treasury < PEASANT_COST) break;

      const projectedUpkeep = territory.upkeep + UNIT_UPKEEP[0];
      const projectedNet = territory.income - projectedUpkeep;
      const projectedTreasury = territory.treasury - PEASANT_COST;
      if (projectedNet < -2 && projectedTreasury < Math.abs(projectedNet) * 5) break;

      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier !== null || hex.hasCastle || hex.hasCapital) continue;

      const neighbors = getNeighbors(coord.q, coord.r);
      const bordersExpandable = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && (nh.owner === null || (nh.owner !== null && nh.owner !== playerId));
      });

      if (!bordersExpandable) continue;

      hex.unitTier = 0;
      hex.unitMoved = true;
      hex.hasTree = false;
      hex.hasGrave = false;

      territory.treasury -= PEASANT_COST;
      territory.upkeep += UNIT_UPKEEP[0];
      bought++;
    }
  }

  return state;
}

function aiBuyCastles(state: GameState, playerId: number): GameState {
  const territories = state.territories.filter((t) => t.owner === playerId);

  for (const territory of territories) {
    if (territory.treasury < CASTLE_COST) continue;
    if (territory.hexes.length < 8) continue;

    const netIncome = territory.income - territory.upkeep;
    if (netIncome < 2 && territory.treasury < CASTLE_COST * 3) continue;

    const hasCastle = territory.hexes.some(coord => {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      return hex && hex.hasCastle;
    });
    if (hasCastle) continue;

    for (const coord of territory.hexes) {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier !== null || hex.hasCastle || hex.hasCapital) continue;

      const neighbors = getNeighbors(coord.q, coord.r);
      const bordersEnemy = neighbors.some((n) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner !== null && nh.owner !== playerId;
      });

      if (bordersEnemy && territory.treasury >= CASTLE_COST) {
        hex.hasCastle = true;
        hex.hasTree = false;
        hex.hasGrave = false;
        territory.treasury -= CASTLE_COST;
        break;
      }
    }
  }

  return state;
}

function aiCombineUnits(state: GameState, playerId: number): GameState {
  const territories = state.territories.filter((t) => t.owner === playerId);

  for (const territory of territories) {
    const unitsInTerritory: { key: string; hex: GameHex; coord: HexCoord }[] = [];
    let unitCount = 0;
    for (const coord of territory.hexes) {
      const key = hexKey(coord.q, coord.r);
      const hex = state.hexes.get(key);
      if (hex && hex.unitTier !== null) {
        unitsInTerritory.push({ key, hex, coord });
        unitCount++;
      }
    }

    if (unitCount < 2) continue;

    const needsStrongerUnit = territory.hexes.some(coord => {
      const neighbors = getNeighbors(coord.q, coord.r);
      return neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (!nh || nh.owner === null || nh.owner === playerId) return false;
        const defense = getHexDefenseStrength(n.q, n.r, state.hexes);
        const bestOwnStrength = unitsInTerritory.reduce((max, u) => 
          Math.max(max, u.hex.unitTier !== null ? UNIT_STRENGTH[u.hex.unitTier] : 0), 0);
        return defense >= bestOwnStrength;
      });
    });

    let maxCombines = needsStrongerUnit ? 3 : 1;
    let combined = 0;

    for (const unit of unitsInTerritory) {
      if (combined >= maxCombines) break;
      if (unit.hex.unitTier === null) continue;

      for (const other of unitsInTerritory) {
        if (combined >= maxCombines) break;
        if (other.key === unit.key) continue;
        if (other.hex.unitTier === null) continue;

        const combinedStrength = UNIT_STRENGTH[unit.hex.unitTier] + UNIT_STRENGTH[other.hex.unitTier];
        let newTier = -1;
        for (let i = 0; i < UNIT_STRENGTH.length; i++) {
          if (UNIT_STRENGTH[i] === combinedStrength) {
            newTier = i;
            break;
          }
        }
        if (newTier === -1 || newTier > 3) continue;

        const newUpkeep = territory.upkeep - UNIT_UPKEEP[unit.hex.unitTier] - UNIT_UPKEEP[other.hex.unitTier] + UNIT_UPKEEP[newTier];
        const netIncome = territory.income - newUpkeep;
        if (netIncome < -5 && territory.treasury < Math.abs(netIncome) * 3) continue;

        other.hex.unitTier = newTier;
        other.hex.unitMoved = true;
        unit.hex.unitTier = null;
        unit.hex.unitMoved = false;
        territory.upkeep = newUpkeep;
        combined++;
        break;
      }
    }
  }

  return state;
}

function mergeTreasuries(
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
