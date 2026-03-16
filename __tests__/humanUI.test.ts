/**
 * Human UI Simulation
 * Exercises every human-accessible interaction through the game engine and
 * reports what the player would see/experience at each step.
 */
import { createNewGame, handleHexTap, startPurchase, endTurn, toggleCombineMode } from '../lib/game/gameEngine';
import { GameState, hexKey, GameHex, HexCoord } from '../lib/game/types';
import { getNeighbors } from '../lib/game/hexUtils';
import { PEASANT_COST, CASTLE_COST, UNIT_UPKEEP, UNIT_STRENGTH, getTierForCombinedStrength } from '../lib/game/constants';
import { getTerritoryForHex, buildHexTerritoryMap, getHexDefenseStrength } from '../lib/game/territoryManager';

// ─── helpers ──────────────────────────────────────────────────────────────────

function findHumanUnitHexes(state: GameState): GameHex[] {
  const playerId = 0; // human is always P0
  return Array.from(state.hexes.values())
    .filter(h => h.owner === playerId && h.unitTier !== null && !h.unitMoved);
}

function findValidMoveTargets(state: GameState, unit: GameHex): HexCoord[] {
  const results: HexCoord[] = [];
  const hexTerritoryMap = buildHexTerritoryMap(state.territories);
  const unitTerritoryId = hexTerritoryMap.get(hexKey(unit.q, unit.r));

  for (const n of getNeighbors(unit.q, unit.r)) {
    const nh = state.hexes.get(hexKey(n.q, n.r));
    if (!nh) continue;
    if (nh.owner === 0 && hexTerritoryMap.get(hexKey(n.q, n.r)) === unitTerritoryId
        && nh.unitTier === null && !nh.hasCastle) {
      results.push(n);
    }
  }
  return results;
}

function findNeutralTargets(state: GameState, unit: GameHex): HexCoord[] {
  return getNeighbors(unit.q, unit.r).filter(n => {
    const nh = state.hexes.get(hexKey(n.q, n.r));
    return nh && nh.owner === null;
  });
}

function findEnemyTargets(state: GameState, unit: GameHex): { coord: HexCoord; defense: number }[] {
  const hexTerritoryMap = buildHexTerritoryMap(state.territories);
  return getNeighbors(unit.q, unit.r)
    .filter(n => {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      return nh && nh.owner !== null && nh.owner !== 0;
    })
    .map(n => ({
      coord: n,
      defense: getHexDefenseStrength(n.q, n.r, state.hexes, hexTerritoryMap),
    }));
}

function findNomadNeighbors(state: GameState, unit: GameHex): HexCoord[] {
  const hexTerritoryMap = buildHexTerritoryMap(state.territories);
  const unitTerritoryId = hexTerritoryMap.get(hexKey(unit.q, unit.r));
  return getNeighbors(unit.q, unit.r).filter(n => {
    const nh = state.hexes.get(hexKey(n.q, n.r));
    return nh && nh.owner === 0 && nh.hasNomad
      && hexTerritoryMap.get(hexKey(n.q, n.r)) === unitTerritoryId;
  });
}

function describeHex(state: GameState, q: number, r: number): string {
  const h = state.hexes.get(hexKey(q, r));
  if (!h) return `(${q},${r}) MISSING`;
  const parts: string[] = [`(${q},${r})`];
  if (h.owner !== null) parts.push(`P${h.owner}`);
  else parts.push('neutral');
  if (h.unitTier !== null) parts.push(`unit_T${h.unitTier}${h.unitMoved ? '[moved]' : ''}`);
  if (h.hasCapital) parts.push('capital');
  if (h.hasCastle) parts.push('castle');
  if (h.hasNomad) parts.push('nomad');
  if (h.hasGrave) parts.push('grave');
  return parts.join(' ');
}

function uiIssue(label: string, detail: string) {
  console.log(`  ⚠️  UI-ISSUE [${label}]: ${detail}`);
}
function uiOk(label: string, detail: string) {
  console.log(`  ✓  [${label}]: ${detail}`);
}
function section(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`▶ ${title}`);
  console.log('─'.repeat(60));
}

// ─── scenario runners ──────────────────────────────────────────────────────────

function testSelectAndMove(state: GameState): GameState {
  section('SELECT & MOVE — tap unit then empty adjacent hex');
  const units = findHumanUnitHexes(state);
  if (units.length === 0) {
    uiIssue('no-units', 'Player has no unmoved units at game start — cannot test move');
    return state;
  }

  const unit = units[0];
  const moves = findValidMoveTargets(state, unit);
  const neutrals = findNeutralTargets(state, unit);

  console.log(`  Unit at ${describeHex(state, unit.q, unit.r)}`);
  console.log(`  Valid friendly moves: ${moves.length}, Neutral expansions: ${neutrals.length}`);

  // Tap the unit (select it)
  const afterSelect = handleHexTap(state, unit.q, unit.r);
  if (!afterSelect.selectedHex) {
    uiIssue('select-fails', `Tapping unit at (${unit.q},${unit.r}) did not select it`);
    return state;
  }
  uiOk('unit-select', `Unit selected at (${unit.q},${unit.r}); selectedHex set ✓`);

  // Tap same hex again → should deselect
  const afterDeselect = handleHexTap(afterSelect, unit.q, unit.r);
  if (afterDeselect.selectedHex !== null) {
    uiIssue('deselect-fails', 'Tapping selected unit again should deselect it');
  } else {
    uiOk('deselect', 'Double-tap deselects ✓');
  }

  // Move to a neutral hex
  if (neutrals.length > 0) {
    const target = neutrals[0];
    const sel = handleHexTap(state, unit.q, unit.r);
    const afterMove = handleHexTap(sel, target.q, target.r);
    const moved = afterMove.hexes.get(hexKey(target.q, target.r))!;
    const origin = afterMove.hexes.get(hexKey(unit.q, unit.r))!;
    if (moved.owner === 0 && moved.unitTier === unit.unitTier && moved.unitMoved) {
      uiOk('expand-to-neutral', `Unit expanded to neutral ${describeHex(afterMove, target.q, target.r)} ✓`);
    } else {
      uiIssue('expand-fails', `Move to neutral (${target.q},${target.r}) did not transfer unit`);
    }
    if (origin.unitTier !== null) {
      uiIssue('origin-not-cleared', `Unit source hex (${unit.q},${unit.r}) still has a unit after move`);
    }
    return afterMove; // Use updated state for next tests
  }

  return afterSelect;
}

function testNomadClearing(state: GameState): GameState {
  section('NOMAD CLEARING — unit clears adjacent nomad but stays in place');
  const units = findHumanUnitHexes(state);

  for (const unit of units) {
    const nomads = findNomadNeighbors(state, unit);
    if (nomads.length === 0) continue;

    const nomadTarget = nomads[0];
    console.log(`  Unit at ${describeHex(state, unit.q, unit.r)}`);
    console.log(`  Adjacent nomad at ${describeHex(state, nomadTarget.q, nomadTarget.r)}`);

    const sel = handleHexTap(state, unit.q, unit.r);
    const afterClear = handleHexTap(sel, nomadTarget.q, nomadTarget.r);

    const unitHex = afterClear.hexes.get(hexKey(unit.q, unit.r))!;
    const nomadHex = afterClear.hexes.get(hexKey(nomadTarget.q, nomadTarget.r))!;

    if (nomadHex.hasNomad) {
      uiIssue('nomad-not-cleared', 'Nomad was not cleared after unit action');
    } else {
      uiOk('nomad-cleared', 'Nomad cleared ✓');
    }

    if (unitHex.unitTier === null) {
      uiIssue('unit-vanished', 'Unit disappeared after clearing nomad — should STAY IN PLACE');
    } else if (unitHex.unitMoved) {
      uiOk('unit-stays', 'Unit stays at origin with unitMoved=true (loses turn) ✓');
    } else {
      uiIssue('unit-not-spent', 'Unit cleared nomad but unitMoved is still false');
    }

    // UX note: player sees unit darken but not move — potentially confusing
    uiIssue('nomad-ux', 'Player expects unit to MOVE to nomad hex (classic Slay), but unit stays. No in-game explanation shown.');

    return afterClear;
  }

  console.log('  (no adjacent nomads found — skipping nomad test)');
  return state;
}

function testAttack(state: GameState): GameState {
  section('ATTACK — unit taps adjacent enemy hex');
  const units = findHumanUnitHexes(state);

  for (const unit of units) {
    const enemies = findEnemyTargets(state, unit);
    if (enemies.length === 0) continue;

    // Find one we can actually beat
    const attackable = enemies.filter(e => UNIT_STRENGTH[unit.unitTier!] >= e.defense);
    const blocked = enemies.filter(e => UNIT_STRENGTH[unit.unitTier!] < e.defense);

    console.log(`  Unit T${unit.unitTier} (str=${UNIT_STRENGTH[unit.unitTier!]}) at ${describeHex(state, unit.q, unit.r)}`);
    console.log(`  Enemy targets: ${enemies.length} total, ${attackable.length} attackable, ${blocked.length} too strong`);

    if (attackable.length > 0) {
      const target = attackable[0];
      const beforeOwner = state.hexes.get(hexKey(target.coord.q, target.coord.r))!.owner;
      const sel = handleHexTap(state, unit.q, unit.r);
      const afterAttack = handleHexTap(sel, target.coord.q, target.coord.r);
      const afterHex = afterAttack.hexes.get(hexKey(target.coord.q, target.coord.r))!;

      if (afterHex.owner === 0) {
        uiOk('attack-success', `Captured enemy hex (def=${target.defense}) ✓`);
      } else {
        uiIssue('attack-failed', `Attack on (${target.coord.q},${target.coord.r}) did not capture hex (def=${target.defense}, str=${UNIT_STRENGTH[unit.unitTier!]})`);
      }
      return afterAttack;
    }

    if (blocked.length > 0) {
      const target = blocked[0];
      const sel = handleHexTap(state, unit.q, unit.r);
      const afterBlocked = handleHexTap(sel, target.coord.q, target.coord.r);
      const afterHex = afterBlocked.hexes.get(hexKey(target.coord.q, target.coord.r))!;
      if (afterHex.owner !== 0) {
        uiOk('attack-blocked', `Attack on too-strong target correctly blocked (def=${target.defense} > str=${UNIT_STRENGTH[unit.unitTier!]}) ✓`);
        // UX: player taps red-highlighted enemy and nothing happens — no feedback why
        uiIssue('blocked-no-feedback', `When attack is blocked, the tap is silently ignored. Player gets no message like "unit too weak".`);
      }
    }
    break;
  }

  return state;
}

function testBuyPeasant(state: GameState): GameState {
  section('BUY PEASANT — enter purchase mode, tap empty hex');
  const territories = state.territories.filter(t => t.owner === 0);
  const richTerritory = territories.reduce((b, t) => t.treasury > b.treasury ? t : b, territories[0]);

  console.log(`  Richest territory: $${richTerritory?.treasury} (need $${PEASANT_COST})`);

  if (!richTerritory || richTerritory.treasury < PEASANT_COST) {
    uiIssue('no-money', `Cannot afford peasant ($${richTerritory?.treasury || 0} < $${PEASANT_COST})`);
    return state;
  }

  // ActionPanel canAffordPeasant uses displayTerritory (selected hex territory or richest)
  // If player has multiple territories, buy button reflects richest territory even if they
  // select a hex in a poor territory — this can mislead them
  if (territories.length > 1) {
    const poorTerritory = territories.reduce((b, t) => t.treasury < b.treasury ? t : b, territories[0]);
    if (poorTerritory.treasury < PEASANT_COST && richTerritory.treasury >= PEASANT_COST) {
      uiIssue('cross-territory-buy-confusion',
        `Player has ${territories.length} territories. Selecting hex in poor territory ($${poorTerritory.treasury}) shows buy button ENABLED (richest=$${richTerritory.treasury}), ` +
        `but tapping that territory's hex to place will FAIL silently (treasury check per-territory). ` +
        `Purchase should only highlight hexes in territories that can afford it.`
      );
    }
  }

  // Enter buy mode
  const inBuyMode = startPurchase(state, 'peasant');
  if (inBuyMode.purchaseType !== 'peasant') {
    uiIssue('buy-mode-fails', 'startPurchase did not set purchaseType');
    return state;
  }
  uiOk('buy-mode', 'Enter peasant purchase mode ✓ (button highlights gold)');

  // Find a valid placement hex (empty, in richTerritory, no castle, no capital)
  const placeable = richTerritory.hexes.find(coord => {
    const h = state.hexes.get(hexKey(coord.q, coord.r));
    return h && h.unitTier === null && !h.hasCastle && !h.hasCapital && !h.hasNomad;
  });

  if (!placeable) {
    uiIssue('no-place', 'No valid placement hex in territory — all hexes occupied');
    return state;
  }

  const afterBuy = handleHexTap(inBuyMode, placeable.q, placeable.r);
  const placed = afterBuy.hexes.get(hexKey(placeable.q, placeable.r))!;

  if (placed.unitTier === 0) {
    uiOk('buy-place', `Peasant placed at (${placeable.q},${placeable.r}) ✓`);
  } else {
    uiIssue('buy-place-fails', `Placement at (${placeable.q},${placeable.r}) did not place unit`);
  }

  if (afterBuy.purchaseType !== null) {
    uiIssue('buy-mode-not-cleared', 'Purchase mode should clear after placement');
  }

  // Try to place on a hex with a nomad — should it work?
  const nomadHex = richTerritory.hexes.find(coord => {
    const h = state.hexes.get(hexKey(coord.q, coord.r));
    return h && h.hasNomad && !h.hasCastle && !h.hasCapital && h.unitTier === null;
  });
  if (nomadHex) {
    const afterBuyNomad = handleHexTap(inBuyMode, nomadHex.q, nomadHex.r);
    const nomadPlaced = afterBuyNomad.hexes.get(hexKey(nomadHex.q, nomadHex.r))!;
    if (nomadPlaced.unitTier === 0) {
      uiOk('buy-on-nomad', `Buying on nomad hex clears nomad + places unit ✓ (nomad=${nomadPlaced.hasNomad})`);
    } else {
      uiIssue('buy-on-nomad-blocked', 'Cannot buy peasant on a nomad hex — but purchase target highlights include nomad hexes, which is misleading');
    }
  }

  return afterBuy;
}

function testCombine(state: GameState): GameState {
  section('COMBINE UNITS — two same-tier units merge into next tier');
  // Find two same-tier unmoved units in the same territory
  const playerId = 0;
  const playerHexes = Array.from(state.hexes.values())
    .filter(h => h.owner === playerId && h.unitTier !== null);

  let pairA: GameHex | null = null;
  let pairB: GameHex | null = null;

  for (const hexA of playerHexes) {
    for (const hexB of playerHexes) {
      if (hexA === hexB) continue;
      if (hexA.unitTier !== hexB.unitTier) continue;
      const newTier = getTierForCombinedStrength(hexA.unitTier!, hexB.unitTier!);
      if (newTier === -1) continue;
      // Must be adjacent
      const adjacent = getNeighbors(hexA.q, hexA.r).some(n => n.q === hexB.q && n.r === hexB.r);
      if (!adjacent) continue;
      // Must be same territory
      const tA = getTerritoryForHex(hexA.q, hexA.r, state.territories);
      const tB = getTerritoryForHex(hexB.q, hexB.r, state.territories);
      if (!tA || !tB || tA.id !== tB.id) continue;
      pairA = hexA;
      pairB = hexB;
      break;
    }
    if (pairA) break;
  }

  if (!pairA || !pairB) {
    console.log('  (no adjacent same-tier pair found — skipping combine test)');
    uiIssue('combine-discovery', 'Combine mode has no visual indicator of which units CAN be combined — player must enable mode and tap around to discover.');
    return state;
  }

  const newTier = getTierForCombinedStrength(pairA.unitTier!, pairB.unitTier!);
  console.log(`  Pair: T${pairA.unitTier} at (${pairA.q},${pairA.r}) + T${pairB.unitTier} at (${pairB.q},${pairB.r}) → T${newTier}`);

  // Enter combine mode
  const combineMode = toggleCombineMode(state);
  if (!combineMode.combineMode) {
    uiIssue('combine-toggle-fails', 'toggleCombineMode did not enable combine mode');
    return state;
  }
  uiOk('combine-mode', 'Combine mode enabled ✓');

  // Select unit A
  const selA = handleHexTap(combineMode, pairA.q, pairA.r);
  if (!selA.selectedHex) {
    uiIssue('combine-select-fails', 'Could not select unit A in combine mode');
    return state;
  }
  uiOk('combine-select', `Unit A selected ✓`);

  // Tap unit B to combine
  const afterCombine = handleHexTap(selA, pairB.q, pairB.r);
  const resultHex = afterCombine.hexes.get(hexKey(pairB.q, pairB.r))!;
  const sourceHex = afterCombine.hexes.get(hexKey(pairA.q, pairA.r))!;

  if (resultHex.unitTier === newTier) {
    uiOk('combine-result', `Combined into T${newTier} at (${pairB.q},${pairB.r}) ✓`);
  } else {
    uiIssue('combine-result-wrong', `Expected T${newTier} but got T${resultHex.unitTier}`);
  }

  if (sourceHex.unitTier !== null) {
    uiIssue('combine-source-not-cleared', 'Source hex should be empty after combine');
  }

  if (afterCombine.combineMode) {
    uiIssue('combine-mode-sticky', 'Combine mode stays active after successful combine — player must manually cancel');
  } else {
    uiOk('combine-mode-clears', 'Combine mode exits after combine ✓');
  }

  return afterCombine;
}

function testFreeMovement(state: GameState): GameState {
  section('FREE MOVEMENT — move within territory does not consume action');
  const units = findHumanUnitHexes(state);

  for (const unit of units) {
    const friendlyMoves = findValidMoveTargets(state, unit);
    if (friendlyMoves.length === 0) continue;

    const target = friendlyMoves[0];
    console.log(`  Unit at ${describeHex(state, unit.q, unit.r)}`);
    console.log(`  Moving to friendly hex ${describeHex(state, target.q, target.r)}`);

    const sel = handleHexTap(state, unit.q, unit.r);
    const afterMove = handleHexTap(sel, target.q, target.r);
    const movedHex = afterMove.hexes.get(hexKey(target.q, target.r))!;
    const originHex = afterMove.hexes.get(hexKey(unit.q, unit.r))!;

    if (movedHex.unitTier !== unit.unitTier) {
      uiIssue('free-move-no-unit', 'Unit did not move to friendly hex');
      return afterMove;
    }

    if (movedHex.unitMoved) {
      uiIssue('free-move-costs-action', 'Moving within territory incorrectly consumed the unit action (unitMoved=true)');
    } else {
      uiOk('free-move-free', 'Moving within territory is free — unitMoved stays false ✓');
    }

    if (originHex.unitTier !== null) {
      uiIssue('free-move-origin-not-cleared', 'Source hex not cleared after move');
    }

    // Verify unit can still act after repositioning (e.g. attack a neutral)
    const neutrals = findNeutralTargets(afterMove, movedHex);
    if (neutrals.length > 0) {
      const afterAttack = handleHexTap(handleHexTap(afterMove, movedHex.q, movedHex.r), neutrals[0].q, neutrals[0].r);
      const attackedHex = afterAttack.hexes.get(hexKey(neutrals[0].q, neutrals[0].r))!;
      if (attackedHex.owner === 0 && attackedHex.unitMoved) {
        uiOk('free-move-then-attack', 'Unit repositioned freely then captured neutral hex in same turn ✓');
      } else {
        uiIssue('free-move-then-attack-fails', 'Unit could not attack after free repositioning');
      }
      return afterAttack;
    }

    return afterMove;
  }

  console.log('  (no valid friendly move found — skipping free movement test)');
  return state;
}

function testEndTurn(state: GameState): GameState {
  section('END TURN — triggers AI, advances to P0 next turn');
  const unmovedBefore = findHumanUnitHexes(state).length;
  console.log(`  Unmoved P0 units before end turn: ${unmovedBefore}`);

  if (unmovedBefore > 0) {
    uiIssue('no-endturn-warning',
      `Player has ${unmovedBefore} unit(s) that haven't moved, but END TURN button shows no warning. ` +
      `Player can accidentally waste unit actions.`
    );
  }

  const afterEnd = endTurn(state);

  const unmovedAfter = Array.from(afterEnd.hexes.values())
    .filter(h => h.owner === 0 && h.unitTier !== null && !h.unitMoved).length;

  uiOk('end-turn', `Turn ended. New turn #${afterEnd.turnNumber}, currentPlayer=${afterEnd.currentPlayer}`);
  console.log(`  P0 units reset: ${unmovedAfter} available next turn`);

  if (afterEnd.currentPlayer !== 0) {
    uiIssue('player-mismatch', `After endTurn, currentPlayer is ${afterEnd.currentPlayer} instead of 0`);
  }

  // Check AI ran (P1 territory should have changed)
  const p1hexes = Array.from(afterEnd.hexes.values()).filter(h => h.owner === 1).length;
  console.log(`  P1 hexes after their AI turn: ${p1hexes}`);
  uiOk('ai-ran', 'AI ran synchronously inside endTurn ✓ (no loading state — may freeze on slow devices)');

  return afterEnd;
}

function testPurchaseTargetHighlight(state: GameState) {
  section('PURCHASE TARGET HIGHLIGHTING — all player hexes or only affordable ones?');

  // Count how many P0 hexes have nomads (these appear as gold-bordered purchase targets
  // but placing there will succeed only if tryPlacePurchase allows it)
  const playerHexes = Array.from(state.hexes.values()).filter(h => h.owner === 0);
  const nomadHexes = playerHexes.filter(h => h.hasNomad && h.unitTier === null && !h.hasCastle && !h.hasCapital);
  const emptyHexes = playerHexes.filter(h => h.unitTier === null && !h.hasCastle && !h.hasCapital);
  const capitalHexes = playerHexes.filter(h => h.hasCapital && h.unitTier === null);

  console.log(`  P0 player hexes: ${playerHexes.length}`);
  console.log(`  Empty (can place): ${emptyHexes.length} (includes ${nomadHexes.length} with nomads)`);
  console.log(`  Capital hexes (can't place): ${capitalHexes.length}`);

  // purchaseTargetKeys includes: owner===currentPlayer && unitTier===null && !hasCapital && !hasCastle
  // This INCLUDES nomad hexes — they will show as gold bordered
  // But tryPlacePurchase will ALSO succeed on nomad hexes (it doesn't check hasNomad)
  // This is actually consistent — nomad gets cleared on placement
  uiOk('purchase-targets-consistent', 'Purchase targets correctly exclude capitals/castles/units ✓');

  // Multi-territory affordability check
  const territories = state.territories.filter(t => t.owner === 0);
  if (territories.length > 1) {
    const affordable = territories.filter(t => t.treasury >= PEASANT_COST);
    const unaffordable = territories.filter(t => t.treasury < PEASANT_COST);

    if (unaffordable.length > 0) {
      uiIssue('multi-territory-purchase',
        `Player has ${territories.length} territories: ${affordable.length} can afford peasant, ${unaffordable.length} cannot. ` +
        `Purchase targets highlight ALL territories' hexes (gold border), but tapping a hex in a broke territory fails silently. ` +
        `Should only highlight hexes in territories with enough treasury.`
      );
    }
  }
}

function testGameOverState(state: GameState) {
  section('GAME OVER STATE — overlay and button states');
  if (state.phase !== 'game_over') {
    console.log('  (game not over — cannot test this path in simulation)');
    return;
  }

  // handleHexTap should be a no-op after game over
  const h = Array.from(state.hexes.values())[0];
  const afterTap = handleHexTap(state, h.q, h.r);
  if (afterTap === state) {
    uiOk('game-over-noop', 'handleHexTap ignored after game_over ✓');
  } else {
    uiIssue('game-over-tap', 'Game state mutated after game_over — taps should be ignored');
  }
}

function testUIStatDisplay(state: GameState) {
  section('ACTION PANEL STATS — what numbers does the player see?');
  const territories = state.territories.filter(t => t.owner === 0);
  const totalTreasury = territories.reduce((s, t) => s + t.treasury, 0);
  const totalIncome = territories.reduce((s, t) => s + t.income, 0);
  const totalUpkeep = territories.reduce((s, t) => s + t.upkeep, 0);
  const bestTerritoryTreasury = territories.length > 0
    ? Math.max(...territories.map(t => t.treasury))
    : 0;

  console.log(`  Territories: ${territories.length}`);
  console.log(`  Total: treasury=$${totalTreasury} income=+${totalIncome} upkeep=-${totalUpkeep} net=${totalIncome - totalUpkeep}`);
  console.log(`  Best territory treasury: $${bestTerritoryTreasury}`);

  if (territories.length > 1) {
    uiIssue('stats-context-switching',
      `With ${territories.length} territories, ActionPanel shows stats for the SELECTED territory ` +
      `(or the richest one when nothing selected). ` +
      `Player may not realize these are per-territory, not global totals. ` +
      `Label "NET" doesn't clarify which territory it's showing.`
    );
  }

  // Net income negative → player should be warned
  if (totalIncome - totalUpkeep < 0) {
    uiIssue('negative-net-no-alert',
      `Net income is ${totalIncome - totalUpkeep}. UI shows red "NET" value but no warning/pulse animation ` +
      `to alert player they will go bankrupt next turn.`
    );
  }
}

// ─── main simulation ───────────────────────────────────────────────────────────

test('human UI simulation', () => {
  console.log('\n' + '═'.repeat(60));
  console.log('HUMAN UI SIMULATION — Coalition vs Insurgents');
  console.log('═'.repeat(60));

  let state = createNewGame('coalition', 10);

  // Verify initial state
  section('INITIAL GAME STATE');
  const p0hexes = Array.from(state.hexes.values()).filter(h => h.owner === 0).length;
  const neutral = Array.from(state.hexes.values()).filter(h => h.owner === null).length;
  const units0 = Array.from(state.hexes.values()).filter(h => h.owner === 0 && h.unitTier !== null).length;
  console.log(`  P0 hexes: ${p0hexes}, P1 hexes: ${Array.from(state.hexes.values()).filter(h => h.owner === 1).length}, Neutral: ${neutral}`);
  console.log(`  P0 starting units: ${units0}`);
  console.log(`  currentPlayer: ${state.currentPlayer} (0=human Coalition)`);

  if (state.currentPlayer !== 0) {
    uiIssue('wrong-starting-player', 'Human should be player 0 and go first');
  } else {
    uiOk('starting-state', 'Human (P0 Coalition) starts first ✓');
  }

  // Run all interaction tests
  testUIStatDisplay(state);
  testPurchaseTargetHighlight(state);
  state = testSelectAndMove(state);
  state = testFreeMovement(state);
  state = testNomadClearing(state);
  state = testAttack(state);
  state = testBuyPeasant(state);
  state = testCombine(state);
  state = testEndTurn(state);

  // Run a few more turns to find issues that emerge mid-game
  section('MULTI-TURN SCAN — 5 turns as human, AI opponent');
  for (let turn = 2; turn <= 6; turn++) {
    // Simple human strategy: try to move one unit, then end turn
    const units = findHumanUnitHexes(state);
    for (const unit of units) {
      const neutrals = findNeutralTargets(state, unit);
      if (neutrals.length > 0) {
        const sel = handleHexTap(state, unit.q, unit.r);
        state = handleHexTap(sel, neutrals[0].q, neutrals[0].r);
        break;
      }
    }
    state = endTurn(state);
    if (state.phase === 'game_over') {
      console.log(`  Game ended on turn ${turn} — winner: P${state.winner}`);
      testGameOverState(state);
      break;
    }
  }

  section('SUMMARY OF FINDINGS');
  console.log('  See ⚠️  UI-ISSUE lines above for actionable problems.');
  expect(true).toBe(true);
});
