import { getNeighbors, hexDistance, hexToPixel, pixelToHex, findConnectedRegion } from '../lib/game/hexUtils';
import { hexKey } from '../lib/game/types';

describe('getNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    expect(getNeighbors(0, 0)).toHaveLength(6);
    expect(getNeighbors(5, -3)).toHaveLength(6);
  });

  it('neighbors of origin are correct', () => {
    const neighbors = getNeighbors(0, 0);
    const keys = neighbors.map(n => hexKey(n.q, n.r)).sort();
    expect(keys).toEqual(['$-1,0', '$-1,1', '$0,-1', '$0,1', '$1,-1', '$1,0'].map(k => k.replace('$', '')).sort());
  });

  it('neighbor relationship is symmetric', () => {
    const neighbors = getNeighbors(2, -1);
    for (const n of neighbors) {
      const backNeighbors = getNeighbors(n.q, n.r);
      expect(backNeighbors.some(b => b.q === 2 && b.r === -1)).toBe(true);
    }
  });
});

describe('hexDistance', () => {
  it('distance from a hex to itself is 0', () => {
    expect(hexDistance({ q: 3, r: -2 }, { q: 3, r: -2 })).toBe(0);
  });

  it('distance to adjacent hex is 1', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 1 })).toBe(1);
    expect(hexDistance({ q: 0, r: 0 }, { q: -1, r: 1 })).toBe(1);
  });

  it('is symmetric', () => {
    const a = { q: 3, r: -2 };
    const b = { q: -1, r: 4 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('known distance', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 2 })).toBe(4);
  });
});

describe('hexToPixel / pixelToHex roundtrip', () => {
  it('roundtrips correctly', () => {
    const cases = [
      { q: 0, r: 0 }, { q: 3, r: -2 }, { q: -4, r: 1 }, { q: 5, r: 5 },
    ];
    for (const c of cases) {
      const { x, y } = hexToPixel(c.q, c.r, 18);
      const back = pixelToHex(x, y, 18);
      expect(back.q).toBe(c.q);
      expect(back.r).toBe(c.r);
    }
  });
});

describe('findConnectedRegion', () => {
  it('finds single hex region', () => {
    const map = new Map([['0,0', { owner: 1 }]]);
    const region = findConnectedRegion(0, 0, 1, map);
    expect(region.has('0,0')).toBe(true);
    expect(region.size).toBe(1);
  });

  it('finds contiguous region', () => {
    const map = new Map([
      ['0,0', { owner: 1 }],
      ['1,0', { owner: 1 }],
      ['0,1', { owner: 1 }],
      ['5,5', { owner: 1 }], // disconnected
    ]);
    const region = findConnectedRegion(0, 0, 1, map);
    expect(region.size).toBe(3);
    expect(region.has('5,5')).toBe(false);
  });

  it('does not cross ownership boundaries', () => {
    const map = new Map([
      ['0,0', { owner: 1 }],
      ['1,0', { owner: 2 }],
      ['0,1', { owner: 1 }],
    ]);
    const region = findConnectedRegion(0, 0, 1, map);
    expect(region.has('1,0')).toBe(false);
  });
});
