import { useState, type ReactNode } from 'react';
import { OPERATORS, getAmiyaSelectableTiles } from '../game/skills';
import { isHonor, rankOf, suitOf, tileName } from '../game/tiles';
import type { ChiOption, GameState, Tile as TileType } from '../game/types';
import { Tile } from './Tile';

interface ConfirmModalProps {
  kicker?: string;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: 'default' | 'danger' | 'gold';
}

export function ConfirmModal({
  kicker = 'CONFIRM ACTION',
  title,
  children,
  confirmLabel,
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  tone = 'default',
}: ConfirmModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className={`confirm-modal confirm-modal--${tone}`} role="dialog" aria-modal="true">
        <span className="micro-label">{kicker}</span>
        <h3>{title}</h3>
        <div className="confirm-content">{children}</div>
        <div className="confirm-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const GROUPS: { label: string; tiles: TileType[] }[] = [
  { label: '万', tiles: Array.from({ length: 9 }, (_, index) => index) },
  { label: '筒', tiles: Array.from({ length: 9 }, (_, index) => 9 + index) },
  { label: '索', tiles: Array.from({ length: 9 }, (_, index) => 18 + index) },
  { label: '字', tiles: Array.from({ length: 7 }, (_, index) => 27 + index) },
];

interface SkillTargetModalProps {
  state: GameState;
  onConfirm: (tile: TileType) => void;
  onCancel: () => void;
}

export function SkillTargetModal({ state, onConfirm, onCancel }: SkillTargetModalProps) {
  const [target, setTarget] = useState<TileType | null>(null);
  const available = new Set(getAmiyaSelectableTiles(state));
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="skill-target-modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <span className="micro-label">ARTS // CHIMERA</span>
            <h3>奇美拉 · 牌山检索</h3>
            <p>选择一张仍存在于牌山中的牌。检索后立即取得；本巡可正常和牌 / 立直，本巡结束后进入 3 巡摸切限制。</p>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="tile-picker">
          {GROUPS.map((group) => (
            <div className="tile-picker-group" key={group.label}>
              <span className="tile-picker-label">{group.label}</span>
              <div className="tile-picker-row">
                {group.tiles.map((tile) => {
                  const enabled = available.has(tile);
                  return (
                    <Tile
                      key={tile}
                      tile={tile}
                      small
                      selected={target === tile}
                      disabled={!enabled}
                      dim={!enabled}
                      onClick={enabled ? () => setTarget(tile) : undefined}
                      title={enabled ? tileName(tile) : `${tileName(tile)} · 不可检索`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <footer className="modal-footer">
          <div className="selected-target">
            <span className="micro-label">TARGET</span>
            {target === null ? (
              <span>尚未选择</span>
            ) : (
              <>
                <Tile tile={target} mini />
                <strong>{tileName(target)}</strong>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              取消
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={target === null}
              onClick={() => target !== null && onConfirm(target)}
            >
              发动奇美拉
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

interface ChiModalProps {
  options: ChiOption[];
  onConfirm: (option: ChiOption) => void;
  onCancel: () => void;
}

export function ChiModal({ options, onConfirm, onCancel }: ChiModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-modal" role="dialog" aria-modal="true">
        <span className="micro-label">CHI OPTIONS</span>
        <h3>选择吃牌组合</h3>
        <div className="chi-options">
          {options.map((option) => (
            <button
              type="button"
              className="chi-option"
              key={option.join('-')}
              onClick={() => onConfirm(option as ChiOption)}
            >
              <span className="chi-option-tiles">
                {option.map((tile) => (
                  <Tile key={tile} tile={tile} mini />
                ))}
              </span>
              <span>{option.map(tileName).join(' · ')}</span>
              <span className="chi-option-arrow">→</span>
            </button>
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            不吃了
          </button>
        </div>
      </div>
    </div>
  );
}

interface ChoiceTileModalProps {
  title: string;
  kicker: string;
  description: string;
  tiles: TileType[];
  onConfirm: (tile: TileType) => void;
  onCancel: () => void;
}

export function ChoiceTileModal({ title, kicker, description, tiles, onConfirm, onCancel }: ChoiceTileModalProps) {
  const [choice, setChoice] = useState<TileType | null>(tiles[0] ?? null);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="confirm-modal" role="dialog" aria-modal="true">
        <span className="micro-label">{kicker}</span>
        <h3>{title}</h3>
        <p className="modal-desc">{description}</p>
        <div className="choice-tiles">
          {tiles.map((tile) => (
            <Tile
              key={tile}
              tile={tile}
              selected={choice === tile}
              onClick={() => setChoice(tile)}
            />
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={choice === null}
            onClick={() => choice !== null && onConfirm(choice)}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="help-modal" role="dialog" aria-modal="true">
        <header className="modal-header">
          <div>
            <span className="micro-label">FIELD MANUAL</span>
            <h2>规则与操作</h2>
            <p>2 人立直麻将 · 东风场 / 南风场半庄</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>
        <div className="help-scroll">
          <section>
            <h3>对局流程</h3>
            <p>
              双方各 30000 点。庄家先摸牌，按「摸牌 → 出牌 → 对手鸣牌/和牌」推进。牌山共 96 张可摸牌，
              摸尽即流局。东风场结束后进入南风场；南四局结束或任一方点数 ≤ 0 时对局结束。
            </p>
            <ul>
              <li>庄家和牌或流局听牌：连庄，本场 +1；否则换庄并重置本场。</li>
              <li>每本场和牌额外 +300 点。立直棒与场供归下一位和牌者。</li>
              <li>流局时仅一方听牌，听牌者收取 3000 点。</li>
            </ul>
          </section>
          <section>
            <h3>操作</h3>
            <ul>
              <li><b>双击</b>手牌直接出牌；单击手牌用于选中并预览立直听牌。摸到的牌单独放在最右侧。</li>
              <li>碰、吃、杠、自摸、荣和点击后立即执行，不再弹出二次确认弹窗。</li>
              <li>和牌结算展示完整手牌与副露，并用「宝」「里」「赤」标记宝牌、里宝牌与赤宝牌。</li>
              <li>点击手牌旁的「立直」进入宣言状态：只有可立直的宣言牌保持可点，其余手牌置灰。单击或悬停宣言牌可预览立直后的听牌，再次单击该宣言牌即宣告立直。</li>
              <li>若不点击「立直」，直接双击宣言牌则普通出牌（默听）；单击宣言牌同样可以预览其立直听牌。</li>
              <li>立直后摸牌默认自动摸切；只有自摸、荣和、暗杠等需要确认时暂停并显示按钮。</li>
              <li>副露状态下，悬停某张打出后能听牌的手牌，会弹出「打这张听什么」的等待牌气泡。</li>
              <li>对家舍牌后，可用「荣和 / 碰 / 杠 / 吃 / 过」响应；吃牌有多个组合时会弹出选择。</li>
              <li>食替禁止：鸣牌后当前巡不能打出被鸣的牌，或会组成同一顺子的替换牌；下巡自动解除。</li>
            </ul>
          </section>
          <section>
            <h3>技能与 SP</h3>
            <p>
              每打出一张牌获得 1 SP；阿米娅打出字牌额外 +1。SP 上限等于主动技能消耗，
              当局结束后不清空。主动技能每局限用一次。
            </p>
            <div className="help-operators">
              {(Object.values(OPERATORS)).map((info) => (
                <div className={`help-operator help-operator--${info.id}`} key={info.id}>
                  <div>
                    <span className="micro-label">{info.code}</span>
                    <h4>{info.name}</h4>
                  </div>
                  <p>
                    <b>主动 · {info.activeName}（{info.spCost} SP）</b>
                    {info.activeDescription}
                  </p>
                  <p>
                    <b>被动 · {info.passiveName}</b>
                    {info.passiveDescription}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3>2 人调整</h3>
            <ul>
              <li>无多家和牌，荣和支付者固定为对手。</li>
              <li>2 人座次为东家 / 南家；庄家为东家，闲家为南家。</li>
              <li>自摸时仅对手一家支付；闲家自摸为 base ×2（庄家支付），荣和为 base ×4。</li>
              <li>保留立直、一发、振听、抢杠、九种九牌、四杠散了、流局满贯与宝牌/里宝牌。</li>
              <li>岭上牌最多 4 张，最多 4 次杠；杠后翻开新的宝牌指示牌。</li>
            </ul>
          </section>
          <section>
            <h3>牌面说明</h3>
            <p>
              万 / 筒 / 索为三色数牌，东南西北为风牌，白发中为三元牌。红色五万 / 五筒 / 五索为赤宝牌，
              和普通五视为同一种牌，但和牌时额外 +1 番。悬停任意牌时，双方牌河中同种牌（含赤五与普通五）会高亮。
              金色提示表示宝牌或高价值动作；红字「振听」时只能自摸，不能荣和。
            </p>
          </section>
        </div>
        <footer className="modal-footer">
          <span className="micro-label">TIP：种子相同，牌山与 AI 行为均可复现</span>
          <button type="button" className="btn btn--primary" onClick={onClose}>
            了解
          </button>
        </footer>
      </div>
    </div>
  );
}

/** 供界面显示的小牌名工具，避免各组件重复导入。 */
export function tinyTileName(tile: TileType): string {
  if (isHonor(tile)) return tileName(tile);
  const suit = suitOf(tile) === 'man' ? '万' : suitOf(tile) === 'pin' ? '筒' : '索';
  return `${rankOf(tile)}${suit}`;
}


