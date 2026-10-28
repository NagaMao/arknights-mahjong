import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canDeclareNineTerminals,
  canDeclareRiichi,
  callChi,
  callKan,
  callPon,
  declareAnkan,
  declareKakan,
  declareNineTerminals,
  declareRon,
  declareTsumo,
  discardTile,
  getAnkanOptions,
  getKakanOptions,
  getLegalDiscards,
  getReactionOptions,
  startGame,
  startNextHand,
  passReaction,
} from './game/state';
import { decideAiAction, type AiAction } from './game/ai';
import { activateSkill, OPERATORS, validateSkillActivation } from './game/skills';
import { sameTileKind } from './game/tiles';
import type { ChiOption, GameConfig, GameState, OperatorId, Tile } from './game/types';
import { HelpModal, ChiModal, ChoiceTileModal, ConfirmModal, SkillTargetModal } from './ui/Modals';
import { ResultModal } from './ui/ResultModal';
import { StartScreen } from './ui/StartScreen';
import { Table, type SkillBubbleInfo } from './ui/Table';
import { playSkillSound, unlockAudio } from './ui/sound';

interface ConfirmRequest {
  title: string;
  kicker?: string;
  description: string;
  confirmLabel: string;
  tone?: 'default' | 'danger' | 'gold';
  action: () => void;
}

interface ToastState {
  text: string;
  tone: 'info' | 'warn' | 'success';
}

function applyAiAction(state: GameState, action: AiAction): GameState {
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
      return activateSkill(state, 1, action.tile !== undefined ? { tile: action.tile } : undefined);
    case 'ankan':
      return declareAnkan(state, action.tile);
    case 'kakan':
      return declareKakan(state, action.tile);
    case 'nineTerminals':
      return declareNineTerminals(state);
    case 'discard':
      return discardTile(state, 1, action.tile, action.riichi);
    default:
      return state;
  }
}

export default function App() {
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [riichiMode, setRiichiMode] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [chiOptions, setChiOptions] = useState<ChiOption[] | null>(null);
  const [choiceTiles, setChoiceTiles] = useState<{ kind: 'ankan' | 'kakan'; tiles: Tile[] } | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [skillBubble, setSkillBubble] = useState<SkillBubbleInfo | null>(null);
  const lastConfigRef = useRef<GameConfig | null>(null);
  const busyRef = useRef(false);
  const bubbleTimerRef = useRef<number | null>(null);

  const human = game?.players[0];
  const canUseSkill =
    !!game &&
    game.turn === 0 &&
    game.phase === 'discard' &&
    !!human &&
    !human.skillUsed &&
    human.sp >= OPERATORS[human.operator].spCost &&
    human.amiyaLock === 0 &&
    !(human.operator === 'amiya' && human.riichi);

  const humanTurn = !!game && game.phase === 'discard' && game.turn === 0;
  const legalDiscards = useMemo(() => {
    if (!game || !humanTurn) return [];
    return getLegalDiscards(game, 0);
  }, [game, humanTurn]);

  const showToast = (text: string, tone: ToastState['tone'] = 'info') => setToast({ text, tone });

  const triggerSkillBubble = (state: GameState, player: 0 | 1) => {
    if (bubbleTimerRef.current !== null) window.clearTimeout(bubbleTimerRef.current);
    const info = OPERATORS[state.players[player].operator];
    setSkillBubble({ player, activeName: info.activeName });
    playSkillSound(state.players[player].operator);
    bubbleTimerRef.current = window.setTimeout(() => {
      setSkillBubble(null);
      bubbleTimerRef.current = null;
    }, 2200);
  };

  useEffect(() => () => {
    if (bubbleTimerRef.current !== null) window.clearTimeout(bubbleTimerRef.current);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    document.documentElement.classList.toggle('in-game', screen === 'game');
    return () => document.documentElement.classList.remove('in-game');
  }, [screen]);

  useEffect(() => {
    setRiichiMode(false);
    if (!game) {
      return;
    }
    if (game.phase !== 'discard' || game.turn !== 0) {
      setSelectedTile(null);
      return;
    }
    if (game.phase === 'discard' && game.turn === 0) {
      const p = game.players[0];
      if ((p.riichi || p.amiyaLock > 0) && game.drawnTile !== null) {
        setSelectedTile(game.drawnTile);
      } else {
        setSelectedTile(null);
      }
    } else {
      setSelectedTile(null);
    }
  }, [game]);

  useEffect(() => {
    if (!game) return;
    if (game.phase !== 'discard' && game.phase !== 'react') return;
    if (game.turn !== 1) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const action = decideAiAction(game, 1);
        const next = applyAiAction(game, action);
        if (next === game) throw new Error('AI 没有产生有效行动。');
        if (action.type === 'skill') {
          const info = OPERATORS[game.players[1].operator];
          showToast(`AI 发动「${info.activeName}」`, 'warn');
          triggerSkillBubble(game, 1);
        }
        setGame(next);
      } catch (error) {
        showToast(error instanceof Error ? error.message : 'AI 行动失败', 'warn');
      }
    }, 760);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [game]);

  const apply = (action: (state: GameState) => GameState): boolean => {
    if (!game || busyRef.current) return false;
    busyRef.current = true;
    try {
      const next = action(game);
      setGame(next);
      setSelectedTile(null);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : '操作失败', 'warn');
      return false;
    } finally {
      window.setTimeout(() => {
        busyRef.current = false;
      }, 80);
    }
  };

  const handleStart = (operator: OperatorId, seed: number) => {
    unlockAudio();
    const config: GameConfig = { playerOperator: operator, seed, startDealer: 0 };
    lastConfigRef.current = config;
    const next = startGame(config);
    setGame(next);
    setScreen('game');
    setSelectedTile(null);
    setRiichiMode(false);
    setToast(null);
    setSkillBubble(null);
  };

  const riichiCandidates = useMemo(() => {
    if (!game || !humanTurn) return [];
    return getLegalDiscards(game, 0).filter((tile) => canDeclareRiichi(game, 0, tile));
  }, [game, humanTurn]);

  const handleSelectTile = (tile: Tile) => {
    if (riichiMode) {
      if (!riichiCandidates.some((candidate) => sameTileKind(candidate, tile))) return;
      if (selectedTile !== null && sameTileKind(selectedTile, tile)) {
        if (apply((state) => discardTile(state, 0, tile, true))) {
          setRiichiMode(false);
        }
        return;
      }
      setSelectedTile(tile);
      return;
    }
    if (!legalDiscards.includes(tile)) return;
    setSelectedTile(tile);
  };

  const handleDoubleDiscard = (tile: Tile) => {
    if (!game || !humanTurn || riichiMode) return;
    if (!legalDiscards.includes(tile)) {
      showToast(
        game.players[0].kuikaeForbidden.some((forbidden) => sameTileKind(forbidden, tile))
          ? '食替禁止：当前巡不能打出这张牌。'
          : '当前不能打出这张牌。',
        'warn',
      );
      return;
    }
    apply((state) => discardTile(state, 0, tile));
  };

  const handleRiichi = () => {
    if (!game) return;
    if (riichiMode) {
      setRiichiMode(false);
      setSelectedTile(null);
      return;
    }
    if (riichiCandidates.length === 0) {
      showToast('当前不能立直：需要门清听牌且点数不少于 1000。', 'warn');
      return;
    }
    setRiichiMode(true);
    setSelectedTile(null);
  };

  const handleTsumo = () => {
    apply((state) => declareTsumo(state));
  };

  const handleReactionRon = () => {
    if (!game) return;
    const reaction = getReactionOptions(game);
    if (!reaction?.canRon) return;
    apply((state) => declareRon(state));
  };

  const handlePon = () => {
    apply((state) => callPon(state));
  };

  const handleKan = () => {
    apply((state) => callKan(state));
  };

  const handleChi = () => {
    if (!game) return;
    const reaction = getReactionOptions(game);
    if (!reaction || reaction.chiOptions.length === 0) return;
    if (reaction.chiOptions.length === 1) {
      apply((state) => callChi(state, reaction.chiOptions[0] as ChiOption));
    } else {
      setChiOptions(reaction.chiOptions as ChiOption[]);
    }
  };

  const handlePass = () => {
    if (!game) return;
    const reaction = getReactionOptions(game);
    if (!reaction) return;
    if (reaction.canRon) {
      setConfirm({
        kicker: 'PASS // FURITEN',
        title: '确定见逃？',
        description: '放弃这次荣和将进入振听状态，之后只能自摸和牌。',
        confirmLabel: '见逃',
        tone: 'danger',
        action: () => apply((state) => passReaction(state)),
      });
      return;
    }
    apply((state) => passReaction(state));
  };

  const handleUseSkill = () => {
    if (!game) return;
    const p = game.players[0];
    const validation = validateSkillActivation(game, 0);
    if (!validation.ok && p.operator !== 'amiya') {
      showToast(validation.reason ?? '当前不能发动技能', 'warn');
      return;
    }
    if (p.operator === 'amiya') {
      if (p.riichi) {
        showToast('立直中不能发动奇美拉。', 'warn');
        return;
      }
      setSkillPickerOpen(true);
      return;
    }
    setConfirm({
      kicker: 'SKILL // ACTIVE',
      title: '发动「力之锯」？',
      description: '本局对手和牌番数 -1（最低 1 番，役满不受影响），但本局不可再鸣牌。',
      confirmLabel: '发动',
      tone: 'default',
      action: () => {
        if (apply((state) => activateSkill(state, 0))) {
          showToast('星熊发动「力之锯」', 'success');
          if (game) triggerSkillBubble(game, 0);
        }
      },
    });
  };

  const handleAmiyaSkill = (tile: Tile) => {
    setSkillPickerOpen(false);
    if (apply((state) => activateSkill(state, 0, { tile }))) {
      showToast('阿米娅发动「奇美拉」', 'success');
      if (game) triggerSkillBubble(game, 0);
    }
  };

  const handleAnkan = () => {
    if (!game) return;
    const options = getAnkanOptions(game, 0);
    if (options.length === 0) return;
    if (options.length === 1) {
      apply((state) => declareAnkan(state, options[0]));
    } else {
      setChoiceTiles({ kind: 'ankan', tiles: options });
    }
  };

  const handleKakan = () => {
    if (!game) return;
    const options = getKakanOptions(game, 0);
    if (options.length === 0) return;
    if (options.length === 1) {
      apply((state) => declareKakan(state, options[0]));
    } else {
      setChoiceTiles({ kind: 'kakan', tiles: options });
    }
  };

  const handleNine = () => {
    if (!game || !canDeclareNineTerminals(game)) return;
    setConfirm({
      kicker: 'ABORTIVE DRAW',
      title: '宣告九种九牌？',
      description: '本局将立即流局，不进行听牌罚符。',
      confirmLabel: '宣告',
      tone: 'danger',
      action: () => apply((state) => declareNineTerminals(state)),
    });
  };

  const handleNextHand = () => {
    if (!game?.settlement || game.settlement.next.gameOver) return;
    try {
      setGame(startNextHand(game));
      setSelectedTile(null);
      setRiichiMode(false);
      setConfirm(null);
      setSkillBubble(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : '无法开始下一局', 'warn');
    }
  };

  const handleNewGame = () => {
    const config = game?.config ?? lastConfigRef.current;
    if (!config) {
      setScreen('title');
      return;
    }
    lastConfigRef.current = config;
    setGame(startGame(config));
    setSelectedTile(null);
    setRiichiMode(false);
    setConfirm(null);
    setSkillBubble(null);
  };

  const handleBackToTitle = () => {
    setScreen('title');
    setGame(null);
    setSelectedTile(null);
    setRiichiMode(false);
    setConfirm(null);
    setSkillPickerOpen(false);
    setChiOptions(null);
    setChoiceTiles(null);
    setSkillBubble(null);
  };

  const handleExit = () => {
    setConfirm({
      kicker: 'LEAVE OPERATION',
      title: '退出当前对局？',
      description: '本局进度不会保存，返回标题后需要重新开始。',
      confirmLabel: '退出',
      tone: 'danger',
      action: handleBackToTitle,
    });
  };

  const handleChoiceConfirm = (tile: Tile) => {
    if (!choiceTiles) return;
    const kind = choiceTiles.kind;
    setChoiceTiles(null);
    apply((state) => (kind === 'ankan' ? declareAnkan(state, tile) : declareKakan(state, tile)));
  };

  const resultOpen = !!game?.settlement && (game.phase === 'handEnd' || game.phase === 'gameOver');

  return (
    <>
      {screen === 'title' && <StartScreen onStart={handleStart} onHelp={() => setHelpOpen(true)} />}

      {screen === 'game' && game && (
        <Table
          state={game}
          selectedTile={selectedTile}
          riichiMode={riichiMode}
          skillBubble={skillBubble}
          onSelectTile={handleSelectTile}
          onDoubleDiscard={handleDoubleDiscard}
          onRiichi={handleRiichi}
          onTsumo={handleTsumo}
          onRon={handleReactionRon}
          onPon={handlePon}
          onKan={handleKan}
          onChi={handleChi}
          onPass={handlePass}
          onUseSkill={canUseSkill ? handleUseSkill : () => showToast('当前无法发动主动技能', 'warn')}
          onAnkan={handleAnkan}
          onKakan={handleKakan}
          onNineTerminals={handleNine}
          onHelp={() => setHelpOpen(true)}
          onExit={handleExit}
        />
      )}

      {resultOpen && game && (
        <ResultModal
          state={game}
          onNextHand={handleNextHand}
          onNewGame={handleNewGame}
          onBackToTitle={handleBackToTitle}
        />
      )}

      {confirm && (
        <ConfirmModal
          kicker={confirm.kicker}
          title={confirm.title}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => {
            const action = confirm.action;
            setConfirm(null);
            action();
          }}
          onCancel={() => setConfirm(null)}
          tone={confirm.tone}
        >
          <p className="modal-desc">{confirm.description}</p>
        </ConfirmModal>
      )}

      {skillPickerOpen && game && (
        <SkillTargetModal
          state={game}
          onConfirm={handleAmiyaSkill}
          onCancel={() => setSkillPickerOpen(false)}
        />
      )}

      {chiOptions && (
        <ChiModal
          options={chiOptions}
          onConfirm={(option) => {
            setChiOptions(null);
            apply((state) => callChi(state, option));
          }}
          onCancel={() => setChiOptions(null)}
        />
      )}

      {choiceTiles && (
        <ChoiceTileModal
          kicker={choiceTiles.kind === 'ankan' ? 'CLOSED KAN' : 'ADDED KAN'}
          title={choiceTiles.kind === 'ankan' ? '选择暗杠的牌' : '选择加杠的牌'}
          description="确认后将翻开新的宝牌指示牌，并从岭上摸牌。"
          tiles={choiceTiles.tiles}
          onConfirm={handleChoiceConfirm}
          onCancel={() => setChoiceTiles(null)}
        />
      )}

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      {toast && (
        <div className={`toast toast--${toast.tone}`} role="status">
          <span className="toast-mark">!</span>
          {toast.text}
        </div>
      )}
    </>
  );
}
