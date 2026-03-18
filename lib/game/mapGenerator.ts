import { GameHex, hexKey, HexCoord } from './types';
import { getNeighbors } from './hexUtils';

function seededNoise(q: number, r: number, seed: number): number {
  let h = seed + q * 374761393 + r * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hexDist(aq: number, ar: number, bq: number, br: number): number {
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs((aq + ar) - (bq + br)));
}

export function generateIslandMap(radius: number): Map<string, GameHex> {
  while (true) {
    const { hexes, seed } = buildIslandShape(radius);
    if (hexes.size >= 100) {
      carveLakes(hexes, radius, seed);
      if (hexes.size < 90) continue;
      addTreeClusters(hexes, seed);
      placeNeutralCastles(hexes, seed);
      return hexes;
    }
  }
}

function buildIslandShape(radius: number): { hexes: Map<string, GameHex>; seed: number } {
  const hexes = new Map<string, GameHex>();
  const seed = Math.floor(Math.random() * 100000);

  // Random ellipse shape per game: orientation + aspect ratio
  // This breaks the hex-symmetry and produces varied island outlines
  const angle     = seededNoise(1, 2, seed) * Math.PI;           // 0–180°
  const stretch   = 0.50 + seededNoise(3, 4, seed) * 0.38;       // 0.50–0.88 (how squashed)
  const cos = Math.cos(angle), sin = Math.sin(angle);

  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) > radius) continue;

      // Axial → cartesian (flat-top hex)
      const cx = q + r * 0.5;
      const cy = r * 0.866;

      // Rotate then squash to get ellipse-based distance
      const rx = (cx * cos + cy * sin);
      const ry = (-cx * sin + cy * cos) * stretch;
      const normalizedDist = Math.sqrt(rx * rx + ry * ry) / radius;

      // 4 noise octaves — higher amplitude so noise shapes interior too
      const n1 = seededNoise(q, r, seed) * 0.38;
      const n2 = seededNoise(q * 2 + 5, r * 2 + 11, seed + 999) * 0.26;
      const n3 = seededNoise(q * 5 + 17, r * 5 + 23, seed + 2222) * 0.20;
      const n4 = seededNoise(q * 11 + 37, r * 11 + 43, seed + 4444) * 0.16;
      const totalNoise = n1 + n2 + n3 + n4;

      const edgeFactor = Math.pow(normalizedDist, 1.8);
      const keepChance = 1.0 - edgeFactor + totalNoise * 0.90;

      if (normalizedDist < 0.12 || (keepChance > 0.42 && normalizedDist < 1.05)) {
        hexes.set(hexKey(q, r), {
          q, r,
          owner: null, unitTier: null, unitMoved: false,
          hasNomad: false, hasCapital: false, hasCastle: false,
          hasGrave: false, wasRelocated: false,
        });
      }
    }
  }

  removeDisconnectedHexes(hexes);
  carveWaterPockets(hexes, radius, seed);
  carvePeninsulas(hexes, radius, seed);

  return { hexes, seed };
}

// Carve interior lakes — connected inland water bodies
function carveLakes(hexes: Map<string, GameHex>, radius: number, seed: number): void {
  const lakeCount = 2 + Math.floor(radius / 8);

  for (let i = 0; i < lakeCount; i++) {
    // Find an interior candidate (not too close to edge)
    const interiorKeys = Array.from(hexes.keys()).filter(k => {
      const [q, r] = k.split(',').map(Number);
      return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) < radius * 0.55;
    });
    if (interiorKeys.length === 0) continue;

    const idx = Math.floor(seededNoise(i * 17, i * 31, seed + 77777) * interiorKeys.length) % interiorKeys.length;
    const [cq, cr] = interiorKeys[idx].split(',').map(Number);

    const lakeSize = 4 + Math.floor(seededNoise(i * 7, i * 3, seed + 88888) * 4);
    const lakeSet = new Set<string>([hexKey(cq, cr)]);
    const queue: [number, number][] = [[cq, cr]];

    while (lakeSet.size < lakeSize && queue.length > 0) {
      const [lq, lr] = queue.shift()!;
      for (const n of getNeighbors(lq, lr)) {
        if (lakeSet.size >= lakeSize) break;
        const nk = hexKey(n.q, n.r);
        const dist = Math.max(Math.abs(n.q), Math.abs(n.r), Math.abs(n.q + n.r));
        if (hexes.has(nk) && !lakeSet.has(nk) && dist > 2) {
          lakeSet.add(nk);
          queue.push([n.q, n.r]);
        }
      }
    }

    for (const k of lakeSet) hexes.delete(k);
    removeDisconnectedHexes(hexes);
    if (hexes.size < 90) break; // stop if map getting too small
  }
}

// Forest clusters instead of scattered individual trees
function addTreeClusters(hexes: Map<string, GameHex>, seed: number): void {
  const allKeys = Array.from(hexes.keys());
  const clusterCount = Math.floor(allKeys.length / 16);

  // Deterministic shuffle for cluster centers
  const centerIndices = Array.from({ length: allKeys.length }, (_, i) => i)
    .sort((a, b) => seededNoise(a * 3 + 7, a * 11 + 13, seed + 12345) - seededNoise(b * 3 + 7, b * 11 + 13, seed + 12345));

  for (let ci = 0; ci < Math.min(clusterCount, centerIndices.length); ci++) {
    const centerKey = allKeys[centerIndices[ci]];
    const [cq, cr] = centerKey.split(',').map(Number);
    const center = hexes.get(centerKey);
    if (!center) continue;

    // Mark center
    center.hasNomad = true;

    // Spread to ring-1 with ~55% chance
    for (const n of getNeighbors(cq, cr)) {
      const nk = hexKey(n.q, n.r);
      const nh = hexes.get(nk);
      if (!nh) continue;
      if (seededNoise(n.q * 3 + ci, n.r * 7 + ci, seed + 23456) > 0.45) {
        nh.hasNomad = true;
        // Spread to ring-2 with ~20% chance for dense forest cores
        for (const nn of getNeighbors(n.q, n.r)) {
          const nnh = hexes.get(hexKey(nn.q, nn.r));
          if (!nnh) continue;
          if (seededNoise(nn.q * 11 + ci, nn.r * 13 + ci, seed + 34567) > 0.80) {
            nnh.hasNomad = true;
          }
        }
      }
    }
  }
}

// Place neutral castles on strategic hexes (chokepoints, central land)
function placeNeutralCastles(hexes: Map<string, GameHex>, seed: number): void {
  const castleCount = Math.min(5, Math.max(2, Math.floor(hexes.size / 35)));

  const scored: { key: string; score: number }[] = [];
  for (const [key, hex] of hexes) {
    if (hex.hasNomad) continue;

    const nbrs = getNeighbors(hex.q, hex.r);
    const landCount = nbrs.filter(n => hexes.has(hexKey(n.q, n.r))).length;
    const dist = Math.max(Math.abs(hex.q), Math.abs(hex.r), Math.abs(hex.q + hex.r));

    // Prefer chokepoints (3-4 land neighbors) and moderate distance from center
    const chokeScore = landCount <= 3 ? 3 : landCount <= 4 ? 1 : 0;
    const posScore = dist > 2 ? 2 : 0;
    const noiseScore = seededNoise(hex.q * 7, hex.r * 11, seed + 99999) * 2;

    scored.push({ key, score: chokeScore + posScore + noiseScore });
  }

  scored.sort((a, b) => b.score - a.score);

  const placed: [number, number][] = [];
  const minDist = 4;
  for (const { key } of scored) {
    if (placed.length >= castleCount) break;
    const [q, r] = key.split(',').map(Number);
    if (placed.some(([pq, pr]) => hexDist(q, r, pq, pr) < minDist)) continue;
    placed.push([q, r]);
    hexes.get(key)!.hasCastle = true;
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
    if (!visited.has(key)) hexes.delete(key);
  }
}

function carveWaterPockets(hexes: Map<string, GameHex>, radius: number, seed: number): void {
  const pocketCount = Math.floor(radius * 1.2) + 3;
  const keys = Array.from(hexes.keys());
  for (let i = 0; i < pocketCount; i++) {
    const idx = Math.floor(seededNoise(i * 17, i * 31, seed + 7777) * keys.length);
    const randomKey = keys[idx % keys.length];
    const [q, r] = randomKey.split(',').map(Number);
    const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
    if (dist > 2 && dist < radius - 1) {
      hexes.delete(randomKey);
      // Occasionally carve a 2nd adjacent hex for wider pockets
      if (seededNoise(i, i * 3, seed + 8888) > 0.4) {
        const neighbors = getNeighbors(q, r);
        const ni = Math.floor(seededNoise(i * 5, i * 7, seed + 9999) * neighbors.length);
        const extraKey = hexKey(neighbors[ni].q, neighbors[ni].r);
        const extraDist = Math.max(Math.abs(neighbors[ni].q), Math.abs(neighbors[ni].r), Math.abs(neighbors[ni].q + neighbors[ni].r));
        if (hexes.has(extraKey) && extraDist > 2) hexes.delete(extraKey);
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
    if (dist < radius * 0.55) continue;
    const neighbors = getNeighbors(q, r);
    let landNeighbors = 0;
    for (const n of neighbors) {
      if (hexes.has(hexKey(n.q, n.r))) landNeighbors++;
    }
    if (landNeighbors <= 1 && seededNoise(q * 13, r * 17, seed + 3333) > 0.25) {
      hexes.delete(key);
    }
  }
  removeDisconnectedHexes(hexes);
}

// ─── Starting Positions ───────────────────────────────────────────────────────

export function assignStartingPositions(
  hexes: Map<string, GameHex>,
  playerCount: number,
): void {
  const clustersPerPlayer = 3;
  const clusterSize = 6;
  const totalClusters = playerCount * clustersPerPlayer;
  const minSeedDist = clusterSize + 4; // enough space between cluster seeds

  const allHexes = Array.from(hexes.values());

  // Pick seeds spread across the map with minimum distance constraint
  const seeds = pickSpreadSeeds(allHexes, totalClusters, minSeedDist);

  // Sort seeds by angle from center, then interleave player assignment
  // so each player's territories are scattered across the map (not clumped)
  seeds.sort((a, b) => Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q));

  for (let i = 0; i < seeds.length; i++) {
    growStartingCluster(seeds[i], i % playerCount, clusterSize, hexes);
  }
}

function pickSpreadSeeds(allHexes: GameHex[], count: number, minDist: number): GameHex[] {
  const shuffled = shuffle(allHexes.slice());
  const selected: GameHex[] = [];

  // Try progressively relaxed distance constraints
  for (let attempt = 0; attempt < 4 && selected.length < count; attempt++) {
    const curDist = minDist * Math.pow(0.72, attempt);
    for (const hex of shuffled) {
      if (selected.length >= count) break;
      if (selected.includes(hex)) continue;
      const tooClose = selected.some(s => hexDist(hex.q, hex.r, s.q, s.r) < curDist);
      if (!tooClose) selected.push(hex);
    }
  }

  return selected.slice(0, count);
}

function growStartingCluster(
  start: GameHex,
  player: number,
  targetSize: number,
  hexes: Map<string, GameHex>,
): void {
  if (start.owner !== null) return;

  const startKey = hexKey(start.q, start.r);
  const owned = new Set<string>([startKey]);
  const queue: string[] = [startKey];

  while (owned.size < targetSize && queue.length > 0) {
    const current = queue.shift()!;
    const [cq, cr] = current.split(',').map(Number);
    const neighbors = shuffle(getNeighbors(cq, cr));

    for (const n of neighbors) {
      if (owned.size >= targetSize) break;
      const nk = hexKey(n.q, n.r);
      const nhex = hexes.get(nk);
      if (!nhex || nhex.owner !== null || owned.has(nk)) continue;

      // Enforce 1-hex buffer: candidate must not touch any already-owned hex
      // outside this cluster — keeps all territories non-adjacent
      const touchesExternal = getNeighbors(n.q, n.r).some(nn => {
        const nnh = hexes.get(hexKey(nn.q, nn.r));
        return nnh && nnh.owner !== null && !owned.has(hexKey(nn.q, nn.r));
      });
      if (touchesExternal) continue;

      owned.add(nk);
      queue.push(nk);
    }
  }

  // Assign ownership, clear nomads and castles from starting hexes
  for (const k of owned) {
    const hex = hexes.get(k);
    if (hex) {
      hex.owner = player;
      hex.hasNomad = false;
      hex.hasCastle = false;
    }
  }

  // Place 1 peasant on a border hex
  const ownedArr = Array.from(owned);
  const borderHexes = ownedArr.filter(k => {
    const [hq, hr] = k.split(',').map(Number);
    return getNeighbors(hq, hr).some(n => {
      const nh = hexes.get(hexKey(n.q, n.r));
      return !nh || nh.owner !== player;
    });
  });

  const placements = shuffle(borderHexes.length > 0 ? borderHexes : ownedArr);
  const hex = hexes.get(placements[0]);
  if (hex) {
    hex.unitTier = 0;
    hex.unitMoved = false;
    hex.hasNomad = false;
  }
}
