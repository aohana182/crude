import { createNewGame, handleHexTap, startPurchase, endTurn } from '../lib/game/gameEngine';
import { GameState, hexKey, GameHex, HexCoord } from '../lib/game/types';
import { getNeighbors } from '../lib/game/hexUtils';
import { PEASANT_COST, CASTLE_COST, UNIT_UPKEEP, UNIT_STRENGTH } from '../lib/game/constants';
import { getTerritoryForHex, getHexDefenseStrength } from '../lib/game/territoryManager';

function getPlayerStats(state: GameState, playerId: number) {
  let hexCount = 0;
  let unitCount = 0;
  let units: number[] = [0, 0, 0, 0];
  let castles = 0;
  let trees = 0;

  for (const hex of state.hexes.values()) {
    if (hex.owner === playerId) {
      hexCount++;
      if (hex.unitTier !== null) {
        unitCount++;
        units[hex.unitTier]++;
      }
      if (hex.hasCastle) castles++;
      if (hex.hasTree) trees++;
    }
  }

  const territories = state.territories.filter(t => t.owner === playerId);
  const totalTreasury = territories.reduce((s, t) => s + t.treasury, 0);
  const totalIncome = territories.reduce((s, t) => s + t.income, 0);
  const totalUpkeep = territories.reduce((s, t) => s + t.upkeep, 0);

  return { hexCount, unitCount, units, castles, trees, totalTreasury, totalIncome, totalUpkeep, territoryCount: territories.length };
}

function simulateHumanExpansion(state: GameState): GameState {
  const playerId = state.currentPlayer;

  for (const [key, hex] of state.hexes) {
    if (hex.owner !== playerId || hex.unitTier === null || hex.unitMoved) continue;

    const neighbors = getNeighbors(hex.q, hex.r);

    for (const n of neighbors) {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (nh && nh.owner === null) {
        const result = handleHexTap(state, hex.q, hex.r);
        if (result.selectedHex) {
          const expandResult = handleHexTap(result, n.q, n.r);
          if (expandResult !== result) {
            return expandResult;
          }
        }
      }
    }

    for (const n of neighbors) {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (nh && nh.owner !== null && nh.owner !== playerId) {
        const defense = getHexDefenseStrength(n.q, n.r, state.hexes);
        if (UNIT_STRENGTH[hex.unitTier] > defense) {
          const result = handleHexTap(state, hex.q, hex.r);
          if (result.selectedHex) {
            const attackResult = handleHexTap(result, n.q, n.r);
            if (attackResult !== result) {
              return attackResult;
            }
          }
        }
      }
    }
  }

  return state;
}

function simulateHumanCombine(state: GameState): GameState {
  const playerId = state.currentPlayer;

  for (const [key, hex] of state.hexes) {
    if (hex.owner !== playerId || hex.unitTier === null) continue;
    if (hex.unitTier !== 0) continue;

    const neighbors = getNeighbors(hex.q, hex.r);
    for (const n of neighbors) {
      const nh = state.hexes.get(hexKey(n.q, n.r));
      if (!nh || nh.owner !== playerId || nh.unitTier !== 0) continue;

      const result = handleHexTap(state, hex.q, hex.r);
      if (result.selectedHex) {
        const combineResult = handleHexTap(result, n.q, n.r);
        if (combineResult !== result) {
          return combineResult;
        }
      }
    }
  }

  return state;
}

function simulateHumanBuy(state: GameState): GameState {
  const playerId = state.currentPlayer;
  const territories = state.territories.filter(t => t.owner === playerId);

  for (const territory of territories) {
    if (territory.treasury < PEASANT_COST) continue;
    const projectedUpkeep = territory.upkeep + UNIT_UPKEEP[0];
    const projectedNet = territory.income - projectedUpkeep;
    if (projectedNet < 0 && territory.treasury - PEASANT_COST < Math.abs(projectedNet) * 5) continue;

    for (const coord of territory.hexes) {
      const hex = state.hexes.get(hexKey(coord.q, coord.r));
      if (!hex || hex.unitTier !== null || hex.hasCastle || hex.hasCapital) continue;

      const neighbors = getNeighbors(coord.q, coord.r);
      const bordersNeutralOrEnemy = neighbors.some(n => {
        const nh = state.hexes.get(hexKey(n.q, n.r));
        return nh && (nh.owner === null || (nh.owner !== null && nh.owner !== playerId));
      });

      if (bordersNeutralOrEnemy) {
        let result = startPurchase(state, 'peasant');
        result = handleHexTap(result, coord.q, coord.r);
        if (result.purchaseType === null) {
          return result;
        }
      }
    }
  }

  return state;
}

function simulateHumanTurn(state: GameState): GameState {
  let s = state;

  for (let i = 0; i < 20; i++) {
    const expanded = simulateHumanExpansion(s);
    if (expanded === s) break;
    s = expanded;
  }

  for (let i = 0; i < 2; i++) {
    const bought = simulateHumanBuy(s);
    if (bought === s) break;
    s = bought;
  }

  for (let i = 0; i < 1; i++) {
    const combined = simulateHumanCombine(s);
    if (combined === s) break;
    s = combined;
  }

  return s;
}

function runSimulation(numTurns: number = 40) {
  let state = createNewGame('army', 10);

  console.log('=== INITIAL STATE ===');
  const totalLand = state.hexes.size;
  let neutralCount = 0;
  for (const hex of state.hexes.values()) {
    if (hex.owner === null) neutralCount++;
  }
  console.log(`Total hexes: ${totalLand}, Neutral: ${neutralCount} (${Math.round(neutralCount/totalLand*100)}%)`);

  for (let p = 0; p < 2; p++) {
    const stats = getPlayerStats(state, p);
    console.log(`Player ${p} (${state.players[p].isHuman ? 'HUMAN' : 'AI'}): ${stats.hexCount} hexes, ${stats.unitCount} units [${stats.units}], treasury=${stats.totalTreasury}, income=${stats.totalIncome}, upkeep=${stats.totalUpkeep}`);
  }

  for (let turn = 1; turn <= numTurns; turn++) {
    if (state.phase === 'game_over') {
      console.log(`\n=== GAME OVER at turn ${turn} === Winner: Player ${state.winner} (${state.players[state.winner!].isHuman ? 'HUMAN' : 'AI'})`);
      break;
    }

    if (state.currentPlayer === 0) {
      state = simulateHumanTurn(state);
    }

    state = endTurn(state);

    if (turn % 5 === 0 || turn <= 3) {
      console.log(`\n--- Turn ${turn} ---`);
      for (let p = 0; p < 2; p++) {
        const stats = getPlayerStats(state, p);
        const label = state.players[p].isHuman ? 'HUM' : 'AI';
        console.log(`  P${p}(${label}): ${stats.hexCount} hex, ${stats.unitCount} units [${stats.units}], trees=${stats.trees}, $${stats.totalTreasury}, inc=${stats.totalIncome}, upk=${stats.totalUpkeep}, terr=${stats.territoryCount}`);
      }
      let neutral = 0;
      for (const hex of state.hexes.values()) {
        if (hex.owner === null) neutral++;
      }
      console.log(`  Neutral: ${neutral}`);
    }
  }

  console.log('\n=== FINAL STATE ===');
  for (let p = 0; p < 2; p++) {
    const stats = getPlayerStats(state, p);
    const label = state.players[p].isHuman ? 'HUMAN' : 'AI';
    console.log(`Player ${p} (${label}): ${stats.hexCount} hexes, ${stats.unitCount} units [${stats.units}], castles=${stats.castles}, trees=${stats.trees}, treasury=${stats.totalTreasury}, income=${stats.totalIncome}, upkeep=${stats.totalUpkeep}`);
  }
}

for (let i = 1; i <= 5; i++) {
  console.log(`\n${'='.repeat(40)}`);
  console.log(`=== SIMULATION ${i} ===`);
  console.log(`${'='.repeat(40)}`);
  runSimulation(50);
}
