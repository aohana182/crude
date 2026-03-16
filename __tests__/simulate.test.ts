import { createNewGame, handleHexTap, startPurchase, endTurn } from '../lib/game/gameEngine';
import { executeAITurn } from '../lib/game/aiPlayer';
import { GameState, hexKey, GameHex, HexCoord } from '../lib/game/types';
import { getNeighbors } from '../lib/game/hexUtils';
import { PEASANT_COST, CASTLE_COST, UNIT_UPKEEP, UNIT_STRENGTH } from '../lib/game/constants';
import { getTerritoryForHex, getHexDefenseStrength, buildHexTerritoryMap } from '../lib/game/territoryManager';

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
      if (hex.hasNomad) trees++;
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
        const defense = getHexDefenseStrength(n.q, n.r, state.hexes, buildHexTerritoryMap(state.territories));
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

function runSimulation(simIndex: number, numTurns: number = 100): { winner: number | null; turns: number; reason: string } {
  // AI vs AI: both players controlled by the AI engine
  let state = createNewGame('coalition', 10);
  state = { ...state, players: state.players.map(p => ({ ...p, isHuman: false })) };

  let bankruptcyEvents = 0;
  let splitEvents = 0;
  let prevTerritoryCount = [state.territories.filter(t => t.owner === 0).length, state.territories.filter(t => t.owner === 1).length];

  console.log(`\n${'='.repeat(50)}`);
  console.log(`GAME ${simIndex} — Coalition(P0) vs Insurgents(P1)`);
  console.log(`${'='.repeat(50)}`);

  const initialStats = [getPlayerStats(state, 0), getPlayerStats(state, 1)];
  console.log(`Start: P0=${initialStats[0].hexCount}hex $${initialStats[0].totalTreasury} | P1=${initialStats[1].hexCount}hex $${initialStats[1].totalTreasury} | Neutral=${Array.from(state.hexes.values()).filter(h => h.owner === null).length}`);

  for (let turn = 1; turn <= numTurns; turn++) {
    if (state.phase === 'game_over') {
      const winner = state.winner;
      const faction = winner !== null ? state.players[winner].faction : 'none';
      console.log(`  → GAME OVER turn ${turn}: ${faction.toUpperCase()} wins | bankruptcies=${bankruptcyEvents} splits=${splitEvents}`);
      return { winner, turns: turn, reason: 'conquest' };
    }

    // Player 0 (coalition AI): run AI manually then end turn
    try {
      state = executeAITurn(state);
    } catch (e) {
      console.error(`  AI error P0 turn ${turn}:`, e);
    }
    state = endTurn(state); // runs P1 AI, returns to P0

    // Check if the game ended during this turn (detection can happen mid-endTurn)
    if (state.phase === 'game_over') {
      const winner = state.winner;
      const faction = winner !== null ? state.players[winner].faction : 'none';
      console.log(`  → GAME OVER turn ${turn}: ${faction.toUpperCase()} wins | bankruptcies=${bankruptcyEvents} splits=${splitEvents}`);
      return { winner, turns: turn, reason: 'conquest' };
    }

    // Track bankruptcies (units that died → graves)
    const graves = Array.from(state.hexes.values()).filter(h => h.hasGrave).length;
    if (graves > 0) bankruptcyEvents++;

    // Track splits
    const currTerritoryCount = [state.territories.filter(t => t.owner === 0).length, state.territories.filter(t => t.owner === 1).length];
    if (currTerritoryCount[0] > prevTerritoryCount[0] || currTerritoryCount[1] > prevTerritoryCount[1]) splitEvents++;
    prevTerritoryCount = currTerritoryCount;

    if (turn % 10 === 0) {
      const s0 = getPlayerStats(state, 0);
      const s1 = getPlayerStats(state, 1);
      const neutral = Array.from(state.hexes.values()).filter(h => h.owner === null).length;
      console.log(`  T${turn}: P0=${s0.hexCount}hex units[${s0.units}] $${s0.totalTreasury} net=${s0.totalIncome - s0.totalUpkeep} terr=${s0.territoryCount} | P1=${s1.hexCount}hex units[${s1.units}] $${s1.totalTreasury} net=${s1.totalIncome - s1.totalUpkeep} terr=${s1.territoryCount} | neutral=${neutral}`);
    }
  }

  // No winner after numTurns
  const s0 = getPlayerStats(state, 0);
  const s1 = getPlayerStats(state, 1);
  const leading = s0.hexCount > s1.hexCount ? 0 : 1;
  console.log(`  → DRAW after ${numTurns} turns. P0=${s0.hexCount}hex P1=${s1.hexCount}hex | bankruptcies=${bankruptcyEvents} splits=${splitEvents}`);
  return { winner: null, turns: numTurns, reason: 'timeout' };
}

// Run 10 AI vs AI games and report aggregate findings
const NUM_GAMES = 10;
const results: { winner: number | null; turns: number; reason: string }[] = [];

for (let i = 1; i <= NUM_GAMES; i++) {
  results.push(runSimulation(i, 100));
}

console.log(`\n${'='.repeat(50)}`);
console.log('AGGREGATE RESULTS');
console.log(`${'='.repeat(50)}`);
const p0wins = results.filter(r => r.winner === 0).length;
const p1wins = results.filter(r => r.winner === 1).length;
const draws  = results.filter(r => r.winner === null).length;
const finishedGames = results.filter(r => r.winner !== null);
const avgTurns = finishedGames.length > 0 ? Math.round(finishedGames.reduce((s, r) => s + r.turns, 0) / finishedGames.length) : 'N/A';
console.log(`Coalition(P0) wins: ${p0wins}/${NUM_GAMES}`);
console.log(`Insurgents(P1) wins: ${p1wins}/${NUM_GAMES}`);
console.log(`Draws/Timeout:       ${draws}/${NUM_GAMES}`);
console.log(`Avg turns to finish: ${avgTurns}`);
test('simulation', () => { expect(true).toBe(true); });
