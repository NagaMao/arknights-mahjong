/** 日麻点数计算：符、番、满贯界限、庄家/闲家支付。 */

import type { PaymentInfo } from './types';

export type LimitName =
  | '满贯'
  | '跳满'
  | '倍满'
  | '三倍满'
  | '役满'
  | '累计役满'
  | '';

export interface ScoreBreakdown extends PaymentInfo {
  isYakuman: boolean;
  yakumanCount: number;
  limitName: string;
}

function roundUp100(value: number): number {
  return Math.ceil(value / 100) * 100;
}

/**
 * 2 人麻将支付：
 * - 荣和：闲家 base×4，庄家 base×6；
 * - 自摸：只有对手一家支付，庄/闲均为每家 base×2。
 */
export function calculatePayment(
  han: number,
  fu: number,
  isDealer: boolean,
  isTsumo: boolean,
  yakumanCount = 0,
): ScoreBreakdown {
  if (yakumanCount > 0) {
    const base = 8000 * yakumanCount;
    const multiplier = isTsumo ? 2 : isDealer ? 6 : 4;
    return {
      base,
      total: roundUp100(base * multiplier),
      isYakuman: true,
      yakumanCount,
      limitName: yakumanCount > 1 ? `${yakumanCount}倍役满` : '役满',
    };
  }

  let base = fu * 2 ** (han + 2);
  let limitName: LimitName = '';
  let yakumanCountValue = 0;

  if (han >= 13) {
    base = 8000;
    limitName = '累计役满';
    yakumanCountValue = 1;
  } else if (han >= 11) {
    base = 6000;
    limitName = '三倍满';
  } else if (han >= 8) {
    base = 4000;
    limitName = '倍满';
  } else if (han >= 6) {
    base = 3000;
    limitName = '跳满';
  } else if (han >= 5 || base >= 2000) {
    base = 2000;
    limitName = '满贯';
  }

  const multiplier = isTsumo ? 2 : isDealer ? 6 : 4;
  return {
    base,
    total: roundUp100(base * multiplier),
    isYakuman: yakumanCountValue > 0,
    yakumanCount: yakumanCountValue,
    limitName,
  };
}

export function formatScore(score: number): string {
  return score.toLocaleString('zh-CN');
}

export function formatSignedScore(score: number): string {
  if (score === 0) return '±0';
  return `${score > 0 ? '+' : ''}${score.toLocaleString('zh-CN')}`;
}
