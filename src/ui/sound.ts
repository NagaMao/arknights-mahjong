/** 纯 Web Audio 技能提示音，无需额外音频资源。 */

import type { OperatorId } from '../game/types';

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/** 在用户首次点击开始时解锁音频上下文。 */
export function unlockAudio(): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
}

/** 干员技能发动提示音：阿米娅为高频双音，星熊为低频重击。 */
export function playSkillSound(operator: OperatorId): void {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  master.connect(ctx.destination);

  const notes = operator === 'amiya' ? [523.25, 783.99, 1046.5] : [110, 82.41, 164.81];
  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = operator === 'amiya' ? 'triangle' : 'sawtooth';
    oscillator.frequency.setValueAtTime(frequency, now + index * 0.08);
    gain.gain.setValueAtTime(0.0001, now + index * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.08 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.55);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(now + index * 0.08);
    oscillator.stop(now + index * 0.08 + 0.6);
  });
}
