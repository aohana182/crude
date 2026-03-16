import { GameHex, hexKey } from '../lib/game/types';
import {
  detectTerritories,
  enforceMinTerritorySize,
  getHexDefenseStrength,
  buildHexTerritoryMap,
  mergeTerritoryTreasuries,
  syncTerritoryTreasuries,
  updateTerritoryEconomy,
} from '../lib/game/territoryManager';
import { CASTLE_DEFENSE, UNIT_STRENGTH } from '../lib/game/constants';

function makeHex(q: number, r: number, overrides: Partial<GameHex> = {}): GameHex {
  return {
    q, r,
    owner: null,
    unitTier: null,
    unitMoved: false,
    hasNomad: false,
    hasCapital: false,
    hasCastle: false,
    hasGrave: false,
    wasRelocated: false,
    ...overrides,
  };
}

function makeMap(hexes: GameHex[]): Map<string, GameHex> {
  const m = new Map<string, GameHex>();
  for (const h of hexes) m.set(hexKey(h.q, h.r), h);
  return m;
}

// Build a small 3-hex strip owned by player 0: (0,0)-(1,0)-(2,0)
function makeStrip(owner: number): Map<string, GameHex> {
  return makeMap([
    makeHex(0, 0, { owner }),
    makeHex(1, 0, { owner }),
    makeHex(2, 0, { owner }),
  ]);
}

describe('detectTerritories', () => {
  it('detects a single contiguous territory', () => {
    const hexes = makeStrip(0);
    const territories = detectTerritories(hexes);
    expect(territories).toHaveLength(1);
    expect(territories[0].owner).toBe(0);
    expect(territories[0].hexes).toHaveLength(3);
  });

  it('detects two separate territories for different owners', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }),
      makeHex(1, 0, { owner: 0 }),
      makeHex(5, 0, { owner: 1 }),
      makeHex(6, 0, { owner: 1 }),
    ]);
    const territories = detectTerritories(hexes);
    expect(territories).toHaveLength(2);
    expect(territories.map(t => t.owner).sort()).toEqual([0, 1]);
  });

  it('skips territories below MIN_TERRITORY_SIZE', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }), // single hex — below min size
      makeHex(5, 0, { owner: 1 }),
      makeHex(6, 0, { owner: 1 }),
    ]);
    const territories = detectTerritories(hexes);
    const owners = territories.map(t => t.owner);
    expect(owners).not.toContain(0);
    expect(owners).toContain(1);
  });

  it('calculates income correctly (nomads block income)', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }),
      makeHex(1, 0, { owner: 0, hasNomad: true }),
      makeHex(0, 1, { owner: 0 }),
    ]);
    const territories = detectTerritories(hexes);
    expect(territories[0].income).toBe(2); // 3 hexes - 1 nomad
  });

  it('calculates upkeep correctly', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0, unitTier: 0 }),
      makeHex(1, 0, { owner: 0, unitTier: 1 }),
      makeHex(0, 1, { owner: 0 }),
    ]);
    const territories = detectTerritories(hexes);
    expect(territories[0].upkeep).toBe(2 + 6); // tier-0 + tier-1
  });

  it('places a capital when none exists', () => {
    const hexes = makeStrip(0);
    const territories = detectTerritories(hexes);
    expect(territories[0].capitalHex).not.toBeNull();
    // capital should be on an owned hex
    const capKey = hexKey(territories[0].capitalHex!.q, territories[0].capitalHex!.r);
    expect(hexes.has(capKey)).toBe(true);
  });
});

describe('enforceMinTerritorySize', () => {
  it('kills units in undersized territories and marks graves', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0, unitTier: 1, hasCapital: true }),
    ]);
    const territories = detectTerritories(hexes);
    enforceMinTerritorySize(hexes, territories);
    const h = hexes.get('0,0')!;
    expect(h.unitTier).toBeNull();
    expect(h.hasGrave).toBe(true);
    expect(h.hasCapital).toBe(false);
  });

  it('does not affect territories meeting minimum size', () => {
    const hexes = makeStrip(0);
    hexes.get('0,0')!.unitTier = 1;
    const territories = detectTerritories(hexes);
    enforceMinTerritorySize(hexes, territories);
    expect(hexes.get('0,0')!.unitTier).toBe(1);
  });
});

describe('getHexDefenseStrength', () => {
  it('returns 0 for unowned hex', () => {
    const hexes = makeMap([makeHex(0, 0)]);
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(0);
  });

  it('returns unit strength for hex with unit', () => {
    const hexes = makeMap([makeHex(0, 0, { owner: 0, unitTier: 2 })]);
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(UNIT_STRENGTH[2]);
  });

  it('capital defends at strength 1', () => {
    const hexes = makeMap([makeHex(0, 0, { owner: 0, hasCapital: true })]);
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(1);
  });

  it('castle defends at CASTLE_DEFENSE', () => {
    const hexes = makeMap([makeHex(0, 0, { owner: 0, hasCastle: true })]);
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(CASTLE_DEFENSE);
  });

  it('adjacent friendly unit contributes to defense', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }),              // target (no unit)
      makeHex(1, 0, { owner: 0, unitTier: 2 }), // adjacent friendly tier-2
    ]);
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(UNIT_STRENGTH[2]);
  });

  it('adjacent enemy unit does NOT contribute', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }),
      makeHex(1, 0, { owner: 1, unitTier: 3 }),
    ]);
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(0);
  });

  it('takes maximum of all contributing sources', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0, unitTier: 0, hasCapital: true }),
      makeHex(1, 0, { owner: 0, unitTier: 2 }),
      makeHex(0, 1, { owner: 0, hasCastle: true }),
    ]);
    // target is (0,0): own unit=1, capital=1, adj unit=3, adj castle=2 → max=3
    expect(getHexDefenseStrength(0, 0, hexes)).toBe(UNIT_STRENGTH[2]);
  });
});

describe('buildHexTerritoryMap', () => {
  it('maps every hex to its territory id', () => {
    const hexes = makeStrip(0);
    const territories = detectTerritories(hexes);
    const map = buildHexTerritoryMap(territories);
    expect(map.get('0,0')).toBe(territories[0].id);
    expect(map.get('1,0')).toBe(territories[0].id);
    expect(map.get('2,0')).toBe(territories[0].id);
  });

  it('returns correct ids for multiple territories', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }),
      makeHex(1, 0, { owner: 0 }),
      makeHex(5, 0, { owner: 1 }),
      makeHex(6, 0, { owner: 1 }),
    ]);
    const territories = detectTerritories(hexes);
    const map = buildHexTerritoryMap(territories);
    expect(map.get('0,0')).toBe(map.get('1,0'));
    expect(map.get('5,0')).toBe(map.get('6,0'));
    expect(map.get('0,0')).not.toBe(map.get('5,0'));
  });
});

describe('mergeTerritoryTreasuries', () => {
  it('sums treasuries from multiple old territories into one new territory', () => {
    const old = [
      { id: 'a', owner: 0, hexes: [{ q: 0, r: 0 }], treasury: 10, income: 1, upkeep: 0, capitalHex: null },
      { id: 'b', owner: 0, hexes: [{ q: 1, r: 0 }], treasury: 20, income: 1, upkeep: 0, capitalHex: null },
    ];
    const newT = [
      { id: 'c', owner: 0, hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }], treasury: 0, income: 2, upkeep: 0, capitalHex: null },
    ];
    mergeTerritoryTreasuries(old, newT);
    expect(newT[0].treasury).toBe(30);
  });

  it('does not merge across owners', () => {
    const old = [
      { id: 'a', owner: 0, hexes: [{ q: 0, r: 0 }], treasury: 50, income: 1, upkeep: 0, capitalHex: null },
    ];
    const newT = [
      { id: 'b', owner: 1, hexes: [{ q: 0, r: 0 }], treasury: 0, income: 1, upkeep: 0, capitalHex: null },
    ];
    mergeTerritoryTreasuries(old, newT);
    expect(newT[0].treasury).toBe(0);
  });
});

describe('syncTerritoryTreasuries', () => {
  it('copies treasury from best-matching old territory', () => {
    const old = [
      { id: 'a', owner: 0, hexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }], treasury: 42, income: 2, upkeep: 0, capitalHex: null },
    ];
    const newT = [
      { id: 'b', owner: 0, hexes: [{ q: 0, r: 0 }], treasury: 0, income: 1, upkeep: 0, capitalHex: null },
    ];
    syncTerritoryTreasuries(old, newT);
    expect(newT[0].treasury).toBe(42);
  });
});

describe('updateTerritoryEconomy', () => {
  it('adds income and subtracts upkeep from treasury', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0, unitTier: 0 }),
      makeHex(1, 0, { owner: 0 }),
      makeHex(0, 1, { owner: 0 }),
    ]);
    let territories = detectTerritories(hexes);
    territories[0] = { ...territories[0], treasury: 20 };
    territories = updateTerritoryEconomy(territories, hexes, 0);
    // income=3, upkeep=2 → net +1 → treasury 21
    expect(territories[0].treasury).toBe(21);
  });

  it('triggers bankruptcy when treasury goes negative', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0, unitTier: 2 }), // upkeep 18
      makeHex(1, 0, { owner: 0 }),
      makeHex(0, 1, { owner: 0 }),
    ]);
    let territories = detectTerritories(hexes);
    territories[0] = { ...territories[0], treasury: 0 };
    territories = updateTerritoryEconomy(territories, hexes, 0);
    // income=3, upkeep=18 → net -15 → bankrupt
    expect(hexes.get('0,0')!.unitTier).toBeNull();
    expect(hexes.get('0,0')!.hasGrave).toBe(true);
    expect(territories[0].treasury).toBe(0);
  });

  it('does not affect other players territories', () => {
    const hexes = makeMap([
      makeHex(0, 0, { owner: 0 }),
      makeHex(1, 0, { owner: 0 }),
      makeHex(5, 0, { owner: 1 }),
      makeHex(6, 0, { owner: 1 }),
    ]);
    let territories = detectTerritories(hexes);
    const p1TerritoryBefore = territories.find(t => t.owner === 1)!.treasury;
    territories = updateTerritoryEconomy(territories, hexes, 0);
    const p1TerritoryAfter = territories.find(t => t.owner === 1)!.treasury;
    expect(p1TerritoryAfter).toBe(p1TerritoryBefore);
  });
});
