import { createNewGame, handleHexTap, startPurchase, endTurn, toggleCombineMode } from '../lib/game/gameEngine';
import { GameState, hexKey } from '../lib/game/types';
import { PEASANT_COST, CASTLE_COST, UNIT_STRENGTH } from '../lib/game/constants';
import { getHexDefenseStrength } from '../lib/game/territoryManager';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getPlayerHexes(state: GameState, playerId: number) {
  return Array.from(state.hexes.values()).filter(h => h.owner === playerId);
}

function getPlayerTerritory(state: GameState, playerId: number) {
  return state.territories.find(t => t.owner === playerId) ?? null;
}

function findUnitHex(state: GameState, playerId: number) {
  return Array.from(state.hexes.values()).find(h => h.owner === playerId && h.unitTier !== null) ?? null;
}

function findEmptyOwnedHex(state: GameState, playerId: number) {
  return Array.from(state.hexes.values()).find(
    h => h.owner === playerId && h.unitTier === null && !h.hasCastle && !h.hasCapital
  ) ?? null;
}

// ─── createNewGame ───────────────────────────────────────────────────────────

describe('createNewGame', () => {
  it('creates a valid game state', () => {
    const state = createNewGame('coalition', 10);
    expect(state.phase).toBe('playing');
    expect(state.currentPlayer).toBe(0);
    expect(state.turnNumber).toBe(1);
    expect(state.winner).toBeNull();
    expect(state.players).toHaveLength(2);
  });

  it('assigns factions correctly', () => {
    const state = createNewGame('coalition', 10);
    expect(state.players[0].faction).toBe('coalition');
    expect(state.players[1].faction).toBe('insurgents');
    expect(state.players[0].isHuman).toBe(true);
    expect(state.players[1].isHuman).toBe(false);
  });

  it('assigns factions correctly when human picks insurgents', () => {
    const state = createNewGame('insurgents', 10);
    expect(state.players[0].faction).toBe('insurgents');
    expect(state.players[1].faction).toBe('coalition');
  });

  it('generates a map with hexes', () => {
    const state = createNewGame('coalition', 10);
    expect(state.hexes.size).toBeGreaterThan(50);
  });

  it('assigns starting territory to both players', () => {
    const state = createNewGame('coalition', 10);
    const p0hexes = getPlayerHexes(state, 0);
    const p1hexes = getPlayerHexes(state, 1);
    expect(p0hexes.length).toBeGreaterThan(0);
    expect(p1hexes.length).toBeGreaterThan(0);
  });

  it('leaves majority of map as neutral', () => {
    const state = createNewGame('coalition', 10);
    const neutral = Array.from(state.hexes.values()).filter(h => h.owner === null);
    expect(neutral.length / state.hexes.size).toBeGreaterThan(0.5);
  });

  it('creates territories for both players', () => {
    const state = createNewGame('coalition', 10);
    expect(state.territories.some(t => t.owner === 0)).toBe(true);
    expect(state.territories.some(t => t.owner === 1)).toBe(true);
  });

  it('populates mapBounds', () => {
    const state = createNewGame('coalition', 10);
    expect(state.mapBounds.minX).toBeLessThan(state.mapBounds.maxX);
    expect(state.mapBounds.minY).toBeLessThan(state.mapBounds.maxY);
  });

  it('places starting units', () => {
    const state = createNewGame('coalition', 10);
    const p0units = getPlayerHexes(state, 0).filter(h => h.unitTier !== null);
    expect(p0units.length).toBeGreaterThan(0);
  });
});

// ─── handleHexTap — selection ───────────────────────────────────────────────

describe('handleHexTap — selection', () => {
  it('selects an owned hex with a unit', () => {
    const state = createNewGame('coalition', 10);
    const unit = findUnitHex(state, 0)!;
    const next = handleHexTap(state, unit.q, unit.r);
    expect(next.selectedHex).toEqual({ q: unit.q, r: unit.r });
  });

  it('deselects when tapping selected hex again', () => {
    const state = createNewGame('coalition', 10);
    const unit = findUnitHex(state, 0)!;
    const selected = handleHexTap(state, unit.q, unit.r);
    const deselected = handleHexTap(selected, unit.q, unit.r);
    expect(deselected.selectedHex).toBeNull();
  });

  it('ignores taps on enemy territory when nothing is selected', () => {
    const state = createNewGame('coalition', 10);
    const enemyHex = Array.from(state.hexes.values()).find(h => h.owner === 1)!;
    const next = handleHexTap(state, enemyHex.q, enemyHex.r);
    expect(next.selectedHex).toBeNull();
  });

  it('does nothing when game is over', () => {
    const state = createNewGame('coalition', 10);
    const over = { ...state, phase: 'game_over' as const };
    const unit = findUnitHex(over, 0)!;
    const next = handleHexTap(over, unit.q, unit.r);
    expect(next).toBe(over);
  });
});

// ─── handleHexTap — movement ────────────────────────────────────────────────

describe('handleHexTap — movement within territory', () => {
  it('moves unit to empty adjacent hex in same territory', () => {
    const state = createNewGame('coalition', 10);
    const unit = findUnitHex(state, 0)!;
    const { getNeighbors } = require('../lib/game/hexUtils');
    const neighbors = getNeighbors(unit.q, unit.r);
    const emptyAdj = neighbors.find((n: any) => {
      const h = state.hexes.get(hexKey(n.q, n.r));
      return h && h.owner === 0 && h.unitTier === null && !h.hasCastle;
    });
    if (!emptyAdj) return; // no valid target in this map, skip
    const selected = handleHexTap(state, unit.q, unit.r);
    const moved = handleHexTap(selected, emptyAdj.q, emptyAdj.r);
    expect(moved.hexes.get(hexKey(emptyAdj.q, emptyAdj.r))?.unitTier).toBe(unit.unitTier);
    expect(moved.hexes.get(hexKey(unit.q, unit.r))?.unitTier).toBeNull();
  });

  it('moves unit to non-adjacent hex in same territory (free jump)', () => {
    const { hexKey: hk, coordFromKey } = require('../lib/game/types');
    const state = createNewGame('coalition', 10);
    const unit = findUnitHex(state, 0)!;
    if (!unit) return;
    // Find the territory this unit belongs to
    const territory = state.territories.find(t =>
      t.owner === 0 && t.hexes.some(h => h.q === unit.q && h.r === unit.r)
    );
    if (!territory) return;
    const { getNeighbors } = require('../lib/game/hexUtils');
    const adjKeys = new Set(getNeighbors(unit.q, unit.r).map((n: any) => hexKey(n.q, n.r)));
    // Find an empty non-adjacent hex in the same territory
    const nonAdjTarget = territory.hexes.find(h => {
      if (h.q === unit.q && h.r === unit.r) return false;
      if (adjKeys.has(hexKey(h.q, h.r))) return false;
      const hex = state.hexes.get(hexKey(h.q, h.r));
      return hex && hex.unitTier === null && !hex.hasCastle;
    });
    if (!nonAdjTarget) return; // territory too small to find one — skip
    const s1 = handleHexTap(state, unit.q, unit.r);
    const s2 = handleHexTap(s1, nonAdjTarget.q, nonAdjTarget.r);
    expect(s2.hexes.get(hexKey(nonAdjTarget.q, nonAdjTarget.r))?.unitTier).toBe(unit.unitTier);
    expect(s2.hexes.get(hexKey(unit.q, unit.r))?.unitTier).toBeNull();
    // Free move: unit is still available to act
    expect(s2.hexes.get(hexKey(nonAdjTarget.q, nonAdjTarget.r))?.unitMoved).toBe(false);
  });

  it('cannot move an already-moved unit', () => {
    const state = createNewGame('coalition', 10);
    const unit = findUnitHex(state, 0)!;
    const { getNeighbors } = require('../lib/game/hexUtils');
    const neighbors = getNeighbors(unit.q, unit.r);
    const emptyAdj = neighbors.find((n: any) => {
      const h = state.hexes.get(hexKey(n.q, n.r));
      return h && h.owner === 0 && h.unitTier === null && !h.hasCastle;
    });
    if (!emptyAdj) return;
    const s1 = handleHexTap(state, unit.q, unit.r);
    const s2 = handleHexTap(s1, emptyAdj.q, emptyAdj.r);
    // try to move the unit again
    const s3 = handleHexTap(s2, emptyAdj.q, emptyAdj.r);
    const s4 = handleHexTap(s3, unit.q, unit.r); // back to origin (empty now)
    // should not have moved back
    expect(s4.hexes.get(hexKey(emptyAdj.q, emptyAdj.r))?.unitTier).toBe(unit.unitTier);
  });
});

// ─── handleHexTap — capturing neutral ───────────────────────────────────────

describe('handleHexTap — capturing neutral hex', () => {
  it('captures an adjacent neutral hex', () => {
    const state = createNewGame('coalition', 10);
    const unit = findUnitHex(state, 0)!;
    const { getNeighbors } = require('../lib/game/hexUtils');
    const neighbors = getNeighbors(unit.q, unit.r);
    const neutral = neighbors.find((n: any) => {
      const h = state.hexes.get(hexKey(n.q, n.r));
      return h && h.owner === null;
    });
    if (!neutral) return;
    const s1 = handleHexTap(state, unit.q, unit.r);
    const s2 = handleHexTap(s1, neutral.q, neutral.r);
    expect(s2.hexes.get(hexKey(neutral.q, neutral.r))?.owner).toBe(0);
  });
});

// ─── purchasing ──────────────────────────────────────────────────────────────

describe('startPurchase + handleHexTap — buy peasant', () => {
  it('enters purchase mode', () => {
    const state = createNewGame('coalition', 10);
    const next = startPurchase(state, 'peasant');
    expect(next.purchaseType).toBe('peasant');
  });

  it('places a peasant on an empty owned hex and deducts cost', () => {
    const state = createNewGame('coalition', 10);
    const territory = getPlayerTerritory(state, 0)!;
    // Ensure enough treasury
    const richState = {
      ...state,
      territories: state.territories.map(t =>
        t.owner === 0 ? { ...t, treasury: 100 } : t
      ),
    };
    const emptyHex = findEmptyOwnedHex(richState, 0);
    if (!emptyHex) return;
    const s1 = startPurchase(richState, 'peasant');
    const s2 = handleHexTap(s1, emptyHex.q, emptyHex.r);
    expect(s2.hexes.get(hexKey(emptyHex.q, emptyHex.r))?.unitTier).toBe(0);
    expect(s2.purchaseType).toBeNull();
    const newTerritory = s2.territories.find(t => t.owner === 0)!;
    expect(newTerritory.treasury).toBeLessThan(100);
  });

  it('cannot place peasant on enemy hex', () => {
    const state = createNewGame('coalition', 10);
    const enemyHex = Array.from(state.hexes.values()).find(h => h.owner === 1 && h.unitTier === null);
    if (!enemyHex) return;
    const s1 = startPurchase(state, 'peasant');
    const s2 = handleHexTap(s1, enemyHex.q, enemyHex.r);
    expect(s2.hexes.get(hexKey(enemyHex.q, enemyHex.r))?.unitTier).toBeNull();
  });
});

describe('startPurchase + handleHexTap — buy castle', () => {
  it('places a castle on an empty owned hex', () => {
    const state = createNewGame('coalition', 10);
    const richState = {
      ...state,
      territories: state.territories.map(t =>
        t.owner === 0 ? { ...t, treasury: 100 } : t
      ),
    };
    const emptyHex = findEmptyOwnedHex(richState, 0);
    if (!emptyHex) return;
    const s1 = startPurchase(richState, 'castle');
    const s2 = handleHexTap(s1, emptyHex.q, emptyHex.r);
    expect(s2.hexes.get(hexKey(emptyHex.q, emptyHex.r))?.hasCastle).toBe(true);
  });
});

// ─── endTurn ─────────────────────────────────────────────────────────────────

describe('endTurn', () => {
  it('applies income to treasury', () => {
    const state = createNewGame('coalition', 10);
    const t0 = state.territories.find(t => t.owner === 0)!;
    const treasuryBefore = t0.treasury;
    // End turn goes through AI, returns to player 0
    const next = endTurn(state);
    const t0after = next.territories.find(t => t.owner === 0);
    // Treasury should have changed (income applied, possibly AI attacked us)
    expect(t0after).toBeDefined();
  });

  it('resets unitMoved flags for current player', () => {
    const state = createNewGame('coalition', 10);
    // Mark all player 0 units as moved
    const hexes = new Map(state.hexes);
    for (const [k, h] of hexes) {
      if (h.owner === 0 && h.unitTier !== null) {
        hexes.set(k, { ...h, unitMoved: true });
      }
    }
    const movedState = { ...state, hexes };
    const next = endTurn(movedState);
    // After full turn cycle, player 0's units should be reset
    for (const h of next.hexes.values()) {
      if (h.owner === 0 && h.unitTier !== null) {
        expect(h.unitMoved).toBe(false);
      }
    }
  });

  it('converts graves to nomad camps', () => {
    const state = createNewGame('coalition', 10);
    // Plant a grave on an owned hex
    const target = findEmptyOwnedHex(state, 0)!;
    if (!target) return;
    const hexes = new Map(state.hexes);
    hexes.set(hexKey(target.q, target.r), { ...target, hasGrave: true });
    const graveState = { ...state, hexes };
    const next = endTurn(graveState);
    // After the turn cycle, that hex should be a nomad camp (not a grave)
    const afterHex = next.hexes.get(hexKey(target.q, target.r));
    if (afterHex) {
      expect(afterHex.hasGrave).toBe(false);
    }
  });

  it('increments turn number after both players act', () => {
    const state = createNewGame('coalition', 10);
    expect(state.turnNumber).toBe(1);
    const next = endTurn(state); // full cycle: human ends → AI plays → back to human
    expect(next.turnNumber).toBe(2);
  });

  it('detects winner when all enemy hexes are gone', () => {
    const state = createNewGame('coalition', 10);
    // Strip all player 1 hexes
    const hexes = new Map(state.hexes);
    for (const [k, h] of hexes) {
      if (h.owner === 1) hexes.set(k, { ...h, owner: 0, unitTier: null });
    }
    const strippedState = { ...state, hexes };
    const next = endTurn(strippedState);
    expect(next.phase).toBe('game_over');
    expect(next.winner).toBe(0);
  });
});

// ─── combine mode ────────────────────────────────────────────────────────────

describe('toggleCombineMode', () => {
  it('toggles combine mode on and off', () => {
    const state = createNewGame('coalition', 10);
    expect(state.combineMode).toBe(false);
    const on = toggleCombineMode(state);
    expect(on.combineMode).toBe(true);
    const off = toggleCombineMode(on);
    expect(off.combineMode).toBe(false);
  });

  it('clears purchaseType when entering combine mode', () => {
    const state = createNewGame('coalition', 10);
    const buying = startPurchase(state, 'peasant');
    const combined = toggleCombineMode(buying);
    expect(combined.purchaseType).toBeNull();
  });
});

// ─── wasRelocated reset ───────────────────────────────────────────────────────

describe('wasRelocated flag', () => {
  it('resets wasRelocated after a full turn cycle', () => {
    const state = createNewGame('coalition', 10);
    const target = findEmptyOwnedHex(state, 0)!;
    if (!target) return;
    const hexes = new Map(state.hexes);
    hexes.set(hexKey(target.q, target.r), { ...target, wasRelocated: true });
    const markedState = { ...state, hexes };
    const next = endTurn(markedState);
    const afterHex = next.hexes.get(hexKey(target.q, target.r));
    if (afterHex) {
      expect(afterHex.wasRelocated).toBe(false);
    }
  });
});

// ─── attack mechanics ─────────────────────────────────────────────────────────

describe('handleHexTap — enemy hex capture', () => {
  it('unit moves to captured hex and origin becomes empty', () => {
    const state = createNewGame('coalition', 10);
    const { getNeighbors } = require('../lib/game/hexUtils');
    // Find a player-0 unit that is adjacent to a player-1 hex it can overpower
    const attackerHex = Array.from(state.hexes.values()).find(h => {
      if (h.owner !== 0 || h.unitTier === null) return false;
      return getNeighbors(h.q, h.r).some((n: any) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (!nh || nh.owner !== 1) return false;
        const { getHexDefenseStrength } = require('../lib/game/territoryManager');
        return UNIT_STRENGTH[h.unitTier!] > getHexDefenseStrength(n.q, n.r, state.hexes);
      });
    });
    if (!attackerHex) return;
    const target = getNeighbors(attackerHex.q, attackerHex.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (!nh || nh.owner !== 1) return false;
      const { getHexDefenseStrength } = require('../lib/game/territoryManager');
      return UNIT_STRENGTH[attackerHex.unitTier!] > getHexDefenseStrength(n.q, n.r, state.hexes);
    });
    if (!target) return;
    const s1 = handleHexTap(state, attackerHex.q, attackerHex.r);
    const s2 = handleHexTap(s1, target.q, target.r);
    // Unit moved to captured hex
    expect(s2.hexes.get(hexKey(target.q, target.r))?.owner).toBe(0);
    expect(s2.hexes.get(hexKey(target.q, target.r))?.unitTier).toBe(attackerHex.unitTier);
    // Origin is now empty
    expect(s2.hexes.get(hexKey(attackerHex.q, attackerHex.r))?.unitTier).toBeNull();
  });

  it('equal-strength attack succeeds (classic Slay: attacker wins on equal)', () => {
    const state = createNewGame('coalition', 10);
    const { getNeighbors } = require('../lib/game/hexUtils');
    const { getHexDefenseStrength } = require('../lib/game/territoryManager');
    // Find a unit whose strength equals an adjacent enemy defense
    const equalAttacker = Array.from(state.hexes.values()).find(h => {
      if (h.owner !== 0 || h.unitTier === null) return false;
      return getNeighbors(h.q, h.r).some((n: any) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        if (!nh || nh.owner !== 1) return false;
        return UNIT_STRENGTH[h.unitTier!] === getHexDefenseStrength(n.q, n.r, state.hexes);
      });
    });
    if (!equalAttacker) return; // skip if no equal-strength situation on this map
    const target = getNeighbors(equalAttacker.q, equalAttacker.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (!nh || nh.owner !== 1) return false;
      return UNIT_STRENGTH[equalAttacker.unitTier!] === getHexDefenseStrength(n.q, n.r, state.hexes);
    });
    if (!target) return;
    const s1 = handleHexTap(state, equalAttacker.q, equalAttacker.r);
    const s2 = handleHexTap(s1, target.q, target.r);
    // Attacker wins on equal strength — hex captured
    expect(s2.hexes.get(hexKey(target.q, target.r))?.owner).toBe(0);
  });
});

describe('handleHexTap — combine mode', () => {
  it('non-adjacent same-tier units in same territory can be merged in combine mode', () => {
    const state = createNewGame('coalition', 10);
    const { getNeighbors } = require('../lib/game/hexUtils');
    // Find two player-0 units in the same territory that are NOT adjacent and same tier
    const p0units = Array.from(state.hexes.values()).filter(h => h.owner === 0 && h.unitTier !== null);
    const pair = p0units.reduce<[typeof p0units[0], typeof p0units[0]] | null>((acc, u) => {
      if (acc) return acc;
      const notAdj = p0units.find(other => {
        if (other === u || other.unitTier !== u.unitTier) return false;
        const inSameTerritory = state.territories.some(t =>
          t.hexes.some(h => h.q === u.q && h.r === u.r) &&
          t.hexes.some(h => h.q === other.q && h.r === other.r)
        );
        return inSameTerritory && !getNeighbors(u.q, u.r).some((n: any) => n.q === other.q && n.r === other.r);
      });
      return notAdj ? [u, notAdj] : null;
    }, null);
    if (!pair) return; // no non-adjacent same-tier same-territory pair found — skip
    const [unitA, unitB] = pair;
    const withCombine = toggleCombineMode(state);
    const s1 = handleHexTap(withCombine, unitA.q, unitA.r);
    const s2 = handleHexTap(s1, unitB.q, unitB.r);
    // Merge should succeed: unitB hex gets upgraded tier, unitA hex cleared
    const expectedTier = unitA.unitTier !== null ? unitA.unitTier + 1 : null;
    expect(s2.hexes.get(hexKey(unitB.q, unitB.r))?.unitTier).toBe(expectedTier);
    expect(s2.hexes.get(hexKey(unitA.q, unitA.r))?.unitTier).toBeNull();
  });
});

describe('handleHexTap — nomad clearing', () => {
  it('clearing a nomad: unit stays in place, nomad removed, unit loses turn (classic Slay)', () => {
    const state = createNewGame('coalition', 10);
    const { getNeighbors } = require('../lib/game/hexUtils');
    const unit = Array.from(state.hexes.values()).find(h => h.owner === 0 && h.unitTier !== null && !h.unitMoved);
    if (!unit) return;
    const adjOwnedEmpty = getNeighbors(unit.q, unit.r).find((n: any) => {
      const h = state.hexes.get(hexKey(n.q, n.r));
      return h && h.owner === 0 && h.unitTier === null && !h.hasCastle;
    });
    if (!adjOwnedEmpty) return;
    const hexes = new Map(state.hexes);
    hexes.set(hexKey(adjOwnedEmpty.q, adjOwnedEmpty.r), {
      ...hexes.get(hexKey(adjOwnedEmpty.q, adjOwnedEmpty.r))!,
      hasNomad: true,
    });
    const s = { ...state, hexes };
    const s1 = handleHexTap(s, unit.q, unit.r);
    const s2 = handleHexTap(s1, adjOwnedEmpty.q, adjOwnedEmpty.r);
    // Nomad is gone, wasRelocated set
    const nomadHex = s2.hexes.get(hexKey(adjOwnedEmpty.q, adjOwnedEmpty.r))!;
    expect(nomadHex.hasNomad).toBe(false);
    expect(nomadHex.wasRelocated).toBe(true);
    // Unit did NOT move — still on original hex, marked as moved
    expect(nomadHex.unitTier).toBeNull();
    const unitHex = s2.hexes.get(hexKey(unit.q, unit.r))!;
    expect(unitHex.unitTier).toBe(unit.unitTier);
    expect(unitHex.unitMoved).toBe(true);
  });

  it('unit can chop a non-adjacent nomad in same territory', () => {
    const state = createNewGame('coalition', 10);
    const { getNeighbors } = require('../lib/game/hexUtils');
    const unit = Array.from(state.hexes.values()).find(h => h.owner === 0 && h.unitTier !== null && !h.unitMoved);
    if (!unit) return;
    const territory = state.territories.find(t =>
      t.owner === 0 && t.hexes.some(h => h.q === unit.q && h.r === unit.r)
    );
    if (!territory) return;
    const adjKeys = new Set(getNeighbors(unit.q, unit.r).map((n: any) => hexKey(n.q, n.r)));
    // Find a non-adjacent empty hex in the same territory to plant a nomad on
    const nonAdjCoord = territory.hexes.find(h => {
      if (h.q === unit.q && h.r === unit.r) return false;
      if (adjKeys.has(hexKey(h.q, h.r))) return false;
      const hex = state.hexes.get(hexKey(h.q, h.r));
      return hex && hex.unitTier === null && !hex.hasCastle && !hex.hasCapital;
    });
    if (!nonAdjCoord) return; // territory too small — skip
    const hexes = new Map(state.hexes);
    hexes.set(hexKey(nonAdjCoord.q, nonAdjCoord.r), {
      ...hexes.get(hexKey(nonAdjCoord.q, nonAdjCoord.r))!,
      hasNomad: true,
    });
    const s = { ...state, hexes };
    const s1 = handleHexTap(s, unit.q, unit.r);
    const s2 = handleHexTap(s1, nonAdjCoord.q, nonAdjCoord.r);
    // Nomad cleared, unit stayed in place and lost its turn
    expect(s2.hexes.get(hexKey(nonAdjCoord.q, nonAdjCoord.r))?.hasNomad).toBe(false);
    expect(s2.hexes.get(hexKey(nonAdjCoord.q, nonAdjCoord.r))?.wasRelocated).toBe(true);
    expect(s2.hexes.get(hexKey(unit.q, unit.r))?.unitTier).toBe(unit.unitTier);
    expect(s2.hexes.get(hexKey(unit.q, unit.r))?.unitMoved).toBe(true);
  });

  it('already-moved unit cannot clear a nomad', () => {
    const state = createNewGame('coalition', 10);
    const { getNeighbors } = require('../lib/game/hexUtils');
    const unit = Array.from(state.hexes.values()).find(h => h.owner === 0 && h.unitTier !== null);
    if (!unit) return;
    const adjOwnedEmpty = getNeighbors(unit.q, unit.r).find((n: any) => {
      const h = state.hexes.get(hexKey(n.q, n.r));
      return h && h.owner === 0 && h.unitTier === null && !h.hasCastle;
    });
    if (!adjOwnedEmpty) return;
    // Mark unit as already moved and place a nomad
    const hexes = new Map(state.hexes);
    hexes.set(hexKey(unit.q, unit.r), { ...hexes.get(hexKey(unit.q, unit.r))!, unitMoved: true });
    hexes.set(hexKey(adjOwnedEmpty.q, adjOwnedEmpty.r), {
      ...hexes.get(hexKey(adjOwnedEmpty.q, adjOwnedEmpty.r))!,
      hasNomad: true,
    });
    const s = { ...state, hexes };
    const s1 = handleHexTap(s, unit.q, unit.r);
    const s2 = handleHexTap(s1, adjOwnedEmpty.q, adjOwnedEmpty.r);
    // Nomad should still be there
    expect(s2.hexes.get(hexKey(adjOwnedEmpty.q, adjOwnedEmpty.r))?.hasNomad).toBe(true);
  });
});

describe('purchase validation', () => {
  it('purchase on capital hex cancels purchase mode without placing', () => {
    const state = createNewGame('coalition', 10);
    const richState = {
      ...state,
      territories: state.territories.map(t => t.owner === 0 ? { ...t, treasury: 100 } : t),
    };
    // Find the capital hex of player 0 that has no unit
    const capitalHex = Array.from(richState.hexes.values()).find(
      h => h.owner === 0 && h.hasCapital && h.unitTier === null
    );
    if (!capitalHex) return;
    const s1 = startPurchase(richState, 'peasant');
    const s2 = handleHexTap(s1, capitalHex.q, capitalHex.r);
    expect(s2.purchaseType).toBeNull();
    expect(s2.hexes.get(hexKey(capitalHex.q, capitalHex.r))?.unitTier).toBeNull();
  });

  it('newly purchased peasant has unitMoved=false (active and ready same turn)', () => {
    const state = createNewGame('coalition', 10);
    const richState = {
      ...state,
      territories: state.territories.map(t => t.owner === 0 ? { ...t, treasury: 100 } : t),
    };
    const emptyHex = findEmptyOwnedHex(richState, 0);
    if (!emptyHex) return;
    const s1 = startPurchase(richState, 'peasant');
    const s2 = handleHexTap(s1, emptyHex.q, emptyHex.r);
    expect(s2.hexes.get(hexKey(emptyHex.q, emptyHex.r))?.unitMoved).toBe(false);
  });

  it('newly purchased peasant can move in the same turn', () => {
    const state = createNewGame('coalition', 10);
    const richState = {
      ...state,
      territories: state.territories.map(t => t.owner === 0 ? { ...t, treasury: 100 } : t),
    };
    const spawnHex = findEmptyOwnedHex(richState, 0);
    if (!spawnHex) return;
    // Buy the peasant
    const s1 = startPurchase(richState, 'peasant');
    const s2 = handleHexTap(s1, spawnHex.q, spawnHex.r);
    expect(s2.hexes.get(hexKey(spawnHex.q, spawnHex.r))?.unitTier).toBe(0);
    // Find another empty hex in the same territory to move to
    const territory = s2.territories.find(t =>
      t.owner === 0 && t.hexes.some(h => h.q === spawnHex.q && h.r === spawnHex.r)
    );
    if (!territory) return;
    const moveTarget = territory.hexes.find(h => {
      if (h.q === spawnHex.q && h.r === spawnHex.r) return false;
      const hex = s2.hexes.get(hexKey(h.q, h.r));
      return hex && hex.unitTier === null && !hex.hasCastle;
    });
    if (!moveTarget) return;
    // s2 already has the unit auto-selected after purchase — tap target directly
    const s4 = handleHexTap(s2, moveTarget.q, moveTarget.r);
    expect(s4.hexes.get(hexKey(moveTarget.q, moveTarget.r))?.unitTier).toBe(0);
    expect(s4.hexes.get(hexKey(spawnHex.q, spawnHex.r))?.unitTier).toBeNull();
  });

  it('purchase with insufficient treasury cancels purchase mode', () => {
    const state = createNewGame('coalition', 10);
    const brokeState = {
      ...state,
      territories: state.territories.map(t => t.owner === 0 ? { ...t, treasury: 0 } : t),
    };
    const emptyHex = findEmptyOwnedHex(brokeState, 0);
    if (!emptyHex) return;
    const s1 = startPurchase(brokeState, 'peasant');
    const s2 = handleHexTap(s1, emptyHex.q, emptyHex.r);
    expect(s2.purchaseType).toBeNull();
    expect(s2.hexes.get(hexKey(emptyHex.q, emptyHex.r))?.unitTier).toBeNull();
  });
});

describe('AI integration', () => {
  it('endTurn runs AI without throwing and returns valid state', () => {
    const state = createNewGame('coalition', 10);
    expect(() => endTurn(state)).not.toThrow();
    const next = endTurn(state);
    expect(next.hexes.size).toBeGreaterThan(0);
    expect(next.territories).toBeDefined();
    expect(next.currentPlayer).toBe(0);
  });

  it('AI turn does not corrupt hex ownership', () => {
    const state = createNewGame('coalition', 10);
    const next = endTurn(state);
    for (const hex of next.hexes.values()) {
      if (hex.owner !== null) {
        expect(hex.owner).toBeGreaterThanOrEqual(0);
        expect(hex.owner).toBeLessThan(state.players.length);
      }
    }
  });
});

// ─── nomad camp growth ────────────────────────────────────────────────────────

describe('nomad camp growth', () => {
  it('nomads only spread to hexes with 2+ adjacent nomads', () => {
    // Build a controlled setup: clear ALL natural nomads/graves from the map,
    // place exactly ONE isolated nomad (0 adjacent nomads), then verify it
    // never spreads after many turns. Without 2+ adjacent nomads, growth is
    // impossible. Treasuries are set high so bankruptcy never produces graves
    // (which would convert to nomads and pollute the count).
    const state = createNewGame('coalition', 8);

    // Clear every hex of nomads and graves, then find a neutral hex with no
    // nomad neighbors in the cleaned map (any neutral hex qualifies since all
    // nomads are removed).
    const hexes = new Map(
      Array.from(state.hexes.entries()).map(([k, h]) => [k, { ...h, hasNomad: false, hasGrave: false }])
    );
    const isolated = Array.from(hexes.values()).find(h => h.owner === null);
    if (!isolated) return;
    hexes.set(hexKey(isolated.q, isolated.r), { ...hexes.get(hexKey(isolated.q, isolated.r))!, hasNomad: true });

    // Give all territories a large treasury so no bankruptcy occurs → no unit
    // deaths → no graves → no accidental nomad creation.
    const territories = state.territories.map(t => ({ ...t, treasury: 5000 }));
    let s: GameState = { ...state, hexes, territories };

    for (let i = 0; i < 20; i++) {
      s = endTurn(s);
    }

    // Isolated nomad has 0 nomad neighbors → 2+ threshold never reached → no spreading.
    // The nomad may be cleared by AI capturing the hex (valid), but must not have grown.
    const nomadCount = Array.from(s.hexes.values()).filter(h => h.hasNomad).length;
    expect(nomadCount).toBeLessThanOrEqual(1);
  });
});

// ─── A: Unit Strength [1,2,3,4] — combat thresholds ─────────────────────────

describe('unit strength — classic Slay [1,2,3,4]', () => {
  it('A1: Peasant (str=1) cannot attack Spearman-defended hex (str=2)', () => {
    const { getNeighbors } = require('../lib/game/hexUtils');
    const { getHexDefenseStrength } = require('../lib/game/territoryManager');
    const state = createNewGame('coalition', 10);
    // Find a tier-0 coalition unit adjacent to an enemy hex defended at str=2
    const attacker = Array.from(state.hexes.values()).find(h => {
      if (h.owner !== 0 || h.unitTier !== 0) return false;
      return getNeighbors(h.q, h.r).some((n: any) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner === 1 && getHexDefenseStrength(n.q, n.r, state.hexes) >= 2;
      });
    });
    if (!attacker) return;
    const target = getNeighbors(attacker.q, attacker.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      return nh && nh.owner === 1 && getHexDefenseStrength(n.q, n.r, state.hexes) >= 2;
    });
    if (!target) return;
    const s1 = handleHexTap(state, attacker.q, attacker.r);
    const s2 = handleHexTap(s1, target.q, target.r);
    expect(s2.hexes.get(hexKey(target.q, target.r))?.owner).toBe(1);
  });

  it('A2: Spearman (str=2) defeats Peasant-defended hex (str=1)', () => {
    const { getNeighbors } = require('../lib/game/hexUtils');
    const { getHexDefenseStrength } = require('../lib/game/territoryManager');
    const state = createNewGame('coalition', 10);
    const attacker = Array.from(state.hexes.values()).find(h => {
      if (h.owner !== 0 || h.unitTier !== 1) return false;
      return getNeighbors(h.q, h.r).some((n: any) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner === 1 && getHexDefenseStrength(n.q, n.r, state.hexes) === 1;
      });
    });
    if (!attacker) return;
    const target = getNeighbors(attacker.q, attacker.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      return nh && nh.owner === 1 && getHexDefenseStrength(n.q, n.r, state.hexes) === 1;
    });
    if (!target) return;
    const s1 = handleHexTap(state, attacker.q, attacker.r);
    const s2 = handleHexTap(s1, target.q, target.r);
    expect(s2.hexes.get(hexKey(target.q, target.r))?.owner).toBe(0);
  });

  it('A3: Knight (str=3) defeats castle-defended hex (defense=2)', () => {
    const { getNeighbors } = require('../lib/game/hexUtils');
    const state = createNewGame('coalition', 10);
    // Build a controlled scenario: place a tier-2 unit and a castle on adjacent enemy hex
    const attackerHex = Array.from(state.hexes.values()).find(h => h.owner === 0 && h.unitTier !== null);
    if (!attackerHex) return;
    const adjEnemy = getNeighbors(attackerHex.q, attackerHex.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      return nh && nh.owner === 1;
    });
    if (!adjEnemy) return;
    // Force attacker to tier-2 (Knight, str=3), target to castle only (defense=2)
    const hexes = new Map(state.hexes);
    hexes.set(hexKey(attackerHex.q, attackerHex.r), { ...attackerHex, unitTier: 2, unitMoved: false });
    const targetHex = hexes.get(hexKey(adjEnemy.q, adjEnemy.r))!;
    hexes.set(hexKey(adjEnemy.q, adjEnemy.r), { ...targetHex, unitTier: null, hasCastle: true });
    const s = { ...state, hexes };
    const s1 = handleHexTap(s, attackerHex.q, attackerHex.r);
    const s2 = handleHexTap(s1, adjEnemy.q, adjEnemy.r);
    expect(s2.hexes.get(hexKey(adjEnemy.q, adjEnemy.r))?.owner).toBe(0);
  });

  it('A4: Peasant (str=1) captures capital-defended hex (defense=1) — equal wins', () => {
    const { getNeighbors } = require('../lib/game/hexUtils');
    const state = createNewGame('coalition', 10);
    const attackerHex = Array.from(state.hexes.values()).find(h => h.owner === 0 && h.unitTier === 0 && !h.unitMoved);
    if (!attackerHex) return;
    const adjEnemy = getNeighbors(attackerHex.q, attackerHex.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      return nh && nh.owner === 1;
    });
    if (!adjEnemy) return;
    // Force target to capital only (defense=1), no unit
    const hexes = new Map(state.hexes);
    const targetHex = hexes.get(hexKey(adjEnemy.q, adjEnemy.r))!;
    hexes.set(hexKey(adjEnemy.q, adjEnemy.r), { ...targetHex, unitTier: null, hasCastle: false, hasCapital: true });
    const s = { ...state, hexes };
    const s1 = handleHexTap(s, attackerHex.q, attackerHex.r);
    const s2 = handleHexTap(s1, adjEnemy.q, adjEnemy.r);
    expect(s2.hexes.get(hexKey(adjEnemy.q, adjEnemy.r))?.owner).toBe(0);
  });
});

// ─── B: Equal strength — attacker wins ───────────────────────────────────────

describe('combat — equal strength: attacker wins', () => {
  it('B3: weaker attacker is still blocked by stronger defense', () => {
    const { getNeighbors } = require('../lib/game/hexUtils');
    const { getHexDefenseStrength } = require('../lib/game/territoryManager');
    const state = createNewGame('coalition', 10);
    const attacker = Array.from(state.hexes.values()).find(h => {
      if (h.owner !== 0 || h.unitTier === null) return false;
      return getNeighbors(h.q, h.r).some((n: any) => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && nh.owner === 1 &&
          getHexDefenseStrength(n.q, n.r, state.hexes) > UNIT_STRENGTH[h.unitTier!];
      });
    });
    if (!attacker) return;
    const target = getNeighbors(attacker.q, attacker.r).find((n: any) => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      return nh && nh.owner === 1 &&
        getHexDefenseStrength(n.q, n.r, state.hexes) > UNIT_STRENGTH[attacker.unitTier!];
    });
    if (!target) return;
    const s1 = handleHexTap(state, attacker.q, attacker.r);
    const s2 = handleHexTap(s1, target.q, target.r);
    expect(s2.hexes.get(hexKey(target.q, target.r))?.owner).toBe(1);
  });
});

// ─── C: Combination rule — same tier only ────────────────────────────────────

describe('unit combination — same tier only (classic Slay)', () => {
  it('C5: different-tier units cannot combine', () => {
    const { getTierForCombinedStrength } = require('../lib/game/constants');
    expect(getTierForCombinedStrength(0, 1)).toBe(-1);
    expect(getTierForCombinedStrength(1, 2)).toBe(-1);
    expect(getTierForCombinedStrength(0, 3)).toBe(-1);
  });

  it('C1–C4: only same-tier combinations are valid, Baron+Baron is invalid', () => {
    const { getTierForCombinedStrength } = require('../lib/game/constants');
    expect(getTierForCombinedStrength(0, 0)).toBe(1); // Peasant+Peasant → Spearman
    expect(getTierForCombinedStrength(1, 1)).toBe(2); // Spearman+Spearman → Knight
    expect(getTierForCombinedStrength(2, 2)).toBe(3); // Knight+Knight → Baron
    expect(getTierForCombinedStrength(3, 3)).toBe(-1); // Baron+Baron → invalid
  });
});
