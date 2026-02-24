import { GameHex, hexKey, HexCoord } from './types';
import { getNeighbors } from './hexUtils';

function seededNoise(q: number, r: number, seed: number): number {
  let h = seed + q * 374761393 + r * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

export function generateIslandMap(radius: number): Map<string, GameHex> {
  const hexes = new Map<string, GameHex>();
  const allCoords: HexCoord[] = [];
  const seed = Math.floor(Math.random() * 100000);

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) <= radius) {
        allCoords.push({ q, r });
      }
    }
  }

  for (const coord of allCoords) {
    const dist = Math.max(Math.abs(coord.q), Math.abs(coord.r), Math.abs(coord.q + coord.r));
    const normalizedDist = dist / radius;

    const n1 = seededNoise(coord.q, coord.r, seed) * 0.5;
    const n2 = seededNoise(coord.q * 3 + 7, coord.r * 3 + 13, seed + 999) * 0.3;
    const n3 = seededNoise(coord.q * 7 + 31, coord.r * 7 + 41, seed + 5555) * 0.2;
    const totalNoise = n1 + n2 + n3;

    const edgeFactor = Math.pow(normalizedDist, 1.5);
    const keepChance = 1.0 - edgeFactor + totalNoise * 0.6;

    const isLand = dist <= 3 || (keepChance > 0.45 && normalizedDist < 0.95);

    if (isLand) {
      hexes.set(hexKey(coord.q, coord.r), {
        q: coord.q,
        r: coord.r,
        owner: null,
        unitTier: null,
        unitMoved: false,
        hasTree: false,
        hasCapital: false,
        hasCastle: false,
        hasGrave: false,
        wasChopped: false,
      });
    }
  }

  removeDisconnectedHexes(hexes);
  carveWaterPockets(hexes, radius, seed);
  carvePeninsulas(hexes, radius, seed);

  if (hexes.size < 80) {
    return generateIslandMap(radius);
  }

  addTrees(hexes, seed);

  return hexes;
}

function addTrees(hexes: Map<string, GameHex>, seed: number): void {
  const keys = Array.from(hexes.keys());

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const hex = hexes.get(key)!;
    const [q, r] = key.split(',').map(Number);

    const neighbors = getNeighbors(q, r);
    let landNeighborCount = 0;
    for (const n of neighbors) {
      if (hexes.has(hexKey(n.q, n.r))) landNeighborCount++;
    }

    const isCoastal = landNeighborCount < 6;

    if (isCoastal && seededNoise(q * 11, r * 17, seed + 4444) > 0.75) {
      hex.hasTree = true;
    } else if (!isCoastal && seededNoise(q * 23, r * 29, seed + 6666) > 0.92) {
      hex.hasTree = true;
    }
  }
}

function removeDisconnectedHexes(hexes: Map<string, GameHex>): void {
  if (hexes.size === 0) return;

  const firstKey = hexes.keys().next().value!;
  const [sq, sr] = firstKey.split(',').map(Number);
  const visited = new Set<string>();
  const queue: HexCoord[] = [{ q: sq, r: sr }];
  visited.add(firstKey);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of getNeighbors(current.q, current.r)) {
      const nk = hexKey(n.q, n.r);
      if (!visited.has(nk) && hexes.has(nk)) {
        visited.add(nk);
        queue.push(n);
      }
    }
  }

  for (const key of Array.from(hexes.keys())) {
    if (!visited.has(key)) {
      hexes.delete(key);
    }
  }
}

function carveWaterPockets(hexes: Map<string, GameHex>, radius: number, seed: number): void {
  const pocketCount = Math.floor(radius * 0.8) + 2;
  const keys = Array.from(hexes.keys());

  for (let i = 0; i < pocketCount; i++) {
    const idx = Math.floor(seededNoise(i * 17, i * 31, seed + 7777) * keys.length);
    const randomKey = keys[idx % keys.length];
    const [q, r] = randomKey.split(',').map(Number);
    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

    if (dist > 2 && dist < radius - 1) {
      hexes.delete(randomKey);

      if (seededNoise(i, i * 3, seed + 8888) > 0.5) {
        const neighbors = getNeighbors(q, r);
        const ni = Math.floor(seededNoise(i * 5, i * 7, seed + 9999) * neighbors.length);
        const extraKey = hexKey(neighbors[ni].q, neighbors[ni].r);
        const extraDist = Math.max(Math.abs(neighbors[ni].q), Math.abs(neighbors[ni].r), Math.abs(neighbors[ni].q + neighbors[ni].r));
        if (hexes.has(extraKey) && extraDist > 2) {
          hexes.delete(extraKey);
        }
      }
    }
  }

  removeDisconnectedHexes(hexes);
}

function carvePeninsulas(hexes: Map<string, GameHex>, radius: number, seed: number): void {
  const keys = Array.from(hexes.keys());
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const [q, r] = key.split(',').map(Number);
    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

    if (dist < radius * 0.6) continue;

    const neighbors = getNeighbors(q, r);
    let landNeighbors = 0;
    for (const n of neighbors) {
      if (hexes.has(hexKey(n.q, n.r))) landNeighbors++;
    }

    if (landNeighbors <= 1 && seededNoise(q * 13, r * 17, seed + 3333) > 0.3) {
      hexes.delete(key);
    }
  }

  removeDisconnectedHexes(hexes);
}

export function assignStartingPositions(
  hexes: Map<string, GameHex>,
  playerCount: number,
): void {
  const allHexes = Array.from(hexes.values());
  const totalHexes = allHexes.length;
  const hexesPerPlayer = Math.floor(totalHexes * 0.15);

  const outerHexes = allHexes
    .map((h) => {
      const dist = Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r));
      return { hex: h, dist };
    })
    .filter((e) => e.dist >= 3)
    .sort((a, b) => b.dist - a.dist);

  const startPositions: GameHex[] = [];
  if (outerHexes.length >= playerCount) {
    const angleStep = (2 * Math.PI) / playerCount;
    for (let i = 0; i < playerCount; i++) {
      const targetAngle = angleStep * i - Math.PI;
      let best = outerHexes[0].hex;
      let bestScore = -Infinity;

      for (const entry of outerHexes) {
        const angle = Math.atan2(entry.hex.r + entry.hex.q * 0.5, entry.hex.q * Math.sqrt(3) / 2);
        let angleDiff = Math.abs(angle - targetAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const score = entry.dist * 2 - angleDiff * 5;
        if (score > bestScore) {
          bestScore = score;
          best = entry.hex;
        }
      }
      startPositions.push(best);
    }
  } else {
    for (let i = 0; i < playerCount; i++) {
      startPositions.push(allHexes[Math.floor(allHexes.length / (playerCount + 1) * (i + 1))]);
    }
  }

  for (let p = 0; p < playerCount; p++) {
    const start = startPositions[p];
    const owned = new Set<string>();
    const queue: string[] = [hexKey(start.q, start.r)];
    owned.add(queue[0]);

    while (owned.size < hexesPerPlayer && queue.length > 0) {
      const current = queue.shift()!;
      const [cq, cr] = current.split(',').map(Number);
      const neighbors = getNeighbors(cq, cr);

      const shuffled = neighbors.sort(() => Math.random() - 0.5);
      for (const n of shuffled) {
        const nk = hexKey(n.q, n.r);
        const hex = hexes.get(nk);
        if (hex && hex.owner === null && !owned.has(nk)) {
          owned.add(nk);
          queue.push(nk);
          if (owned.size >= hexesPerPlayer) break;
        }
      }
    }

    for (const k of owned) {
      const hex = hexes.get(k);
      if (hex) {
        hex.owner = p;
        hex.hasTree = false;
      }
    }

    const ownedArr = Array.from(owned);
    const borderHexes: string[] = [];
    const interiorHexes: string[] = [];

    for (const k of ownedArr) {
      const [hq, hr] = k.split(',').map(Number);
      const neighbors = getNeighbors(hq, hr);
      const isBorder = neighbors.some(n => {
        const nk = hexKey(n.q, n.r);
        const nh = hexes.get(nk);
        return !nh || (nh.owner !== p);
      });
      if (isBorder) {
        borderHexes.push(k);
      } else {
        interiorHexes.push(k);
      }
    }

    const unitPlacements = borderHexes.length > 0 ? borderHexes : ownedArr;
    const startingUnits = Math.min(3, unitPlacements.length);
    const shuffledPlacements = unitPlacements.sort(() => Math.random() - 0.5);

    for (let i = 0; i < startingUnits; i++) {
      const hex = hexes.get(shuffledPlacements[i]);
      if (hex && !hex.hasCapital) {
        hex.unitTier = 0;
        hex.unitMoved = false;
      }
    }
  }
}
