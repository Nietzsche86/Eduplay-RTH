import {
  BOSS_CONFIGS,
  HERO_CLASSES,
  HERO_CLASS_IDS,
  RAID_LEVELS,
  applyBossUltimateDamage,
  computeBreakTarget,
  computeComboFeverGain,
  computeScaledBossHp,
  computeTeamComposition,
  computeWrongAnswerCounterDamage,
  formatStandardResults,
  isBossEnraged,
  isBossLastStand,
  normalizeBossType,
  normalizeHeroClass,
  normalizeRaidLevel,
  resolveHeroSkill,
  resolveSupportAction,
} from './bossRaidRules.js';

const HERO_SELECT_DURATION_SEC = 15;
const ULTIMATE_INTERVAL_SEC = 25;
const BREAK_WINDOW_SEC = 10;
const BOSS_STUN_DURATION_MS = 7000;
const CASTLE_MAX_HP = 500;
const CASTLE_MAX_SHIELD = 300;
const FINISH_CELEBRATION_DELAY_MS = 3800;
const MEGA_BEAM_QTE_DURATION_MS = 3800;
const PHASE_GATE_CUTSCENE_MS = 2600;
const BREAK_CUTSCENE_MS = 2000;

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
    const raidLevel = normalizeRaidLevel(settings.raidLevel);
    const levelCfg = RAID_LEVELS[raidLevel];
    const bossMaxHp = computeScaledBossHp({
      playerCount,
      raidLevel,
      durationSec,
      manualBossHp: Number(settings.bossMaxHp) || 0,
    });
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
      raidLevel,
      raidLevelLabel: levelCfg.label,
      heroSelectEndsAt: now + HERO_SELECT_DURATION_SEC * 1000,
      bossType,
      bossName: bossCfg.name,
      bossSubtitle: bossCfg.subtitle,
      bossUltimateName: bossCfg.ultimateName,
      bossTraitName: bossCfg.traitName,
      bossMaxHp,
      bossHp: bossMaxHp,
      bossEnraged: false,
      bossLastStand: false,
      bossStunnedUntil: 0,
      bossInvulnerableUntil: 0,
      // Boss traits & Level 3 mechanics
      castleBurningUntil: 0, // Inferno Dragon Burn
      bossArmorUntil: 0, // Titan Golem Stone Armor
      lastSoulDrainAt: 0, // Dark Overlord capped Soul Drain
      healerBuffUntil: 0, // Tabib Team Spirit (+15% team damage for 8s)
      knightWardUntil: 0, // Ksatria Bastion Ward (-25% boss damage for 6s)
      nextTraitAt: 0,
      minions: [], // { id, name, hp, maxHp }
      minionsSpawned: false,
      classSync: null, // { classes: HeroClassId[], label: string, endsAt: number }
      nextClassSyncAt: 0,
      // Synchronized "LOOK AT PROJECTOR" cinematic moments
      cinematic: null, // { id, kind: 'enraged'|'mega_beam'|'boss_break', title, subtitle, endsAt, tapCount, targetTaps, pendingDamage }
      // Castle stats
      castleMaxHp: CASTLE_MAX_HP,
      castleHp: CASTLE_MAX_HP,
      castleMaxShield: CASTLE_MAX_SHIELD,
      castleShield: 60,
      comboFever: 0,
      classStreak: 0,
      durationSec,
      battleEndsAt: 0,
      ultimateStatus: 'idle', // 'idle' | 'charging'
      nextUltimateAt: 0,
      chargeEndsAt: 0,
      breakProgress: 0,
      breakTarget: computeBreakTarget(playerCount, raidLevel),
      eventSeq: 0,
      events: [],
      teamToast: null, // { id, message, tone: 'heal'|'shield'|'break'|'warn'|'sync' }
      battleLog: [
        `${bossCfg.name} (${levelCfg.label}) muncul! Pilih kelas Hero Pixel-mu!`,
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
      if (state.events.length > 32) {
        state.events = state.events.slice(-26);
      }
      if (evt.text) {
        state.battleLog.unshift(evt.text);
        if (state.battleLog.length > 8) {
          state.battleLog = state.battleLog.slice(0, 8);
        }
      }
      return item;
    }

    function setTeamToast(message, tone = 'heal') {
      state.teamToast = { id: Date.now() + Math.random(), message, tone };
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
      state.cinematic = null;
      state.minions = [];

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

    function checkPhaseTransitions() {
      const t = Date.now();
      // Phase 2 ENRAGED transition at < 50% HP
      if (!state.bossEnraged && isBossEnraged(state.bossHp, state.bossMaxHp)) {
        state.bossEnraged = true;
        if (levelCfg.enablePhaseGate) {
          // Clamp Boss HP at 49% for 2.6s cinematic Phase Gate so 30 students don't skip Phase 2!
          const gateFloor = Math.max(1, Math.floor(state.bossMaxHp * 0.49));
          if (state.bossHp < gateFloor) {
            state.bossHp = gateFloor;
          }
          state.bossInvulnerableUntil = t + PHASE_GATE_CUTSCENE_MS;
          state.cinematic = {
            id: t,
            kind: 'enraged',
            title: `FASE 2: ${state.bossName.toUpperCase()} ENRAGED!`,
            subtitle: 'LIHAT PROYEKTOR! Boss mengaum & memasuki mode ganas!',
            endsAt: t + PHASE_GATE_CUTSCENE_MS,
            tapCount: 0,
            targetTaps: 0,
            pendingDamage: 0,
          };
        }

        // Level 3 Epik spawns 2 Pixel Minions in Phase 2
        if (levelCfg.enableMinions && !state.minionsSpawned) {
          state.minionsSpawned = true;
          const minionHp = Math.max(120, Math.round(state.bossMaxHp * 0.1));
          state.minions = [
            { id: 'm1', name: `${bossCfg.minionName} A`, hp: minionHp, maxHp: minionHp },
            { id: 'm2', name: `${bossCfg.minionName} B`, hp: minionHp, maxHp: minionHp },
          ];
          setTeamToast(`${state.bossName} memanggil 2 ${bossCfg.minionName}!`, 'warn');
        }

        pushEvent({
          type: 'boss_enraged',
          text: `FASE 2! ${state.bossName} memasuki MODE ENRAGED!`,
        });
      }

      // Level 3 Last Stand climax (< 15% HP)
      if (
        levelCfg.enableLastStand &&
        !state.bossLastStand &&
        isBossLastStand(state.bossHp, state.bossMaxHp)
      ) {
        state.bossLastStand = true;
        state.ultimateStatus = 'charging';
        state.chargeEndsAt = t + 12000;
        state.breakProgress = 0;
        state.breakTarget = computeBreakTarget(getConnectedCount(), raidLevel);
        setTeamToast('LAST STAND! HP Boss <15% — habisi sekarang!', 'warn');
        pushEvent({
          type: 'boss_charge_start',
          text: `LAST STAND! ${state.bossName} menyiapkan jurus penghabisan!`,
        });
      }
    }

    function resolveMegaBeamFinish() {
      if (!state.cinematic || state.cinematic.kind !== 'mega_beam') return;
      const cin = state.cinematic;
      state.cinematic = null;

      const tapBonusFactor = 1 + Math.min(0.45, cin.tapCount / Math.max(12, getConnectedCount() * 5));
      const finalDamage = Math.round(cin.pendingDamage * tapBonusFactor);
      state.bossHp = Math.max(0, state.bossHp - finalDamage);

      // Mega Beam also wipes active minions!
      if (state.minions.length > 0) {
        state.minions = [];
      }

      for (const st of state.playerStats.values()) {
        if (st.correctCount > 0) {
          st.score += 130;
        }
      }

      pushEvent({
        type: 'mega_beam',
        damage: finalDamage,
        tapCount: cin.tapCount,
        text: `MEGA PIXEL BEAM (${cin.tapCount}x BOOST) MENGHANTAM ${state.bossName} -${finalDamage} HP!`,
      });
      setTeamToast(`MEGA PIXEL BEAM! -${finalDamage} HP ke Boss!`, 'sync');

      checkPhaseTransitions();
      if (state.bossHp <= 0) {
        triggerOutcome(
          'victory',
          `KEMENANGAN EPIK! MEGA PIXEL BEAM menghancurkan ${state.bossName}!`
        );
      } else {
        emitPublicState();
      }
    }

    function beginBattlePhase() {
      if (state.phase !== 'hero_select') return;
      const startNow = Date.now();
      state.phase = 'battle';
      state.battleEndsAt = startNow + state.durationSec * 1000;
      state.ultimateStatus = 'idle';
      state.nextUltimateAt = startNow + ULTIMATE_INTERVAL_SEC * 1000;
      state.nextTraitAt = startNow + 14000;
      state.nextClassSyncAt = startNow + 18000;
      state.breakProgress = 0;
      state.breakTarget = computeBreakTarget(getConnectedCount(), raidLevel);

      for (const st of state.playerStats.values()) {
        if (!st.selectedHero) {
          st.selectedHero = true;
        }
      }

      pushEvent({
        type: 'battle_start',
        text: `PERTEMPURAN DIMULAI! Lawan ${state.bossName} (${state.bossMaxHp} HP)!`,
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

      const activeClassSync =
        state.classSync && t < state.classSync.endsAt
          ? {
              classes: state.classSync.classes,
              label: state.classSync.label,
              remainingSec: Math.max(1, Math.ceil((state.classSync.endsAt - t) / 1000)),
            }
          : null;

      const activeCinematic =
        state.cinematic && t < state.cinematic.endsAt
          ? {
              id: state.cinematic.id,
              kind: state.cinematic.kind,
              title: state.cinematic.title,
              subtitle: state.cinematic.subtitle,
              remainingMs: Math.max(0, state.cinematic.endsAt - t),
              tapCount: state.cinematic.tapCount,
            }
          : null;

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

      const heroicSpiritActive = state.castleHp / state.castleMaxHp < 0.3;
      const teamComposition = computeTeamComposition(state.playerStats.values());

      broadcastGameState({
        gameId: 'boss-raid',
        phase: state.phase,
        raidLevel: state.raidLevel,
        raidLevelLabel: state.raidLevelLabel,
        heroSelectRemainingSec,
        bossType: state.bossType,
        bossName: state.bossName,
        bossSubtitle: state.bossSubtitle,
        bossUltimateName: state.bossUltimateName,
        bossTraitName: state.bossTraitName,
        bossHp: state.bossHp,
        bossMaxHp: state.bossMaxHp,
        bossEnraged: state.bossEnraged,
        bossLastStand: state.bossLastStand,
        bossStunned: t < state.bossStunnedUntil,
        bossStunnedRemainingSec,
        bossArmorActive: t < state.bossArmorUntil,
        castleBurning: t < state.castleBurningUntil,
        heroicSpiritActive,
        teamSpiritActive: t < state.healerBuffUntil,
        knightWardActive: t < state.knightWardUntil,
        teamComposition,
        minions: state.minions,
        classSync: activeClassSync,
        cinematic: activeCinematic,
        teamToast: state.teamToast,
        castleHp: state.castleHp,
        castleMaxHp: state.castleMaxHp,
        castleShield: state.castleShield,
        castleMaxShield: state.castleMaxShield,
        comboFever: Math.round(state.comboFever),
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
        events: state.events.slice(-18),
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
    state.setTeamToast = setTeamToast;
    state.checkPhaseTransitions = checkPhaseTransitions;
    state.resolveMegaBeamFinish = resolveMegaBeamFinish;
    state.triggerOutcome = triggerOutcome;
    state.getConnectedCount = getConnectedCount;
    state.levelCfg = levelCfg;
    state.bossCfg = bossCfg;

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
        // Complete active synchronized cinematic when timer ends
        if (state.cinematic && tickNow >= state.cinematic.endsAt) {
          if (state.cinematic.kind === 'mega_beam') {
            resolveMegaBeamFinish();
            return;
          }
          state.cinematic = null;
        }

        // Time up check
        if (tickNow >= state.battleEndsAt) {
          triggerOutcome(
            'defeat',
            `Waktu habis! ${state.bossName} masih tersisa ${state.bossHp} HP.`
          );
          return;
        }

        // Periodic Burn damage (Inferno Dragon trait in Lv. 2+)
        if (tickNow < state.castleBurningUntil) {
          const burnTick = applyBossUltimateDamage({
            rawDamage: 6,
            castleHp: state.castleHp,
            castleShield: state.castleShield,
          });
          state.castleHp = burnTick.nextHp;
          state.castleShield = burnTick.nextShield;
          if (state.castleHp <= 0) {
            triggerOutcome('defeat', 'Benteng hangus oleh Bara Api Naga!');
            return;
          }
        }

        // Active Minions nibble Castle lightly every tick in Lv. 3
        if (state.minions.length > 0 && !state.cinematic) {
          const nibble = state.minions.length * 4;
          const res = applyBossUltimateDamage({
            rawDamage: nibble,
            castleHp: state.castleHp,
            castleShield: state.castleShield,
          });
          state.castleHp = res.nextHp;
          state.castleShield = res.nextShield;
          if (state.castleHp <= 0) {
            triggerOutcome('defeat', 'Minion berhasil menjebol gerbang Benteng!');
            return;
          }
        }

        // Periodic Boss Unique Trait activation (Lv. 2+)
        if (
          levelCfg.enableBossTrait &&
          !state.cinematic &&
          tickNow >= state.nextTraitAt &&
          tickNow >= state.bossStunnedUntil
        ) {
          state.nextTraitAt = tickNow + 20000;
          if (state.bossType === 'inferno-dragon') {
            state.castleBurningUntil = tickNow + 8000;
            setTeamToast('Naga Api membakar Benteng! Tabib, pakai HEAL untuk memadamkan!', 'warn');
            pushEvent({
              type: 'boss_trait',
              trait: 'burn',
              text: 'BARA API! Benteng terbakar — padamkan dengan jurus HEAL!',
            });
          } else if (state.bossType === 'titan-golem') {
            state.bossArmorUntil = tickNow + 10000;
            setTeamToast('Titan Golem mengaktifkan ARMOR BATU (40% kebal)!', 'warn');
            pushEvent({
              type: 'boss_trait',
              trait: 'armor',
              text: 'ARMOR BATU! Titan Golem menahan 40% damage selama 10 detik!',
            });
          }
        }

        // Periodic Class-Sync 2x Callout (Lv. 3 Epik)
        if (levelCfg.enableClassSync && !state.cinematic && tickNow >= state.nextClassSyncAt) {
          state.nextClassSyncAt = tickNow + 22000;
          const pairs = [
            { classes: ['mage', 'archer'], label: 'PENYIHIR & PEMANAH DAMAGE 2X!' },
            { classes: ['knight', 'rogue'], label: 'KSATRIA & NINJA DAMAGE 2X!' },
            { classes: ['healer', 'mage'], label: 'TABIB & PENYIHIR DAMAGE 2X!' },
          ];
          const pick = pairs[Math.floor(Math.random() * pairs.length)];
          state.classSync = {
            ...pick,
            endsAt: tickNow + 12000,
          };
          setTeamToast(`PANGGILAN KELAS: ${pick.label}`, 'sync');
          pushEvent({
            type: 'class_sync',
            text: `PANGGILAN KELAS! ${pick.label}`,
          });
        }

        // Boss Ultimate Break Phase lifecycle
        if (!state.cinematic) {
          if (state.ultimateStatus === 'idle') {
            if (tickNow >= state.nextUltimateAt && tickNow >= state.bossStunnedUntil) {
              state.ultimateStatus = 'charging';
              state.chargeEndsAt = tickNow + BREAK_WINDOW_SEC * 1000;
              state.breakProgress = 0;
              state.breakTarget = computeBreakTarget(getConnectedCount(), raidLevel);
              pushEvent({
                type: 'boss_charge_start',
                text: `BAHAYA! ${state.bossName} mengisi ${state.bossUltimateName}! Jawab ${state.breakTarget} soal untuk BREAK!`,
              });
            }
          } else if (state.ultimateStatus === 'charging') {
            if (tickNow >= state.chargeEndsAt) {
              state.ultimateStatus = 'idle';
              state.nextUltimateAt = tickNow + ULTIMATE_INTERVAL_SEC * 1000;
              const ratio = state.bossEnraged
                ? levelCfg.enragedUltRatio
                : levelCfg.ultDamageRatio;
              const rawUltDamage = Math.round(state.castleMaxHp * ratio);
              const result = applyBossUltimateDamage({
                rawDamage: rawUltDamage,
                castleHp: state.castleHp,
                castleShield: state.castleShield,
                hasKnightWard: tickNow < state.knightWardUntil,
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
                }${result.wardMitigated > 0 ? ` (Ward -${result.wardMitigated})` : ''}!`,
              });

              if (state.castleHp <= 0) {
                triggerOutcome('defeat', `Benteng hancur oleh ${state.bossUltimateName}!`);
                return;
              }
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

    // 2. QTE Tap Boost during MEGA PIXEL BEAM cinematic!
    if (action?.type === 'beam_tap') {
      if (state.cinematic && state.cinematic.kind === 'mega_beam') {
        state.cinematic.tapCount += 1;
        stats.score += 8;
        state.pushEvent({
          type: 'beam_tap',
          playerId: player.playerId,
          heroClass: stats.heroClass,
          tapCount: state.cinematic.tapCount,
        });
        state.emitPublicState();
      }
      return;
    }

    // 3. Submit Multiple Choice Answer
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
      qState.cursor += 1;
      if (qState.cursor % qState.list.length === 0) {
        qState.list = shuffleArray(state.baseQuestions);
      }

      const now = Date.now();

      if (isCorrect) {
        stats.correctCount += 1;
        stats.streak += 1;
        stats.energy = Math.min(3, stats.energy + 1);
        stats.lastDifficulty = currentQ.difficulty || 'Sedang';
        stats.score += 35;
        state.classStreak += 1;

        stats.lastFeedback = {
          id: now,
          isCorrect: true,
          kind: 'answer_correct',
          message: 'Benar! +1 Energi Aksi — pilih jurusmu!',
        };

        // Check Break Phase progress (Archer contributes 2x Break!)
        if (state.ultimateStatus === 'charging') {
          const heroCfg = HERO_CLASSES[normalizeHeroClass(stats.heroClass)];
          const breakStep = heroCfg?.breakContribution || 1;
          state.breakProgress += breakStep;
          if (state.breakProgress >= state.breakTarget) {
            state.ultimateStatus = 'idle';
            state.bossStunnedUntil = now + BOSS_STUN_DURATION_MS;
            state.bossArmorUntil = 0; // Breaking shatters Stone Armor too!
            state.nextUltimateAt = now + ULTIMATE_INTERVAL_SEC * 1000;
            const breakBonusDmg = Math.max(75, Math.round(state.bossMaxHp * 0.05));
            state.bossHp = Math.max(0, state.bossHp - breakBonusDmg);
            stats.score += 120;
            stats.damageDealt += breakBonusDmg;

            state.cinematic = {
              id: now,
              kind: 'boss_break',
              title: 'BOSS BREAK!! STUNNED!',
              subtitle: `LIHAT PROYEKTOR! ${state.bossName} terpental & kena -${breakBonusDmg} HP!`,
              endsAt: now + BREAK_CUTSCENE_MS,
              tapCount: 0,
              targetTaps: 0,
              pendingDamage: 0,
            };
            state.setTeamToast(`BREAK BERHASIL! ${state.bossName} STUNNED 7 detik!`, 'break');

            state.pushEvent({
              type: 'boss_break',
              playerId: player.playerId,
              playerName: player.name,
              heroClass: stats.heroClass,
              damage: breakBonusDmg,
              text: `BREAK BERHASIL! ${state.bossName} STUNNED & kena -${breakBonusDmg} HP!`,
            });
            state.checkPhaseTransitions();
          }
        }

        // Charge Combo Fever Meter proportionally to class size (Rogue 1.6x, Full Formation +10%, Comeback 1.5x!)
        if (state.bossHp > 0 && !state.cinematic) {
          const comp = computeTeamComposition(state.playerStats.values());
          const feverGain = computeComboFeverGain(
            state.getConnectedCount(),
            state.castleHp,
            state.castleMaxHp,
            {
              heroClass: stats.heroClass,
              hasFullFormation: comp.hasFullFormation,
            }
          );
          state.comboFever = Math.min(100, state.comboFever + feverGain);

          if (state.comboFever >= 100) {
            state.comboFever = 0;
            const baseMegaDmg = Math.max(140, Math.round(state.bossMaxHp * 0.095));
            state.cinematic = {
              id: now,
              kind: 'mega_beam',
              title: 'MEGA PIXEL BEAM 100%!',
              subtitle: 'LIHAT PROYEKTOR & TAP CEPAT UNTUK BOOST LASER!',
              endsAt: now + MEGA_BEAM_QTE_DURATION_MS,
              tapCount: 0,
              targetTaps: Math.max(10, state.getConnectedCount() * 4),
              pendingDamage: baseMegaDmg,
            };
            state.pushEvent({
              type: 'mega_beam_charge',
              text: 'COMBO FEVER 100%! Semua Hero mengisi MEGA PIXEL BEAM! TAP CEPAT!',
            });
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

        // Level-scaled gentle fever penalty (anti-spam without punishing classmates unfairly)
        if (state.levelCfg.wrongFeverPenalty > 0) {
          state.comboFever = Math.max(0, state.comboFever - state.levelCfg.wrongFeverPenalty);
        }

        // Dark Overlord capped Soul Drain (max once per 5 seconds, 1.5% HP cap!)
        if (
          state.levelCfg.enableBossTrait &&
          state.bossType === 'dark-overlord' &&
          now - state.lastSoulDrainAt >= 5000 &&
          state.bossHp > 0 &&
          state.bossHp < state.bossMaxHp
        ) {
          state.lastSoulDrainAt = now;
          const drainHeal = Math.max(20, Math.round(state.bossMaxHp * 0.015));
          state.bossHp = Math.min(state.bossMaxHp, state.bossHp + drainHeal);
          state.pushEvent({
            type: 'boss_trait',
            trait: 'drain',
            amount: drainHeal,
            text: `SOUL DRAIN! Raja Kegelapan menyerap +${drainHeal} HP dari jawaban salah!`,
          });
        }

        const counterDmg = computeWrongAnswerCounterDamage({
          connectedPlayerCount: state.getConnectedCount(),
          isEnraged: state.bossEnraged,
          hasKnightWard: now < state.knightWardUntil,
        });
        const dmgRes = applyBossUltimateDamage({
          rawDamage: counterDmg,
          castleHp: state.castleHp,
          castleShield: state.castleShield,
        });
        state.castleHp = dmgRes.nextHp;
        state.castleShield = dmgRes.nextShield;

        stats.lastFeedback = {
          id: now,
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

    // 4. Use Action Energy -> Primary Hero Skill / Heal Castle / Shield Castle
    if (action?.type === 'use_skill') {
      if (stats.energy <= 0) return;
      const skillType = action.skillType;
      if (!['primary', 'heal', 'shield'].includes(skillType)) return;

      stats.energy -= 1;
      const now = Date.now();

      if (skillType === 'primary') {
        const isStunned = now < state.bossStunnedUntil;
        const isInvuln = now < state.bossInvulnerableUntil;
        const isClassSynced = Boolean(
          state.classSync &&
            now < state.classSync.endsAt &&
            state.classSync.classes.includes(stats.heroClass)
        );
        const bossHasStoneArmor = now < state.bossArmorUntil;
        const hasActiveMinions = state.minions.length > 0;

        const res = resolveHeroSkill({
          heroClass: stats.heroClass,
          difficulty: stats.lastDifficulty,
          streak: stats.streak,
          isBossStunned: isStunned,
          isClassSynced,
          bossHasStoneArmor,
          hasActiveMinions,
          hasTeamSpiritBuff: now < state.healerBuffUntil,
        });

        let minionDefeatedName = null;
        if (hasActiveMinions) {
          // Attacks cleave active Minion (Mage deals extra minion damage!) while dealing chip damage to Boss
          const targetMinion = state.minions[0];
          targetMinion.hp = Math.max(0, targetMinion.hp - res.minionDamage);
          if (targetMinion.hp <= 0) {
            minionDefeatedName = targetMinion.name;
            state.minions.shift();
          }
        }

        const effectiveBossDmg = isInvuln ? 0 : res.totalDamage;
        state.bossHp = Math.max(0, state.bossHp - effectiveBossDmg);
        stats.damageDealt += res.totalDamage;
        stats.score += res.points;

        if (res.bonusShield > 0) {
          state.castleShield = Math.min(state.castleMaxShield, state.castleShield + res.bonusShield);
          stats.shieldDone += res.bonusShield;
        }
        if (res.bonusHeal > 0) {
          state.castleHp = Math.min(state.castleMaxHp, state.castleHp + res.bonusHeal);
          stats.healDone += res.bonusHeal;
          state.castleBurningUntil = 0; // Healer cleanses Burn!
        }

        const critText = res.isCritical ? ' CRITICAL!' : '';
        const syncText = res.isClassSynced ? ' [2X SYNC!]' : '';
        const pierceText = res.piercedArmor ? ' [TEMBUS ARMOR!]' : '';
        const minionNote = minionDefeatedName ? ` (${minionDefeatedName} K.O.!)` : '';

        stats.lastFeedback = {
          id: now,
          isCorrect: true,
          kind: 'skill_attack',
          damage: res.totalDamage,
          isCritical: res.isCritical,
          heroClass: stats.heroClass,
          skillName: res.skillName,
          message: `${res.skillName}: -${res.totalDamage} HP${critText}${pierceText}${syncText}${minionNote}`,
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
          isClassSynced: res.isClassSynced,
          bonusShield: res.bonusShield,
          bonusHeal: res.bonusHeal,
          minionDefeated: minionDefeatedName,
          text: `${player.name} (${HERO_CLASSES[stats.heroClass].name}) melancarkan ${res.skillName}: -${res.totalDamage} HP${critText}${pierceText}${minionNote}`,
        });

        state.checkPhaseTransitions();

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
          streak: stats.streak,
        });
        const wasBurning = now < state.castleBurningUntil;
        state.castleBurningUntil = 0;
        state.castleHp = res.nextHp;
        state.castleShield = res.nextShield;
        if (res.grantsTeamSpirit) {
          state.healerBuffUntil = now + 8000;
        }
        stats.healDone += res.amount;
        stats.score += res.points;

        const overhealNote = res.overhealShield > 0 ? ` +${res.overhealShield} Perisai!` : '';
        const buffNote = res.grantsTeamSpirit ? ' + Buff Tim 15%!' : '';

        stats.lastFeedback = {
          id: now,
          isCorrect: true,
          kind: 'skill_heal',
          amount: res.amount,
          message: `Benteng +${res.amount} HP${wasBurning ? ' & Api Padam' : ''}${overhealNote}${buffNote}`,
        };

        state.setTeamToast(
          `${player.name} memulihkan +${res.amount} HP${overhealNote}${
            res.grantsTeamSpirit ? ' · BUFF DAMAGE TIM +15%!' : ''
          }`,
          'heal'
        );

        state.pushEvent({
          type: 'hero_heal',
          playerId: player.playerId,
          playerName: player.name,
          heroClass: stats.heroClass,
          healAmount: res.amount,
          isBoosted: res.isBoosted,
          cleansedBurn: wasBurning,
          text: `${player.name} memulihkan Benteng +${res.amount} HP${wasBurning ? ' (Burn Padam!)' : ''}${buffNote}`,
        });
      } else if (skillType === 'shield') {
        const res = resolveSupportAction({
          actionType: 'shield',
          heroClass: stats.heroClass,
          castleHp: state.castleHp,
          castleMaxHp: state.castleMaxHp,
          castleShield: state.castleShield,
          castleMaxShield: state.castleMaxShield,
          streak: stats.streak,
        });
        state.castleShield = res.nextShield;
        if (res.grantsKnightWard) {
          state.knightWardUntil = now + 6000;
        }
        stats.shieldDone += res.amount;
        stats.score += res.points;

        const wardNote = res.grantsKnightWard ? ' · Benteng Kebal 25%!' : '';

        stats.lastFeedback = {
          id: now,
          isCorrect: true,
          kind: 'skill_shield',
          amount: res.amount,
          message: `Perisai Benteng +${res.amount}${wardNote}`,
        };

        state.setTeamToast(`${player.name} memasang Perisai +${res.amount}${wardNote}`, 'shield');

        state.pushEvent({
          type: 'hero_shield',
          playerId: player.playerId,
          playerName: player.name,
          heroClass: stats.heroClass,
          shieldAmount: res.amount,
          isBoosted: res.isBoosted,
          text: `${player.name} memperkuat Perisai Benteng +${res.amount}${wardNote}`,
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
