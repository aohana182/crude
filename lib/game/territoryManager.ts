import { GameHex, Territory, hexKey, coordFromKey, HexCoord } from './types';
import { findConnectedRegion, getNeighbors } from './hexUtils';
import { UNIT_UPKEEP, UNIT_STRENGTH, MIN_TERRITORY_SIZE, CASTLE_DEFENSE } from './constants';

/**
 * Kills units and removes capitals from territories that are too small
 * to sustain themselves. Must be called explicitly after detectTerritories
 * at points in the game loop where such enforcement is appropriate.
 */
export function enforceMinTerritorySize(
  hexes: Map<string, GameHex>,
  territories: Territory[],
): void {
  // Build the set of hex keys that belong to a valid (large enough) territory
  const validHexKeys = new Set<string>();
  for (const t of territories) {
    for (const h of t.hexes) validHexKeys.add(hexKey(h.q, h.r));
  }

  // Kill units on owned hexes that aren't part of any valid territory
  for (const [key, h] of hexes) {
    if (h.owner === null || validHexKeys.has(key)) continue;
    h.hasCapital = false;
    if (h.unitTier !== null) {
      h.unitTier = null;
      h.unitMoved = false;
      h.hasGrave = true;
    }
  }
}

export function detectTerritories(hexes: Map<string, GameHex>): Territory[] {
  const visited = new Set<string>();
  const territories: Territory[] = [];
  let territoryId = 0;

  for (const [key, hex] of hexes) {
    if (visited.has(key) || hex.owner === null) continue;

    const region = findConnectedRegion(hex.q, hex.r, hex.owner, hexes as any);
    for (const rk of region) {
      visited.add(rk);
    }

    const hexCoords: HexCoord[] = [];
    let upkeep = 0;
    let capitalHex: HexCoord | null = null;
    let income = 0;

    for (const rk of region) {
      const coord = coordFromKey(rk);
      hexCoords.push(coord);
      const h = hexes.get(rk);
      if (h) {
        if (h.unitTier !== null) {
          upkeep += UNIT_UPKEEP[h.unitTier];
        }
        if (h.hasCapital) {
          if (!capitalHex) {
            capitalHex = coord;
          } else {
            h.hasCapital = false; // remove duplicate — territories merged
          }
        }
        if (!h.hasNomad) {
          income += 1;
        }
      }
    }

    if (hexCoords.length < MIN_TERRITORY_SIZE) {
      continue;
    }

    if (!capitalHex) {
      let bestHex = hexCoords[0];
      let bestDist = Infinity;
      const avgQ = hexCoords.reduce((s, c) => s + c.q, 0) / hexCoords.length;
      const avgR = hexCoords.reduce((s, c) => s + c.r, 0) / hexCoords.length;
      for (const c of hexCoords) {
        const h = hexes.get(hexKey(c.q, c.r));
        if (h && (h.unitTier !== null || h.hasCastle)) continue;
        const d = Math.abs(c.q - avgQ) + Math.abs(c.r - avgR);
        if (d < bestDist) {
          bestDist = d;
          bestHex = c;
        }
      }
      capitalHex = bestHex;
      const capHexObj = hexes.get(hexKey(bestHex.q, bestHex.r));
      if (capHexObj) {
        capHexObj.hasCapital = true;
        capHexObj.hasNomad = false;
        capHexObj.hasGrave = false;
      }
    }

    territories.push({
      id: `t${territoryId++}`,
      owner: hex.owner,
      hexes: hexCoords,
      treasury: 0,
      income,
      upkeep,
      capitalHex,
    });
  }

  return territories;
}

export function updateTerritoryEconomy(
  territories: Territory[],
  hexes: Map<string, GameHex>,
  playerId: number,
): Territory[] {
  return territories.map((t) => {
    if (t.owner !== playerId) return t;

    let upkeep = 0;
    let income = 0;
    for (const coord of t.hexes) {
      const hex = hexes.get(hexKey(coord.q, coord.r));
      if (hex) {
        if (hex.unitTier !== null) {
          upkeep += UNIT_UPKEEP[hex.unitTier];
        }
        if (!hex.hasNomad) {
          income += 1;
        }
      }
    }

    const newTreasury = t.treasury + income - upkeep;

    if (newTreasury < 0) {
      for (const coord of t.hexes) {
        const hex = hexes.get(hexKey(coord.q, coord.r));
        if (hex && hex.unitTier !== null) {
          hex.unitTier = null;
          hex.unitMoved = false;
          hex.hasGrave = true;
        }
      }
      return { ...t, treasury: 0, upkeep: 0, income };
    }

    return { ...t, treasury: newTreasury, upkeep, income };
  });
}

/**
 * Returns the effective defense strength of a hex.
 * Classic Slay rule: units/castles/capitals defend their own hex AND adjacent
 * hexes within the SAME territory. Pass hexTerritoryMap to enforce the
 * same-territory constraint; omit it to fall back to owner-only check.
 */
export function getHexDefenseStrength(
  q: number,
  r: number,
  hexes: Map<string, GameHex>,
  hexTerritoryMap?: Map<string, string>,
): number {
  const targetKey = hexKey(q, r);
  const hex = hexes.get(targetKey);
  if (!hex || hex.owner === null) return 0;

  const owner = hex.owner;
  const targetTerritoryId = hexTerritoryMap?.get(targetKey);
  let maxDefense = 0;

  if (hex.unitTier !== null) {
    maxDefense = Math.max(maxDefense, UNIT_STRENGTH[hex.unitTier]);
  }
  if (hex.hasCapital) {
    maxDefense = Math.max(maxDefense, 1);
  }
  if (hex.hasCastle) {
    maxDefense = Math.max(maxDefense, CASTLE_DEFENSE);
  }

  const neighbors = getNeighbors(q, r);
  for (const n of neighbors) {
    const nk = hexKey(n.q, n.r);
    const nh = hexes.get(nk);
    if (!nh || nh.owner !== owner) continue;

    // Enforce same-territory constraint (classic Slay rule)
    if (hexTerritoryMap && targetTerritoryId && hexTerritoryMap.get(nk) !== targetTerritoryId) continue;

    if (nh.unitTier !== null) {
      maxDefense = Math.max(maxDefense, UNIT_STRENGTH[nh.unitTier]);
    }
    if (nh.hasCapital) {
      maxDefense = Math.max(maxDefense, 1);
    }
    if (nh.hasCastle) {
      maxDefense = Math.max(maxDefense, CASTLE_DEFENSE);
    }
  }

  return maxDefense;
}

/** Pre-computes a hex-key → territory-id map for O(1) same-territory checks. */
export function buildHexTerritoryMap(territories: Territory[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of territories) {
    for (const h of t.hexes) {
      map.set(hexKey(h.q, h.r), t.id);
    }
  }
  return map;
}

export function isInSameTerritory(
  q1: number,
  r1: number,
  q2: number,
  r2: number,
  territories: Territory[],
): boolean {
  const k1 = hexKey(q1, r1);
  const k2 = hexKey(q2, r2);

  for (const t of territories) {
    let has1 = false;
    let has2 = false;
    for (const h of t.hexes) {
      const k = hexKey(h.q, h.r);
      if (k === k1) has1 = true;
      if (k === k2) has2 = true;
    }
    if (has1 && has2) return true;
  }
  return false;
}

export function getTerritoryForHex(
  q: number,
  r: number,
  territories: Territory[],
): Territory | null {
  const key = hexKey(q, r);
  for (const t of territories) {
    for (const h of t.hexes) {
      if (hexKey(h.q, h.r) === key) return t;
    }
  }
  return null;
}

/**
 * Sync treasury values from oldTerritories to newTerritories by summing
 * contributions from all old territories that overlap with each new one.
 * Used when territories merge (conquest) or are re-detected after mutations.
 */
export function mergeTerritoryTreasuries(
  oldTerritories: Territory[],
  newTerritories: Territory[],
): void {
  for (const newT of newTerritories) {
    const newHexSet = new Set(newT.hexes.map((h: HexCoord) => hexKey(h.q, h.r)));
    let total = 0;
    let matched = 0;
    for (const oldT of oldTerritories) {
      if (oldT.owner !== newT.owner) continue;
      const overlaps = oldT.hexes.some(h => newHexSet.has(hexKey(h.q, h.r)));
      if (overlaps) {
        total += oldT.treasury;
        matched++;
      }
    }
    if (matched > 0) newT.treasury = total;
  }
}

/**
 * Sync treasury when territories are re-detected without ownership changes
 * (e.g. unit moved, nomad cleared, territory split).
 *
 * Classic Slay rule on split: the largest fragment keeps the full treasury;
 * all smaller fragments start with 0.
 */
export function syncTerritoryTreasuries(
  oldTerritories: Territory[],
  newTerritories: Territory[],
): void {
  for (const oldT of oldTerritories) {
    const oldHexSet = new Set(oldT.hexes.map((h: HexCoord) => hexKey(h.q, h.r)));

    // Find all new fragments of same owner that overlap with this old territory
    const overlapping = newTerritories
      .filter(newT =>
        newT.owner === oldT.owner &&
        newT.hexes.some(h => oldHexSet.has(hexKey(h.q, h.r)))
      )
      .sort((a, b) => b.hexes.length - a.hexes.length); // largest first

    if (overlapping.length === 0) continue;

    // Largest fragment keeps the full treasury
    overlapping[0].treasury = oldT.treasury;
    // All smaller fragments start with 0
    for (let i = 1; i < overlapping.length; i++) {
      overlapping[i].treasury = 0;
    }
  }
}

