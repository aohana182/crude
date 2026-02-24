import { HexCoord, hexKey } from './types';
import { HEX_SIZE } from './constants';

export const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function getNeighbors(q: number, r: number): HexCoord[] {
  return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexToPixel(q: number, r: number, size: number = HEX_SIZE): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = size * ((3 / 2) * r);
  return { x, y };
}

export function pixelToHex(px: number, py: number, size: number = HEX_SIZE): HexCoord {
  const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / size;
  const r = ((2 / 3) * py) / size;
  return hexRound(q, r);
}

function hexRound(q: number, r: number): HexCoord {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function getHexCorners(cx: number, cy: number, size: number = HEX_SIZE): string {
  const corners: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle);
    corners.push(`${x},${y}`);
  }
  return corners.join(' ');
}

export function findConnectedRegion(
  startQ: number,
  startR: number,
  owner: number,
  hexMap: Map<string, { owner: number | null }>,
): Set<string> {
  const visited = new Set<string>();
  const queue: HexCoord[] = [{ q: startQ, r: startR }];
  const startKey = hexKey(startQ, startR);
  visited.add(startKey);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = getNeighbors(current.q, current.r);
    for (const n of neighbors) {
      const nk = hexKey(n.q, n.r);
      if (visited.has(nk)) continue;
      const hex = hexMap.get(nk);
      if (hex && hex.owner === owner) {
        visited.add(nk);
        queue.push(n);
      }
    }
  }
  return visited;
}
