import type { OperatorId } from '../game/types';
import { OPERATOR_IMAGE } from './operatorAssets';

interface OperatorAvatarProps {
  operator: OperatorId;
  size?: 'sm' | 'md' | 'lg';
  dim?: boolean;
}

/** 干员立绘占位：使用 src/prts_models 中对应干员的透明底 PNG。 */
export function OperatorAvatar({ operator, size = 'md', dim }: OperatorAvatarProps) {
  return (
    <div className={`operator-avatar operator-avatar--${operator} operator-avatar--${size} ${dim ? 'is-dim' : ''}`}>
      <div className="avatar-glow" />
      <img
        src={OPERATOR_IMAGE[operator]}
        alt={operator === 'amiya' ? '阿米娅立绘' : '星熊立绘'}
        draggable={false}
      />
      <div className="avatar-scanline" />
      <span className="avatar-code">{operator === 'amiya' ? 'R001' : 'LM07'}</span>
    </div>
  );
}
