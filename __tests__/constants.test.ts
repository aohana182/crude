import { getTierForCombinedStrength, territoryIncome, INCOME_SOFT_CAP, UNIT_STRENGTH, UNIT_UPKEEP } from '../lib/game/constants';

describe('getTierForCombinedStrength', () => {
  it('two tier-0 units (1+1) combine into tier-1', () => {
    expect(getTierForCombinedStrength(0, 0)).toBe(1);
  });

  it('tier-0 + tier-1 (1+2) combine into tier-2', () => {
    expect(getTierForCombinedStrength(0, 1)).toBe(2);
  });

  it('two tier-1 units (2+2) combine into tier-3', () => {
    expect(getTierForCombinedStrength(1, 1)).toBe(3);
  });

  it('tier-0 + tier-2 (1+3) combine into tier-3', () => {
    expect(getTierForCombinedStrength(0, 2)).toBe(3);
  });

  it('returns -1 when combined strength exceeds the strongest unit', () => {
    expect(getTierForCombinedStrength(0, 3)).toBe(-1);
    expect(getTierForCombinedStrength(1, 2)).toBe(-1);
    expect(getTierForCombinedStrength(2, 2)).toBe(-1);
    expect(getTierForCombinedStrength(3, 3)).toBe(-1);
  });

  it('is symmetric', () => {
    expect(getTierForCombinedStrength(0, 1)).toBe(getTierForCombinedStrength(1, 0));
    expect(getTierForCombinedStrength(1, 2)).toBe(getTierForCombinedStrength(2, 1));
  });
});

describe('UNIT_STRENGTH', () => {
  it('has strictly increasing values', () => {
    for (let i = 1; i < UNIT_STRENGTH.length; i++) {
      expect(UNIT_STRENGTH[i]).toBeGreaterThan(UNIT_STRENGTH[i - 1]);
    }
  });
});

describe('UNIT_UPKEEP', () => {
  it('upkeep curve is at least 3x between each tier (exponential)', () => {
    for (let i = 1; i < UNIT_UPKEEP.length; i++) {
      expect(UNIT_UPKEEP[i]).toBeGreaterThanOrEqual(UNIT_UPKEEP[i - 1] * 3);
    }
  });
});

describe('territoryIncome', () => {
  it('pays 1 per hex up to the soft cap', () => {
    expect(territoryIncome(0)).toBe(0);
    expect(territoryIncome(6)).toBe(6);
    expect(territoryIncome(INCOME_SOFT_CAP)).toBe(INCOME_SOFT_CAP);
  });

  it('pays half rate (rounded down) beyond the soft cap', () => {
    expect(territoryIncome(INCOME_SOFT_CAP + 1)).toBe(INCOME_SOFT_CAP);
    expect(territoryIncome(INCOME_SOFT_CAP + 2)).toBe(INCOME_SOFT_CAP + 1);
    expect(territoryIncome(30)).toBe(20);
  });
});
