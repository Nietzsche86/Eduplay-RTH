import {
  BOSS_CONFIGS,
  HERO_CLASSES,
  HERO_CLASS_IDS,
  applyBossUltimateDamage,
  computeBreakTarget,
  computeComboFeverGain,
  formatStandardResults,
  isBossEnraged,
  normalizeBossType,
  normalizeHeroClass,
  resolveHeroSkill,
  resolveSupportAction,
} from './bossRaidRules.js';

const HERO_SELECT_DURATION_SEC = 15;
const ULTIMATE_INTERVAL_SEC = 25;
const BREAK_WINDOW_SEC = 10;
const BOSS_STUN_DURATION_MS = 7000;
const CASTLE_MAX_HP = 500;
const CASTLE_MAX_SHIELD = 300;
const FINISH_CELEBRATION_DELAY_MS = 2800;

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const bossRaidHandler = {
  id: 'boss-raid',

  init(ctx) {
    const { room, questions, settings, broadcastGameState, finishGame } = ctx;
    const baseQuestions = settings.shuffleQuestions ? shuffleArray(questions) : [...questions];
    const durationSec = Math.max(30, Math.min(300, Number(settings.gameDuration) || 120));
    const playerCount = Math.max(1, room.players.length);
    const bossMaxHp = Math.max(
      400,
      Number(settings.bossMaxHp) || Math.max(1000, playerCount * 550)
    );
    const bossType = normalizeBossType(settings.bossType);
    const bossCfg = BOSS_CONFIGS[bossType];

    const playerStats = new Map();
    const playerQueues = new Map();

    room.players.forEach((p, idx) => {
      playerStats.set(p.playerId, {
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar,
        heroClass: HERO_CLASS_IDS[idx % HERO_CLASS_IDS.length],
        selectedHero: false,
        score: 0,
        damageDealt: 0,
        healDone: 0,
        shieldDone: 0,
        correctCount: 0,
        wrongCount: 0,
        streak: 0,
        energy: 0,
        lastDifficulty: 'Sedang',
        lastFeedback: null,
      });
      playerQueues.set(p.playerId, {
        list: shuffleArray(baseQuestions),
        cursor: 0,
      });
    });

    const now = Date.now();
    const state = {
      phase: 'hero_select', // 'hero_select' | 'battle' | 'victory' | 'defeat'
      heroSelectEndsAt: now + HERO_SELECT_DURATION_SEC * 1000,
      bossType,
      bossName: bossCfg.name,
      bossSubtitle: bossCfg.subtitle,
      bossUltimateName: bossCfg.ultimateName,
      bossMaxHp,
      bossHp: bossMaxHp,
      bossEnraged: false,
      bossStunnedUntil: 0,
      castleMaxHp: CASTLE_MAX_HP,
      castleHp: CASTLE_MAX_HP,
      castleMaxShield: CASTLE_MAX_SHIELD,
      castleShield: 60, // Small starting defensive ward
      comboFever: 0,
      classStreak: 0,
      durationSec,
      battleEndsAt: 0,
      ultimateStatus: 'idle', // 'idle' | 'charging'
      nextUltimateAt: 0,
      chargeEndsAt: 0,
      breakProgress: 0,
      breakTarget: computeBreakTarget(playerCount),
      eventSeq: 0,
      events: [],
      battleLog: [
        `${bossCfg.name} muncul di gerbang benteng! Pilih kelas Hero Pixel-mu!`,
      ],
      playerStats,
      playerQueues,
      baseQuestions,
      tickTimer: null,
      finishTimeout: null,
      finished: false,
    };

    room._gameInternal = state;

    function pushEvent(evt) {
      state.eventSeq += 1;
      const item = {
        seq: state.eventSeq,
        timestamp: Date.now(),
        ...evt,
      };
      state.events.push(item);
      if (state.events.length > 28) {
        state.events = state.events.slice(-24);
      }
      if (evt.text) {
        state.battleLog.unshift(evt.text);
        if (state.battleLog.length > 8) {
          state.battleLog = state.battleLog.slice(0, 8);
        }
      }
      return item;
    }

    function getConnectedCount() {
      const connected = room.players.filter((p) => p.connected).length;
      return Math.max(1, connected);
    }

    function getCurrentQuestionForPlayer(playerId) {
      const qState = state.playerQueues.get(playerId);
      if (!qState || qState.list.length === 0) return null;
      const q = qState.list[qState.cursor % qState.list.length];
      return {
        id: `${q.id}-${qState.cursor}`,
        questionId: q.id,
        text: q.text,
        options: q.options,
        difficulty: q.difficulty,
        number: qState.cursor + 1,
      };
    }

    function clearTimers() {
      if (state.tickTimer) {
        clearInterval(state.tickTimer);
        state.tickTimer = null;
      }
      if (state.finishTimeout) {
        clearTimeout(state.finishTimeout);
        state.finishTimeout = null;
      }
    }

    function finalizeToPodium() {
      if (state.finished) return;
      state.finished = true;
      clearTimers();
      finishGame(formatStandardResults(state.playerStats.values()));
    }

    function triggerOutcome(outcome, reasonText) {
      if (state.phase === 'victory' || state.phase === 'defeat' || state.finished) return;
      state.phase = outcome;
      state.ultimateStatus = 'idle';

      if (outcome === 'victory') {
        for (const st of state.playerStats.values()) {
          if (st.correctCount > 0) {
            st.score += 300;
          }
        }
        pushEvent({
          type: 'victory',
          text: reasonText || `KEMENANGAN! ${state.bossName} hancur berkeping-keping!`,
        });
      } else {
        pushEvent({
          type: 'defeat',
          text: reasonText || `Benteng runtuh! ${state.bossName} berhasil bertahan.`,
        });
      }

      emitPublicState();
      state.finishTimeout = setTimeout(() => {
        finalizeToPodium();
      }, FINISH_CELEBRATION_DELAY_MS);
    }

    function checkEnragedTransition() {
      if (!state.bossEnraged && isBossEnraged(state.bossHp, state.bossMaxHp)) {
        state.bossEnraged = true;
        pushEvent({
          type: 'boss_enraged',
          text: `FASE 2! ${state.bossName} memasuki MODE ENRAGED!`,
        });
      }
    }

    function beginBattlePhase() {
      if (state.phase !== 'hero_select') return;
      const startNow = Date.now();
      state.phase = 'battle';
      state.battleEndsAt = startNow + state.durationSec * 1000;
      state.ultimateStatus = 'idle';
      state.nextUltimateAt = startNow + ULTIMATE_INTERVAL_SEC * 1000;
      state.breakProgress = 0;
      state.breakTarget = computeBreakTarget(getConnectedCount());

      // Lock in default hero classes for anyone who didn't tap in time
      for (const st of state.playerStats.values()) {
        if (!st.selectedHero) {
          st.selectedHero = true;
        }
      }

      pushEvent({
        type: 'battle_start',
        text: `PERTEMPURAN DIMULAI! Serang ${state.bossName} dan lindungi Benteng!`,
      });
      emitPublicState();
    }

    function emitPublicState() {
      const t = Date.now();
      const heroSelectRemainingSec =
        state.phase === 'hero_select'
          ? Math.max(0, Math.ceil((state.heroSelectEndsAt - t) / 1000))
          : 0;
      const remainingSec =
        state.phase === 'battle'
          ? Math.max(0, Math.ceil((state.battleEndsAt - t) / 1000))
          : state.phase === 'hero_select'
            ? state.durationSec
            : 0;

      const bossStunnedRemainingSec = Math.max(0, Math.ceil((state.bossStunnedUntil - t) / 1000));
      const nextUltimateInSec =
        state.phase === 'battle' && state.ultimateStatus === 'idle'
          ? Math.max(0, Math.ceil((state.nextUltimateAt - t) / 1000))
          : 0;
      const chargeRemainingSec =
        state.phase === 'battle' && state.ultimateStatus === 'charging'
          ? Math.max(0, Math.ceil((state.chargeEndsAt - t) / 1000))
          : 0;

      const heroes = Array.from(state.playerStats.values()).map((s) => ({
        playerId: s.playerId,
        name: s.name,
        avatar: s.avatar,
        heroClass: s.heroClass,
        selectedHero: s.selectedHero,
        score: s.score,
        damageDealt: s.damageDealt,
        healDone: s.healDone,
        shieldDone: s.shieldDone,
        correctCount: s.correctCount,
        wrongCount: s.wrongCount,
        streak: s.streak,
        energy: s.energy,
      }));

      const leaderboard = [...heroes]
        .sort((a, b) => b.score - a.score || b.damageDealt - a.damageDealt)
        .slice(0, 6);

      const playerQuestions = {};
      const playerFeedback = {};
      for (const [pid, st] of state.playerStats.entries()) {
        playerQuestions[pid] = getCurrentQuestionForPlayer(pid);
        playerFeedback[pid] = st.lastFeedback;
      }

      broadcastGameState({
        gameId: 'boss-raid',
        phase: state.phase,
        heroSelectRemainingSec,
        bossType: state.bossType,
        bossName: state.bossName,
        bossSubtitle: state.bossSubtitle,
        bossUltimateName: state.bossUltimateName,
        bossHp: state.bossHp,
        bossMaxHp: state.bossMaxHp,
        bossEnraged: state.bossEnraged,
        bossStunned: t < state.bossStunnedUntil,
        bossStunnedRemainingSec,
        castleHp: state.castleHp,
        castleMaxHp: state.castleMaxHp,
        castleShield: state.castleShield,
        castleMaxShield: state.castleMaxShield,
        comboFever: state.comboFever,
        classStreak: state.classStreak,
        ultimate: {
          status: state.ultimateStatus,
          nextUltimateInSec,
          chargeRemainingSec,
          chargeDurationSec: BREAK_WINDOW_SEC,
          breakProgress: state.breakProgress,
          breakTarget: state.breakTarget,
        },
        durationSec: state.durationSec,
        remainingSec,
        heroes,
        leaderboard,
        events: state.events.slice(-16),
        battleLog: state.battleLog.slice(0, 5),
        playerQuestions,
        playerFeedback,
      });
    }

    state.emitPublicState = emitPublicState;
    state.clearTimers = clearTimers;
    state.finalizeToPodium = finalizeToPodium;
    state.beginBattlePhase = beginBattlePhase;
    state.pushEvent = pushEvent;
    state.checkEnragedTransition = checkEnragedTransition;
    state.triggerOutcome = triggerOutcome;
    state.getConnectedCount = getConnectedCount;

    if (baseQuestions.length === 0) {
      finalizeToPodium();
      return;
    }

    emitPublicState();

    state.tickTimer = setInterval(() => {
      if (state.finished) {
        clearTimers();
        return;
      }
      const tickNow = Date.now();

      if (state.phase === 'hero_select') {
        if (tickNow >= state.heroSelectEndsAt) {
          beginBattlePhase();
        } else {
          emitPublicState();
        }
        return;
      }

      if (state.phase === 'battle') {
        // Time up check
        if (tickNow >= state.battleEndsAt) {
          triggerOutcome(
            'defeat',
            `Waktu habis! ${state.bossName} masih tersisa ${state.bossHp} HP.`
          );
          return;
        }

        // Boss Ultimate Break Phase lifecycle
        if (state.ultimateStatus === 'idle') {
          if (tickNow >= state.nextUltimateAt && tickNow >= state.bossStunnedUntil) {
            state.ultimateStatus = 'charging';
            state.chargeEndsAt = tickNow + BREAK_WINDOW_SEC * 1000;
            state.breakProgress = 0;
            state.breakTarget = computeBreakTarget(getConnectedCount());
            pushEvent({
              type: 'boss_charge_start',
              text: `BAHAYA! ${state.bossName} mengisi ${state.bossUltimateName}! Jawab ${state.breakTarget} soal untuk BREAK!`,
            });
          }
        } else if (state.ultimateStatus === 'charging') {
          if (tickNow >= state.chargeEndsAt) {
            // Failed to break in time -> unleash Boss Ultimate!
            state.ultimateStatus = 'idle';
            state.nextUltimateAt = tickNow + ULTIMATE_INTERVAL_SEC * 1000;
            const rawUltDamage = Math.round(
              state.castleMaxHp * (state.bossEnraged ? 0.4 : 0.3)
            );
            const result = applyBossUltimateDamage({
              rawDamage: rawUltDamage,
              castleHp: state.castleHp,
              castleShield: state.castleShield,
            });
            state.castleHp = result.nextHp;
            state.castleShield = result.nextShield;
            state.classStreak = 0;

            pushEvent({
              type: 'boss_ultimate_hit',
              damage: rawUltDamage,
              hpDamage: result.hpDamage,
              shieldAbsorbed: result.shieldAbsorbed,
              text: `${state.bossName} melancarkan ${state.bossUltimateName}! Benteng -${result.hpDamage} HP${
                result.shieldAbsorbed > 0 ? ` (Perisai tahan ${result.shieldAbsorbed})` : ''
              }!`,
            });

            if (state.castleHp <= 0) {
              triggerOutcome('defeat', `Benteng hancur oleh ${state.bossUltimateName}!`);
              return;
            }
          }
        }

        emitPublicState();
      }
    }, 1000);
  },

  onPlayerAction(ctx, player, action) {
    const state = ctx.room._gameInternal;
    if (!state || state.finished) return;

    // Host actions
    if (!player) {
      if (action?.type === 'host:force_end') {
        state.finalizeToPodium();
      } else if (action?.type === 'host:start_battle_now') {
        state.beginBattlePhase();
      }
      return;
    }

    const stats = state.playerStats.get(player.playerId);
    if (!stats) return;

    // 1. Select Hero Class (during hero_select phase)
    if (action?.type === 'select_hero') {
      if (state.phase !== 'hero_select') return;
      const chosen = normalizeHeroClass(action.heroClass);
      stats.heroClass = chosen;
      stats.selectedHero = true;
      const cfg = HERO_CLASSES[chosen];
      state.pushEvent({
        type: 'hero_selected',
        playerId: player.playerId,
        playerName: player.name,
        heroClass: chosen,
        text: `${player.name} bergabung sebagai ${cfg.name}!`,
      });
      state.emitPublicState();
      return;
    }

    if (state.phase !== 'battle') return;

    // 2. Submit Multiple Choice Answer -> Grants +1 Action Energy & Charges Combo Fever / Break
    if (action?.type === 'submit_answer') {
      const optionIndex = Number(action.optionIndex);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return;

      const qState = state.playerQueues.get(player.playerId);
      if (!qState || qState.list.length === 0) return;

      const currentQ = qState.list[qState.cursor % qState.list.length];
      if (
        action.questionInstanceId &&
        action.questionInstanceId !== `${currentQ.id}-${qState.cursor}`
      ) {
        return;
      }

      const isCorrect = optionIndex === currentQ.correctIndex;

      // Advance question queue immediately
      qState.cursor += 1;
      if (qState.cursor % qState.list.length === 0) {
        qState.list = shuffleArray(state.baseQuestions);
      }

      if (isCorrect) {
        stats.correctCount += 1;
        stats.streak += 1;
        stats.energy = Math.min(3, stats.energy + 1);
        stats.lastDifficulty = currentQ.difficulty || 'Sedang';
        stats.score += 35;
        state.classStreak += 1;

        stats.lastFeedback = {
          id: Date.now(),
          isCorrect: true,
          kind: 'answer_correct',
          message: 'Benar! +1 Energi Aksi — pilih jurusmu!',
        };

        // Check Break Phase progress
        if (state.ultimateStatus === 'charging') {
          state.breakProgress += 1;
          if (state.breakProgress >= state.breakTarget) {
            state.ultimateStatus = 'idle';
            state.bossStunnedUntil = Date.now() + BOSS_STUN_DURATION_MS;
            state.nextUltimateAt = Date.now() + ULTIMATE_INTERVAL_SEC * 1000;
            const breakBonusDmg = Math.max(80, Math.round(state.bossMaxHp * 0.08));
            state.bossHp = Math.max(0, state.bossHp - breakBonusDmg);
            stats.score += 120;
            stats.damageDealt += breakBonusDmg;

            state.pushEvent({
              type: 'boss_break',
              playerId: player.playerId,
              playerName: player.name,
              heroClass: stats.heroClass,
              damage: breakBonusDmg,
              text: `BREAK BERHASIL! ${state.bossName} STUNNED & kena -${breakBonusDmg} HP!`,
            });
            state.checkEnragedTransition();
          }
        }

        // Charge Combo Fever Meter
        if (state.bossHp > 0) {
          const feverGain = computeComboFeverGain(state.getConnectedCount());
          state.comboFever = Math.min(100, state.comboFever + feverGain);

          if (state.comboFever >= 100) {
            state.comboFever = 0;
            const megaDmg = Math.max(140, Math.round(state.bossMaxHp * 0.14));
            state.bossHp = Math.max(0, state.bossHp - megaDmg);
            for (const st of state.playerStats.values()) {
              if (st.correctCount > 0) {
                st.score += 120;
              }
            }
            state.pushEvent({
              type: 'mega_beam',
              damage: megaDmg,
              text: `COMBO FEVER 100%! Semua Hero menembakkan MEGA PIXEL BEAM (-${megaDmg} HP)!`,
            });
            state.checkEnragedTransition();
          }
        }

        if (state.bossHp <= 0) {
          state.triggerOutcome(
            'victory',
            `KEMENANGAN! ${state.bossName} berhasil dikalahkan seluruh kelas!`
          );
          return;
        }
      } else {
        stats.wrongCount += 1;
        stats.streak = 0;
        // Minor boss counter-poke on wrong answer (absorbed by shield first)
        const counterDmg = state.bossEnraged ? 18 : 12;
        const dmgRes = applyBossUltimateDamage({
          rawDamage: counterDmg,
          castleHp: state.castleHp,
          castleShield: state.castleShield,
        });
        state.castleHp = dmgRes.nextHp;
        state.castleShield = dmgRes.nextShield;

        stats.lastFeedback = {
          id: Date.now(),
          isCorrect: false,
          kind: 'answer_wrong',
          message: `Kurang tepat! Kunci: ${currentQ.options[currentQ.correctIndex]}`,
        };

        if (state.castleHp <= 0) {
          state.triggerOutcome('defeat', `Benteng runtuh terkena serangan balasan ${state.bossName}!`);
          return;
        }
      }

      state.emitPublicState();
      return;
    }

    // 3. Use Action Energy -> Primary Hero Skill / Heal Castle / Shield Castle
    if (action?.type === 'use_skill') {
      if (stats.energy <= 0) return;
      const skillType = action.skillType;
      if (!['primary', 'heal', 'shield'].includes(skillType)) return;

      stats.energy -= 1;

      if (skillType === 'primary') {
        const isStunned = Date.now() < state.bossStunnedUntil;
        const res = resolveHeroSkill({
          heroClass: stats.heroClass,
          difficulty: stats.lastDifficulty,
          streak: stats.streak,
          isBossStunned: isStunned,
        });

        state.bossHp = Math.max(0, state.bossHp - res.totalDamage);
        stats.damageDealt += res.totalDamage;
        stats.score += res.points;

        if (res.bonusShield > 0) {
          state.castleShield = Math.min(state.castleMaxShield, state.castleShield + res.bonusShield);
          stats.shieldDone += res.bonusShield;
        }
        if (res.bonusHeal > 0) {
          state.castleHp = Math.min(state.castleMaxHp, state.castleHp + res.bonusHeal);
          stats.healDone += res.bonusHeal;
        }

        const critText = res.isCritical ? ' CRITICAL!' : '';
        const bonusNote =
          res.bonusShield > 0
            ? ` (+${res.bonusShield} Perisai)`
            : res.bonusHeal > 0
              ? ` (+${res.bonusHeal} HP)`
              : '';

        stats.lastFeedback = {
          id: Date.now(),
          isCorrect: true,
          kind: 'skill_attack',
          message: `${res.skillName}: -${res.totalDamage} HP${critText}${bonusNote}`,
        };

        state.pushEvent({
          type: 'hero_attack',
          playerId: player.playerId,
          playerName: player.name,
          heroClass: stats.heroClass,
          skillName: res.skillName,
          hits: res.hits,
          damage: res.totalDamage,
          isCritical: res.isCritical,
          bonusShield: res.bonusShield,
          bonusHeal: res.bonusHeal,
          text: `${player.name} (${HERO_CLASSES[stats.heroClass].name}) melancarkan ${res.skillName}: -${res.totalDamage} HP${critText}`,
        });

        state.checkEnragedTransition();

        if (state.bossHp <= 0) {
          state.triggerOutcome(
            'victory',
            `KEMENANGAN! ${player.name} mengakhiri ${state.bossName} dengan ${res.skillName}!`
          );
          return;
        }
      } else if (skillType === 'heal') {
        const res = resolveSupportAction({
          actionType: 'heal',
          heroClass: stats.heroClass,
          castleHp: state.castleHp,
          castleMaxHp: state.castleMaxHp,
          castleShield: state.castleShield,
          castleMaxShield: state.castleMaxShield,
        });
        state.castleHp = res.nextHp;
        stats.healDone += res.amount;
        stats.score += res.points;

        stats.lastFeedback = {
          id: Date.now(),
          isCorrect: true,
          kind: 'skill_heal',
          message: `Benteng pulih +${res.amount} HP${res.isBoosted ? ' (Bonus 2x Tabib!)' : ''}`,
        };

        state.pushEvent({
          type: 'hero_heal',
          playerId: player.playerId,
          playerName: player.name,
          heroClass: stats.heroClass,
          healAmount: res.amount,
          isBoosted: res.isBoosted,
          text: `${player.name} memulihkan Benteng +${res.amount} HP!`,
        });
      } else if (skillType === 'shield') {
        const res = resolveSupportAction({
          actionType: 'shield',
          heroClass: stats.heroClass,
          castleHp: state.castleHp,
          castleMaxHp: state.castleMaxHp,
          castleShield: state.castleShield,
          castleMaxShield: state.castleMaxShield,
        });
        state.castleShield = res.nextShield;
        stats.shieldDone += res.amount;
        stats.score += res.points;

        stats.lastFeedback = {
          id: Date.now(),
          isCorrect: true,
          kind: 'skill_shield',
          message: `Perisai Benteng +${res.amount}${res.isBoosted ? ' (Bonus Ksatria!)' : ''}`,
        };

        state.pushEvent({
          type: 'hero_shield',
          playerId: player.playerId,
          playerName: player.name,
          heroClass: stats.heroClass,
          shieldAmount: res.amount,
          isBoosted: res.isBoosted,
          text: `${player.name} memperkuat Perisai Benteng +${res.amount}!`,
        });
      }

      state.emitPublicState();
    }
  },

  onDisconnect(ctx, _player) {
    const state = ctx.room._gameInternal;
    if (state && !state.finished) {
      state.emitPublicState();
    }
  },

  cleanup(ctx) {
    const state = ctx.room._gameInternal;
    if (state) {
      state.finished = true;
      state.clearTimers();
      ctx.room._gameInternal = null;
    }
  },
};
