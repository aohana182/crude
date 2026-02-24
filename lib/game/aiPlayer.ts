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
  newState = aiAttackEnemy(newState, playerId);
  newState = aiMoveUnitsToFront(newState, playerId);

  let midTerritories = detectTerritories(newState.hexes);
  mergeTreasuries(newState.territories, midTerritories);
  newState.territories = midTerritories;

  newState = aiChopTrees(newState, playerId);
  newState = aiBuyPeasants(newState, playerId);
  newState = aiCombineUnits(newState, playerId);
  newState = aiBuyCastles(newState, playerId);

  newState = aiSecondPassAttack(newState, playerId);

  const newTerritories = detectTerritories(newState.hexes);
  mergeTreasuries(newState.territories, newTerritories);
  newState.territories = newTerritories;

  return newState;
}

function aiAttackEnemy(state: GameState, playerId: number): GameState {
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 100) {
    changed = false;
    iterations++;

    let bestAttack: { from: string; to: string; score: number } | null = null;

    for (const [key, hex] of state.hexes) {
      if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;

      const neighbors = getNeighbors(hex.q, hex.r);
      for (const n of neighbors) {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (!nh) continue;
        if (nh.owner === null || nh.owner === playerId) continue;

        const defense = getHexDefenseStrength(n.q, n.r, state.hexes);
        if (UNIT_STRENGTH[hex.unitTier] <= defense) continue;

        let score = 10;
        if (nh.hasCapital) score += 20;
        if (nh.hasCastle) score += 15;
        if (nh.unitTier !== null) score += 5 + nh.unitTier * 3;

        const wouldSplitTerritory = checkTerritotySplit(n.q, n.r, nh.owner, state.hexes);
        if (wouldSplitTerritory) score += 12;

        const excessStrength = UNIT_STRENGTH[hex.unitTier] - defense;
        score += excessStrength;

        const connectsToOwnTerritory = neighbors.some(nn => {
          const nnh = state.hexes.get(hexKey(nn.q, nn.r));
          return nnh && nnh.owner === playerId && hexKey(nn.q, nn.r) !== hexKey(n.q, n.r);
        });
        if (connectsToOwnTerritory) score += 3;

        if (!bestAttack || score > bestAttack.score) {
          bestAttack = { from: key, to: hexKey(n.q, n.r), score };
        }
      }
    }

    if (bestAttack) {
      const fromHex = state.hexes.get(bestAttack.from)!;
      const toHex = state.hexes.get(bestAttack.to)!;

      toHex.owner = playerId;
      toHex.unitTier = fromHex.unitTier;
      toHex.unitMoved = true;
      toHex.hasTree = false;
      toHex.hasGrave = false;
      toHex.hasCapital = false;
      toHex.hasCastle = false;
      fromHex.unitTier = null;
      fromHex.unitMoved = false;
      changed = true;
    }
  }

  return state;
}

function checkTerritotySplit(q: number, r: number, owner: number, hexes: Map<string, GameHex>): boolean {
  const neighbors = getNeighbors(q, r);
  const ownerNeighbors = neighbors.filter(n => {
    const nh = hexes.get(hexKey(n.q, n.r));
    return nh && nh.owner === owner;
  });

  if (ownerNeighbors.length < 2) return false;

  const visited = new Set<string>();
  const start = ownerNeighbors[0];
  const queue: HexCoord[] = [start];
  visited.add(hexKey(start.q, start.r));
  const skipKey = hexKey(q, r);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of getNeighbors(current.q, current.r)) {
      const nk = hexKey(n.q, n.r);
      if (nk === skipKey) continue;
      if (visited.has(nk)) continue;
      const nh = hexes.get(nk);
      if (nh && nh.owner === owner) {
        visited.add(nk);
        queue.push(n);
      }
    }
  }

  for (let i = 1; i < ownerNeighbors.length; i++) {
    if (!visited.has(hexKey(ownerNeighbors[i].q, ownerNeighbors[i].r))) {
      return true;
    }
  }
  return false;
}

function aiSecondPassAttack(state: GameState, playerId: number): GameState {
  for (const [key, hex] of state.hexes) {
    if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;

    const neighbors = getNeighbors(hex.q, hex.r);
    let bestTarget: HexCoord | null = null;
    let bestScore = 0;

    for (const n of neighbors) {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (!nh) continue;

      if (nh.owner === null) {
        if (!bestTarget || bestScore < 5) {
          bestTarget = { q: n.q, r: n.r };
          bestScore = 5;
        }
      } else if (nh.owner !== playerId) {
        const defense = getHexDefenseStrength(n.q, n.r, state.hexes);
        if (UNIT_STRENGTH[hex.unitTier] > defense) {
          let score = 10;
          if (nh.hasCapital) score += 20;
          if (nh.hasCastle) score += 15;
          if (score > bestScore) {
            bestTarget = { q: n.q, r: n.r };
            bestScore = score;
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
    }
  }

  return state;
}

function aiMoveUnitsToFront(state: GameState, playerId: number): GameState {
  const movedKeys = new Set<string>();
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 150) {
    changed = false;
    iterations++;

    for (const [key, hex] of state.hexes) {
      if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;
      if (movedKeys.has(key)) continue;

      const neighbors = getNeighbors(hex.q, hex.r);
      const isBorder = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner !== null && nh.owner !== playerId;
      });
      const isNeutralBorder = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner === null;
      });

      if (isBorder || isNeutralBorder) continue;

      const territory = getTerritoryForHex(hex.q, hex.r, state.territories);
      if (!territory) continue;
      const territorySet = new Set(territory.hexes.map(h => hexKey(h.q, h.r)));

      let bestMove: HexCoord | null = null;
      let bestDist = Infinity;

      for (const n of neighbors) {
        const nk = hexKey(n.q, n.r);
        if (!territorySet.has(nk)) continue;
        const nh = state.hexes.get(nk);
        if (!nh || nh.unitTier !== null || nh.hasCastle) continue;

        const distToFront = getDistanceToFront(n.q, n.r, playerId, state.hexes);
        if (distToFront < bestDist) {
          bestDist = distToFront;
          bestMove = { q: n.q, r: n.r };
        }
      }

      if (bestMove) {
        const currentDist = getDistanceToFront(hex.q, hex.r, playerId, state.hexes);
        if (bestDist < currentDist) {
          const toHex = state.hexes.get(hexKey(bestMove.q, bestMove.r))!;
          toHex.unitTier = hex.unitTier;
          toHex.unitMoved = true;
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

function getDistanceToFront(q: number, r: number, playerId: number, hexes: Map<string, GameHex>): number {
  const visited = new Set<string>();
  const queue: { q: number; r: number; dist: number }[] = [{ q, r, dist: 0 }];
  visited.add(hexKey(q, r));

  while (queue.length > 0) {
    const current = queue.shift()!;

    const neighbors = getNeighbors(current.q, current.r);
    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      const nh = hexes.get(nk);
      if (!nh) continue;
      if (nh.owner !== playerId) return current.dist + 1;
      if (visited.has(nk)) continue;
      visited.add(nk);
      queue.push({ q: n.q, r: n.r, dist: current.dist + 1 });
    }
  }

  return 999;
}

function aiExpandToNeutral(state: GameState, playerId: number): GameState {
  let expanded = true;
  let totalExpanded = 0;
  const maxExpansions = 12;

  while (expanded && totalExpanded < maxExpansions) {
    expanded = false;

    for (const [key, hex] of state.hexes) {
      if (totalExpanded >= maxExpansions) break;
      if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;

      const neighbors = getNeighbors(hex.q, hex.r);

      let bestNeutral: HexCoord | null = null;
      let bestScore = -1;

      for (const n of neighbors) {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (!nh || nh.owner !== null) continue;

        let score = 1;
        if (!nh.hasTree) score += 2;

        const nNeighbors = getNeighbors(n.q, n.r);
        for (const nn of nNeighbors) {
          const nnh = state.hexes.get(hexKey(nn.q, nn.r));
          if (nnh && nnh.owner === playerId && hexKey(nn.q, nn.r) !== key) {
            score += 1;
          }
          if (nnh && nnh.owner === null) {
            score += 0.3;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestNeutral = { q: n.q, r: n.r };
        }
      }

      if (bestNeutral) {
        const nh = state.hexes.get(hexKey(bestNeutral.q, bestNeutral.r))!;
        nh.owner = playerId;
        nh.unitTier = hex.unitTier;
        nh.unitMoved = true;
        nh.hasTree = false;
        nh.hasGrave = false;
        hex.unitTier = null;
        hex.unitMoved = false;
        totalExpanded++;
        expanded = true;
      }
    }
  }

  return state;
}

function aiChopTrees(state: GameState, playerId: number): GameState {
  const territories = state.territories.filter(t => t.owner === playerId);

  for (const territory of territories) {
    const treeCount = territory.hexes.filter(c => {
      const h = state.hexes.get(hexKey(c.q, c.r));
      return h && h.hasTree;
    }).length;
    const treeRatio = treeCount / territory.hexes.length;

    const shouldChop = treeRatio > 0.08 || (territory.income - territory.upkeep < 3 && treeCount > 0);
    if (!shouldChop) continue;

    for (const coord of territory.hexes) {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier === null || hex.unitMoved) continue;

      const neighbors = getNeighbors(coord.q, coord.r);
      for (const n of neighbors) {
        const nk = hexKey(n.q, n.r);
        const nh = state.hexes.get(nk);
        if (!nh || nh.owner !== playerId || !nh.hasTree) continue;

        const sameTerritory = territory.hexes.some(h => hexKey(h.q, h.r) === nk);
        if (!sameTerritory) continue;

        nh.hasTree = false;
        nh.wasChopped = true;
        nh.unitTier = hex.unitTier;
        nh.unitMoved = true;
        hex.unitTier = null;
        hex.unitMoved = false;
        break;
      }
    }
  }

  return state;
}

function aiBuyPeasants(state: GameState, playerId: number): GameState {
  const territories = state.territories.filter(t => t.owner === playerId);

  for (const territory of territories) {
    const netIncome = territory.income - territory.upkeep;

    const maxBuy = Math.max(1, Math.min(6, Math.floor(netIncome / 3)));

    let bought = 0;

    const borderHexes: HexCoord[] = [];
    const otherHexes: HexCoord[] = [];

    for (const coord of territory.hexes) {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier !== null || hex.hasCastle || hex.hasCapital || hex.hasTree) continue;

      const neighbors = getNeighbors(coord.q, coord.r);
      const bordersExpandable = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && (nh.owner === null || (nh.owner !== null && nh.owner !== playerId));
      });

      if (bordersExpandable) {
        borderHexes.push(coord);
      } else {
        otherHexes.push(coord);
      }
    }

    const placementOrder = [...borderHexes, ...otherHexes];

    for (const coord of placementOrder) {
      if (bought >= maxBuy) break;
      if (territory.treasury < PEASANT_COST) break;

      const projectedUpkeep = territory.upkeep + UNIT_UPKEEP[0] * (bought + 1);
      const projectedNet = territory.income - projectedUpkeep;
      const projectedTreasury = territory.treasury - PEASANT_COST * (bought + 1);

      if (projectedNet < -4 && projectedTreasury < Math.abs(projectedNet) * 3) break;

      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier !== null || hex.hasCastle || hex.hasCapital) continue;

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
  const territories = state.territories.filter(t => t.owner === playerId);

  for (const territory of territories) {
    if (territory.treasury < CASTLE_COST) continue;
    if (territory.hexes.length < 6) continue;

    const netIncome = territory.income - territory.upkeep;
    if (netIncome < 0 && territory.treasury < CASTLE_COST * 2) continue;

    const castleCount = territory.hexes.filter(coord => {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      return hex && hex.hasCastle;
    }).length;

    const maxCastles = Math.max(1, Math.floor(territory.hexes.length / 10));
    if (castleCount >= maxCastles) continue;

    let bestHex: HexCoord | null = null;
    let bestScore = -1;

    for (const coord of territory.hexes) {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier !== null || hex.hasCastle || hex.hasCapital || hex.hasTree) continue;

      const neighbors = getNeighbors(coord.q, coord.r);
      let score = 0;

      const bordersEnemy = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner !== null && nh.owner !== playerId;
      });
      if (bordersEnemy) score += 5;

      let friendlyNeighbors = 0;
      for (const n of neighbors) {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (nh && nh.owner === playerId) friendlyNeighbors++;
      }
      score += friendlyNeighbors;

      const existingCastleNearby = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.hasCastle;
      });
      if (existingCastleNearby) score -= 10;

      if (score > bestScore) {
        bestScore = score;
        bestHex = coord;
      }
    }

    if (bestHex && bestScore > 0 && territory.treasury >= CASTLE_COST) {
      const hex = state.hexes.get(hexKey(bestHex.q, bestHex.r))!;
      hex.hasCastle = true;
      hex.hasTree = false;
      hex.hasGrave = false;
      territory.treasury -= CASTLE_COST;
    }
  }

  return state;
}

function aiCombineUnits(state: GameState, playerId: number): GameState {
  const territories = state.territories.filter(t => t.owner === playerId);

  for (const territory of territories) {
    let combinePass = true;
    let passCount = 0;

    while (combinePass && passCount < 5) {
      combinePass = false;
      passCount++;

      const units: { key: string; hex: GameHex; coord: HexCoord }[] = [];
      for (const coord of territory.hexes) {
        const key = hexKey(coord.q, coord.r);
        const hex = state.hexes.get(key);
        if (hex && hex.unitTier !== null) {
          units.push({ key, hex, coord });
        }
      }

      if (units.length < 2) continue;

      const needsStrongerUnit = territory.hexes.some(coord => {
        const neighbors = getNeighbors(coord.q, coord.r);
        return neighbors.some(n => {
          const nh = state.hexes.get(hexKey(n.q, n.r));
          if (!nh || nh.owner === null || nh.owner === playerId) return false;
          const defense = getHexDefenseStrength(n.q, n.r, state.hexes);
          const bestStrength = units.reduce((max, u) =>
            Math.max(max, u.hex.unitTier !== null ? UNIT_STRENGTH[u.hex.unitTier] : 0), 0);
          return defense >= bestStrength;
        });
      });

      const tier0Count = units.filter(u => u.hex.unitTier === 0).length;
      const shouldCombine = needsStrongerUnit || tier0Count >= 4;

      if (!shouldCombine) continue;

      units.sort((a, b) => (a.hex.unitTier ?? 0) - (b.hex.unitTier ?? 0));

      for (let i = 0; i < units.length; i++) {
        const unitA = units[i];
        if (unitA.hex.unitTier === null) continue;

        for (let j = i + 1; j < units.length; j++) {
          const unitB = units[j];
          if (unitB.hex.unitTier === null) continue;

          const combinedStrength = UNIT_STRENGTH[unitA.hex.unitTier] + UNIT_STRENGTH[unitB.hex.unitTier];
          let newTier = -1;
          for (let t = 0; t < UNIT_STRENGTH.length; t++) {
            if (UNIT_STRENGTH[t] === combinedStrength) {
              newTier = t;
              break;
            }
          }
          if (newTier === -1 || newTier > 3) continue;

          const newUpkeep = territory.upkeep
            - UNIT_UPKEEP[unitA.hex.unitTier]
            - UNIT_UPKEEP[unitB.hex.unitTier]
            + UNIT_UPKEEP[newTier];
          const netAfter = territory.income - newUpkeep;
          if (netAfter < -8 && territory.treasury < Math.abs(netAfter) * 2) continue;

          unitB.hex.unitTier = newTier;
          unitB.hex.unitMoved = true;
          unitA.hex.unitTier = null;
          unitA.hex.unitMoved = false;
          territory.upkeep = newUpkeep;
          combinePass = true;
          break;
        }
        if (combinePass) break;
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
