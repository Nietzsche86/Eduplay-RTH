function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function calcBossAttack(isCorrect, combo, difficulty) {
  if (!isCorrect) return { damage: 0, points: 0, isCritical: false };
  const baseDamage = difficulty === 'Sulit' ? 140 : difficulty === 'Sedang' ? 110 : 85;
  const comboFactor = 1 + Math.min(combo, 6) * 0.15;
  const isCritical = combo >= 3;
  const damage = Math.round(baseDamage * comboFactor * (isCritical ? 1.2 : 1));
  return { damage, points: damage * 2, isCritical };
}

export const bossRaidHandler = {
  id: 'boss-raid',

  init(ctx) {
    const { room, questions, settings, broadcastGameState, finishGame } = ctx;
    const baseQuestions = settings.shuffleQuestions ? shuffleArray(questions) : [...questions];
    const durationSec = Math.max(20, Math.min(300, Number(settings.gameDuration) || 90));
    const playerCount = Math.max(1, room.players.length);
    const bossMaxHp = Math.max(
      400,
      Number(settings.bossMaxHp) || Math.max(600, playerCount * 450)
    );

    const playerStats = new Map();
    const playerQueues = new Map();

    for (const p of room.players) {
      playerStats.set(p.playerId, {
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar,
        score: 0,
        damageDealt: 0,
        correctCount: 0,
        wrongCount: 0,
        combo: 0,
        lastOutcome: null,
      });
      playerQueues.set(p.playerId, {
        list: shuffleArray(baseQuestions),
        cursor: 0,
      });
    }

    const state = {
      bossName: 'Dr. Golem Logika',
      bossMaxHp,
      bossHp: bossMaxHp,
      bossDefeated: false,
      durationSec,
      endsAt: Date.now() + durationSec * 1000,
      recentAttacks: [], // { id, playerId, name, avatar, damage, isCritical, timestamp }
      playerStats,
      playerQueues,
      baseQuestions,
      tickTimer: null,
      finished: false,
    };

    room._gameInternal = state;

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

    function buildStandardResults() {
      return Array.from(state.playerStats.values())
        .map((s) => ({
          playerId: s.playerId,
          name: s.name,
          avatar: s.avatar,
          score: s.score,
          correctCount: s.correctCount,
          wrongCount: s.wrongCount,
        }))
        .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount);
    }

    function emitPublicState() {
      const remainingSec = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
      const leaderboard = Array.from(state.playerStats.values())
        .sort((a, b) => b.score - a.score || b.damageDealt - a.damageDealt)
        .map((s) => ({
          playerId: s.playerId,
          name: s.name,
          avatar: s.avatar,
          score: s.score,
          damageDealt: s.damageDealt,
          combo: s.combo,
          correctCount: s.correctCount,
          wrongCount: s.wrongCount,
        }));

      const playerQuestions = {};
      const playerFeedback = {};
      for (const [pid, st] of state.playerStats.entries()) {
        playerQuestions[pid] = getCurrentQuestionForPlayer(pid);
        playerFeedback[pid] = st.lastOutcome;
      }

      broadcastGameState({
        gameId: 'boss-raid',
        bossName: state.bossName,
        bossHp: state.bossHp,
        bossMaxHp: state.bossMaxHp,
        bossDefeated: state.bossDefeated,
        durationSec: state.durationSec,
        remainingSec,
        recentAttacks: state.recentAttacks.slice(-6),
        leaderboard,
        playerQuestions,
        playerFeedback,
      });
    }

    function clearTimers() {
      if (state.tickTimer) {
        clearInterval(state.tickTimer);
        state.tickTimer = null;
      }
    }

    function finishNow() {
      if (state.finished) return;
      state.finished = true;
      clearTimers();
      finishGame(buildStandardResults());
    }

    state.emitPublicState = emitPublicState;
    state.clearTimers = clearTimers;
    state.finishNow = finishNow;

    if (baseQuestions.length === 0) {
      finishNow();
      return;
    }

    emitPublicState();

    state.tickTimer = setInterval(() => {
      if (state.finished) {
        clearTimers();
        return;
      }
      if (Date.now() >= state.endsAt) {
        finishNow();
      } else {
        emitPublicState();
      }
    }, 1000);
  },

  onPlayerAction(ctx, player, action) {
    const state = ctx.room._gameInternal;
    if (!state || state.finished) return;

    if (!player) {
      if (action?.type === 'host:force_end') {
        state.finishNow();
      }
      return;
    }

    if (action?.type === 'attack_answer') {
      const optionIndex = Number(action.optionIndex);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return;

      const stats = state.playerStats.get(player.playerId);
      const qState = state.playerQueues.get(player.playerId);
      if (!stats || !qState || qState.list.length === 0) return;

      const currentQ = qState.list[qState.cursor % qState.list.length];
      // Prevent duplicate submission for an already-advanced cursor
      if (action.questionInstanceId && action.questionInstanceId !== `${currentQ.id}-${qState.cursor}`) {
        return;
      }

      const isCorrect = optionIndex === currentQ.correctIndex;
      if (isCorrect) {
        stats.combo += 1;
        stats.correctCount += 1;
        const { damage, points, isCritical } = calcBossAttack(true, stats.combo, currentQ.difficulty);
        stats.damageDealt += damage;
        stats.score += points;
        state.bossHp = Math.max(0, state.bossHp - damage);
        stats.lastOutcome = {
          id: Date.now(),
          isCorrect: true,
          damage,
          points,
          isCritical,
          correctAnswerText: currentQ.options[currentQ.correctIndex],
        };
        state.recentAttacks.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          playerId: player.playerId,
          name: player.name,
          avatar: player.avatar,
          damage,
          isCritical,
          timestamp: Date.now(),
        });
        if (state.recentAttacks.length > 15) {
          state.recentAttacks = state.recentAttacks.slice(-10);
        }
      } else {
        stats.combo = 0;
        stats.wrongCount += 1;
        stats.lastOutcome = {
          id: Date.now(),
          isCorrect: false,
          damage: 0,
          points: 0,
          isCritical: false,
          correctAnswerText: currentQ.options[currentQ.correctIndex],
        };
      }

      // Advance student to next question
      qState.cursor += 1;
      if (qState.cursor % qState.list.length === 0) {
        qState.list = shuffleArray(state.baseQuestions);
      }

      if (state.bossHp <= 0) {
        state.bossDefeated = true;
        // Victory bonus for all players who contributed
        for (const st of state.playerStats.values()) {
          if (st.correctCount > 0) {
            st.score += 300;
          }
        }
        state.emitPublicState();
        setTimeout(() => {
          state.finishNow();
        }, 1200);
      } else {
        state.emitPublicState();
      }
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
