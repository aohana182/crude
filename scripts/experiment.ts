import { createNewGame, endTurn } from '../lib/game/gameEngine';
import { GameState } from '../lib/game/types';

type AI = (s: GameState) => GameState;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function snapshot(state: GameState, p: number) {
  let hexes = 0;
  const tiers = [0, 0, 0, 0];
  for (const h of state.hexes.values()) {
    if (h.owner !== p) continue;
    hexes++;
    if (h.unitTier !== null) tiers[h.unitTier]++;
  }
  const ts = state.territories.filter(t => t.owner === p);
  return {
    hexes,
    tiers,
    treasury: ts.reduce((s, t) => s + t.treasury, 0),
    net: ts.reduce((s, t) => s + t.income - t.upkeep, 0),
  };
}

async function main() {
  const games = Number(arg('games', '20'));
  const maxTurns = Number(arg('turns', '80'));
  const ai0: AI = (await import(arg('ai0', '../lib/game/aiPlayer'))).executeAITurn;
  const ai1: AI = (await import(arg('ai1', '../lib/game/aiPlayer'))).executeAITurn;
  const ais = [ai0, ai1];
  const dispatch: AI = s => ais[s.currentPlayer](s);
  const checkTurn = Number(arg('check', '15'));

  const origError = console.error;
  console.error = () => {};

  const res = {
    games, p0Wins: 0, p1Wins: 0, draws: 0, errors: 0,
    decidedTurns: [] as number[],
    leaderWins: 0, leaderLosses: 0,
    maxTier: [[0, 0, 0, 0], [0, 0, 0, 0]],
    winnerTreasury: [] as number[],
    t30Treasury: [] as number[],
  };

  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    let state = createNewGame('coalition', 10);
    state = { ...state, players: state.players.map(p => ({ ...p, isHuman: false })) };
    const reached = [[false, false, false, false], [false, false, false, false]];
    let leader: number | null = null;
    let turn = 1;

    try {
      for (; turn <= maxTurns; turn++) {
        if (state.phase === 'game_over') break;
        state = ai0(state);
        state = endTurn(state, dispatch);

        for (const p of [0, 1]) {
          const s = snapshot(state, p);
          s.tiers.forEach((n, t) => { if (n > 0) reached[p][t] = true; });
        }
        if (turn === checkTurn) {
          const a = snapshot(state, 0).hexes, b = snapshot(state, 1).hexes;
          leader = a === b ? null : a > b ? 0 : 1;
        }
        if (turn === 30) res.t30Treasury.push(snapshot(state, 0).treasury + snapshot(state, 1).treasury);
      }
    } catch (e) {
      res.errors++;
      continue;
    }

    for (const p of [0, 1]) reached[p].forEach((r, t) => { if (r) res.maxTier[p][t]++; });

    if (state.phase === 'game_over' && state.winner !== null) {
      if (state.winner === 0) res.p0Wins++; else res.p1Wins++;
      res.decidedTurns.push(turn);
      res.winnerTreasury.push(snapshot(state, state.winner).treasury);
      if (leader !== null) { if (leader === state.winner) res.leaderWins++; else res.leaderLosses++; }
    } else {
      res.draws++;
    }
  }
  console.error = origError;

  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const pct = (n: number, d: number) => (d ? Math.round((1000 * n) / d) / 10 : 0);
  const decided = res.p0Wins + res.p1Wins;

  console.log(JSON.stringify({
    games, seconds: Math.round((Date.now() - t0) / 1000),
    p0WinPct: pct(res.p0Wins, games), p1WinPct: pct(res.p1Wins, games), drawPct: pct(res.draws, games), errors: res.errors,
    medianTurns: median(res.decidedTurns), meanTurns: Math.round(mean(res.decidedTurns)),
    [`leaderAtT${checkTurn}WinPct`]: pct(res.leaderWins, res.leaderWins + res.leaderLosses),
    gamesReachingTierPct_P0_P1: res.maxTier.map(m => m.map(n => pct(n, games))),
    meanWinnerTreasury: Math.round(mean(res.winnerTreasury)),
    meanTotalTreasuryT30: Math.round(mean(res.t30Treasury)),
    decided,
  }));
}

main();
