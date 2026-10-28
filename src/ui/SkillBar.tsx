import { OPERATORS, validateSkillActivation } from '../game/skills';
import { formatScore } from '../game/scoring';
import type { GameState, PlayerIndex } from '../game/types';
import { OperatorAvatar } from './OperatorAvatar';

interface SkillBarProps {
  state: GameState;
  player: PlayerIndex;
  onUseSkill?: () => void;
  compact?: boolean;
}

export function SkillBar({ state, player, onUseSkill, compact }: SkillBarProps) {
  const p = state.players[player];
  const info = OPERATORS[p.operator];
  const validation = validateSkillActivation(state, player);
  const active = state.phase === 'discard' && state.turn === player;
  const baseReady =
    player === 0 &&
    active &&
    !p.skillUsed &&
    p.sp >= info.spCost &&
    p.amiyaLock === 0;
  const canPress = baseReady && (p.operator === 'amiya' ? !p.riichi : validation.ok);
  const reason = p.skillUsed
    ? '本局主动技能已使用'
    : p.operator === 'amiya' && p.riichi
      ? '立直中不能发动奇美拉'
      : baseReady
        ? p.operator === 'amiya'
          ? '选择要检索的牌'
          : '可以发动'
        : validation.reason ?? '当前无法发动';
  const seatLabel = state.dealer === player ? '东家' : '南家';

  return (
    <aside className={`skill-panel ${compact ? 'skill-panel--compact' : ''} skill-panel--${p.operator}`}>
      <div className="skill-identity">
        <OperatorAvatar operator={p.operator} size={compact ? 'sm' : 'md'} />
        <div className="skill-identity-text">
          <div className="skill-codename">{info.code}</div>
          <div className="skill-operator">
            {info.name}
            <span className={`skill-seat ${state.dealer === player ? 'is-dealer' : ''}`}>{seatLabel}</span>
            <span className="skill-seat skill-seat--role">{player === 0 ? 'YOU' : 'AI'}</span>
          </div>
          <div className="skill-score">
            <b>{formatScore(p.score)}</b>
            <span>点</span>
          </div>
        </div>
        <div className="sp-readout">
          <span className="sp-current">{p.sp}</span>
          <span className="sp-max">/{info.spCost}</span>
          <span className="sp-label">SP</span>
        </div>
      </div>

      <div className="sp-bar" aria-label={`SP ${p.sp}/${info.spCost}`}>
        {Array.from({ length: info.spCost }, (_, index) => (
          <span
            key={index}
            className={`sp-pip ${index < p.sp ? 'sp-pip--filled' : ''} ${
              p.sp >= info.spCost ? 'sp-pip--full' : ''
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        className={`skill-button ${p.skillUsed ? 'is-used' : ''} ${
          active && p.sp >= info.spCost && !p.skillUsed && !p.riichi ? 'is-ready' : ''
        }`}
        onClick={canPress ? onUseSkill : undefined}
        disabled={!canPress}
        title={reason}
      >
        <span className="skill-kind">主动 · {info.activeName}</span>
        <span className="skill-cost">
          {p.skillUsed ? '本局已发动' : `消耗 ${info.spCost} SP`}
        </span>
        <span className="skill-chevron">›</span>
      </button>

      {!compact && (
        <div className="skill-passive">
          <span className="passive-tag">被动</span>
          <strong>{info.passiveName}</strong>
          <p>{info.passiveDescription}</p>
        </div>
      )}

      {p.amiyaLockPending && (
        <div className="skill-warning">奇美拉：本巡不受限制，本巡结束后 3 巡只能摸切</div>
      )}
      {p.amiyaLock > 0 && (
        <div className="skill-warning">奇美拉代价：剩余 {p.amiyaLock} 巡只能摸切</div>
      )}
      {p.starNoCall && <div className="skill-warning">力之锯：本局不可鸣牌</div>}
      {p.starHanReduction && <div className="skill-warning">力之锯：对手和牌 -1 番</div>}
    </aside>
  );
}
