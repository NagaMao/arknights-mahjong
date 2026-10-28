import { useState } from 'react';
import { OPERATORS } from '../game/skills';
import { hashSeed } from '../game/tiles';
import type { OperatorId } from '../game/types';
import { OperatorAvatar } from './OperatorAvatar';

interface StartScreenProps {
  onStart: (operator: OperatorId, seed: number) => void;
  onHelp: () => void;
}

const seedNumber = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed === '') return Math.floor(Math.random() * 1_000_000_000);
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : hashSeed(trimmed);
};

export function StartScreen({ onStart, onHelp }: StartScreenProps) {
  const [operator, setOperator] = useState<OperatorId>('amiya');
  const [seed, setSeed] = useState(() => String(Math.floor(Math.random() * 1_000_000_000)));
  const aiOperator: OperatorId = operator === 'amiya' ? 'hoshiguma' : 'amiya';

  return (
    <div className="start-screen">
      <div className="start-grid" aria-hidden="true" />
      <div className="start-hazard" aria-hidden="true" />
      <header className="start-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">R</span>
          <div>
            <div className="brand-title">RHODES ISLAND</div>
            <div className="brand-sub">TACTICAL MAHJONG DIVISION</div>
          </div>
        </div>
        <div className="start-top-meta">
          <span>OPERATION // 02</span>
          <span className="live-dot" /> <span>LOCAL SIMULATION</span>
        </div>
      </header>

      <main className="start-main">
        <section className="start-hero">
          <div className="hero-kicker">
            <span className="hero-line" />
            <span>双人立直麻将 · 半庄战</span>
          </div>
          <h1>
            明日
            <br />
            <em>雀庄</em>
          </h1>
          <p className="hero-copy">
            牌山与源石技艺交织，胜负只在一巡之间。
            <br />
            选择你的干员，与另一位干员展开东风、南风两场的点数对决。
          </p>
          <div className="hero-tags">
            <span>2 PLAYERS</span>
            <span>RIICHI</span>
            <span>SKILL SYSTEM</span>
            <span>SEEDED RNG</span>
          </div>
          <div className="hero-cta">
            <button
              type="button"
              className="btn btn--primary btn--start"
              onClick={() => onStart(operator, seedNumber(seed))}
            >
              开始行动 <span>→</span>
            </button>
            <button type="button" className="btn btn--ghost" onClick={onHelp}>
              规则与操作
            </button>
          </div>
          <div className="hero-footnote">
            <span className="micro-label">部署说明</span>
            <p>每局限一次主动技能 · SP 跨局保留 · 南四局结束或有人被击飞时结算</p>
          </div>
        </section>

        <section className="operator-select">
          <div className="section-heading">
            <span className="micro-label">SELECT OPERATOR</span>
            <h2>选择出击干员</h2>
            <p>对手将由另一位干员自动接管。</p>
          </div>

          <div className="operator-cards">
            {(Object.keys(OPERATORS) as OperatorId[]).map((id) => {
              const info = OPERATORS[id];
              const selected = operator === id;
              return (
                <button
                  type="button"
                  key={id}
                  className={`operator-card operator-card--${id} ${selected ? 'is-selected' : ''}`}
                  onClick={() => setOperator(id)}
                  aria-pressed={selected}
                >
                  <div className="operator-card-portrait">
                    <OperatorAvatar operator={id} size="lg" />
                    <span className="operator-class">{id === 'amiya' ? 'CASTER' : 'DEFENDER'}</span>
                    {selected && <span className="operator-check">✓</span>}
                  </div>
                  <div className="operator-card-body">
                    <div className="operator-card-top">
                      <div>
                        <span className="micro-label">{info.code}</span>
                        <h3>{info.name}</h3>
                      </div>
                    </div>
                    <div className="operator-skill-text">
                      <div className="operator-skill-block">
                        <div className="operator-skill-heading">
                          <span className="skill-pill">主动技能</span>
                          <strong>{info.activeName}</strong>
                          <span className="operator-cost">{info.spCost} SP</span>
                        </div>
                        <p>{info.activeDescription}</p>
                      </div>
                      <div className="operator-skill-block operator-skill-block--passive">
                        <div className="operator-skill-heading">
                          <span className="skill-pill skill-pill--passive">被动技能</span>
                          <strong>{info.passiveName}</strong>
                        </div>
                        <p>{info.passiveDescription}</p>
                      </div>
                    </div>
                    <blockquote>“{info.quote}”</blockquote>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="seed-panel">
            <div className="seed-copy">
              <span className="micro-label">RNG SEED</span>
              <span>同一牌山种子可复现整场对局</span>
            </div>
            <div className="seed-control">
              <input
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
                aria-label="牌山随机种子"
                spellCheck={false}
              />
              <button
                type="button"
                className="seed-dice"
                title="随机种子"
                onClick={() => setSeed(String(Math.floor(Math.random() * 1_000_000_000)))}
              >
                ↻
              </button>
            </div>
          </div>

          <div className="versus-line">
            <span className="versus-side">
              <b>{OPERATORS[operator].name}</b>
              <span>YOU</span>
            </span>
            <span className="versus-mark">VS</span>
            <span className="versus-side versus-side--ai">
              <b>{OPERATORS[aiOperator].name}</b>
              <span>AI · SIMPLE</span>
            </span>
          </div>
        </section>
      </main>

      <footer className="start-footer">
        <span>ARKNIGHTS FAN PROJECT · 非商业同人作品</span>
        <span>立绘 / 牌面素材来自项目内 prts_models 与 mahjong_graphic</span>
        <span>v1.1.0</span>
      </footer>
    </div>
  );
}
