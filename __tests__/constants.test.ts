import { getTierForCombinedStrength, UNIT_STRENGTH, UNIT_UPKEEP } from '../lib/game/constants';

describe('getTierForCombinedStrength', () => {
  it('two tier-0 units combine into tier-1', () => {
    expect(getTierForCombinedStrength(0, 0)).toBe(1);
  });

  it('two tier-1 units combine into tier-2', () => {
    expect(getTierForCombinedStrength(1, 1)).toBe(2);
  });

  it('two tier-2 units combine into tier-3', () => {
    expect(getTierForCombinedStrength(2, 2)).toBe(3);
  });

  it('returns -1 when combined strength exceeds max tier', () => {
    expect(getTierForCombinedStrength(3, 3)).toBe(-1);
  });

  it('returns -1 for mismatched tiers (only same-tier combining is valid)', () => {
    expect(getTierForCombinedStrength(0, 2)).toBe(-1);
    expect(getTierForCombinedStrength(0, 3)).toBe(-1);
    expect(getTierForCombinedStrength(1, 2)).toBe(-1);
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
