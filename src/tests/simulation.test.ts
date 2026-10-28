import { describe, expect, it } from 'vitest';
import { decideAiAction, type AiAction } from '../game/ai';
import {
  callChi,
  callKan,
  callPon,
  declareAnkan,
  declareKakan,
  declareNineTerminals,
  declareRon,
  declareTsumo,
  discardTile,
  passReaction,
  startGame,
  startNextHand,
} from '../game/state';
import { activateSkill } from '../game/skills';
import type { GameState, PlayerIndex } from '../game/types';

function apply(state: GameState, player: PlayerIndex, action: AiAction): GameState {
  switch (action.type) {
    case 'tsumo':
      return declareTsumo(state);
    case 'ron':
      return declareRon(state);
    case 'pass':
      return passReaction(state);
    case 'pon':
      return callPon(state);
    case 'kan':
      return callKan(state);
    case 'chi':
      return callChi(state, action.option);
    case 'skill':
      return activateSkill(state, player, action.tile !== undefined ? { tile: action.tile } : undefined);
    case 'ankan':
      return declareAnkan(state, action.tile);
    case 'kakan':
      return declareKakan(state, action.tile);
    case 'nineTerminals':
      return declareNineTerminals(state);
    case 'discard':
      return discardTile(state, player, action.tile, action.riichi);
  }
}

function playHands(seed: number, operator: 'amiya' | 'hoshiguma', maxHands = 4): { state: GameState; steps: number; hands: number } {
  let state = startGame({ seed, playerOperator: operator, startDealer: 0 });
  let steps = 0;
  let hands = 1;
  while (state.phase !== 'gameOver' && hands <= maxHands) {
    if (state.phase === 'handEnd') {
      if (hands >= maxHands) break;
      state = startNextHand(state);
      hands += 1;
      continue;
    }
    const player = state.turn;
    const action = decideAiAction(state, player);
    let next: GameState;
    try {
      next = apply(state, player, action);
    } catch (error) {
      throw new Error(
        `seed=${seed} step=${steps} phase=${state.phase} action=${JSON.stringify(action)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    expect(next).not.toBe(state);
    state = next;
    const total =
      state.players[0].score +
      state.players[1].score +
      state.pot +
      state.riichiSticks * 1000;
    expect(total).toBe(60000);
    steps += 1;
    if (steps > 4000) throw new Error(`seed=${seed} 对局超过 4000 步仍未结束`);
  }
  return { state, steps, hands };
}

describe('AI 自对弈冒烟测试', () => {
  it('阿米娅庄家可以完整跑完一局', () => {
    const { state, steps } = playHands(20241028, 'amiya', 1);
    expect(steps).toBeGreaterThan(10);
    expect(state.phase).toBe('handEnd');
    expect(state.settlement).not.toBeNull();
  });

  it('星熊庄家可以完整跑完一局', () => {
    const { state, steps } = playHands(8848, 'hoshiguma', 1);
    expect(steps).toBeGreaterThan(10);
    expect(state.phase).toBe('handEnd');
    expect(state.settlement).not.toBeNull();
  });

  it('多个种子连续跑多局不崩溃', () => {
    for (const seed of [1, 17, 2026, 99001]) {
      const { state, hands } = playHands(seed, 'amiya', 3);
      expect(hands).toBeGreaterThanOrEqual(1);
      expect(state.players[0].score + state.players[1].score).toBeLessThanOrEqual(60000 + 1000);
    }
  });
});
