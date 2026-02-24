import { GameHex, Territory, hexKey, coordFromKey, HexCoord } from './types';
import { findConnectedRegion, getNeighbors } from './hexUtils';
import { UNIT_UPKEEP, UNIT_STRENGTH, MIN_TERRITORY_SIZE, CASTLE_DEFENSE } from './constants';

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
          capitalHex = coord;
        }
        if (!h.hasTree && !h.hasGrave) {
          income += 1;
        }
      }
    }

    if (hexCoords.length < MIN_TERRITORY_SIZE) {
      for (const c of hexCoords) {
        const h = hexes.get(hexKey(c.q, c.r));
        if (h) {
          h.hasCapital = false;
          if (h.unitTier !== null) {
            h.unitTier = null;
            h.unitMoved = false;
          }
        }
      }
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
        capHexObj.hasTree = false;
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
        if (!hex.hasTree && !hex.hasGrave) {
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

export function getHexDefenseStrength(
  q: number,
  r: number,
  hexes: Map<string, GameHex>,
): number {
  const hex = hexes.get(hexKey(q, r));
  if (!hex || hex.owner === null) return 0;

  const owner = hex.owner;
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
    const nh = hexes.get(hexKey(n.q, n.r));
    if (!nh || nh.owner !== owner) continue;

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

export function getBorderHexes(
  territory: Territory,
  hexes: Map<string, GameHex>,
): HexCoord[] {
  const borders: HexCoord[] = [];
  const hexSet = new Set(territory.hexes.map((h) => hexKey(h.q, h.r)));

  for (const coord of territory.hexes) {
    const neighbors = getNeighbors(coord.q, coord.r);
    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      const nh = hexes.get(nk);
      if (!nh || (nh.owner !== null && nh.owner !== territory.owner)) {
        if (!borders.some((b) => b.q === coord.q && b.r === coord.r)) {
          borders.push(coord);
        }
        break;
      }
    }
  }

  return borders;
}

export function getAttackableHexes(
  territory: Territory,
  hexes: Map<string, GameHex>,
): { from: HexCoord; to: HexCoord; defenseStrength: number }[] {
  const attackable: { from: HexCoord; to: HexCoord; defenseStrength: number }[] = [];

  for (const coord of territory.hexes) {
    const neighbors = getNeighbors(coord.q, coord.r);
    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      const nh = hexes.get(nk);
      if (nh && ((nh.owner !== null && nh.owner !== territory.owner) || nh.owner === null)) {
        const defense = nh.owner !== null ? getHexDefenseStrength(n.q, n.r, hexes) : 0;
        attackable.push({
          from: coord,
          to: { q: n.q, r: n.r },
          defenseStrength: defense,
        });
      }
    }
  }

  return attackable;
}
