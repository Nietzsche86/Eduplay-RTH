function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDifficultyMultiplier(difficulty) {
  if (difficulty === 'Sulit') return 1.5;
  if (difficulty === 'Sedang') return 1.2;
  return 1.0;
}

function computePoints(isCorrect, remainingMs, totalMs, streak, difficulty) {
  if (!isCorrect) return 0;
  const ratio = Math.max(0, Math.min(1, totalMs > 0 ? remainingMs / totalMs : 0));
  const basePoints = 500;
  const speedBonus = Math.round(500 * ratio);
  const streakBonus = Math.min(streak, 5) * 100;
  return Math.round((basePoints + speedBonus + streakBonus) * getDifficultyMultiplier(difficulty));
}

export const quizKilatHandler = {
  id: 'quiz-kilat',

  init(ctx) {
    const { room, questions, settings, broadcastGameState, finishGame } = ctx;
    let selectedQuestions = [...questions];
    if (settings.shuffleQuestions) {
      selectedQuestions = shuffleArray(selectedQuestions);
    }
    if (settings.questionLimit > 0 && settings.questionLimit < selectedQuestions.length) {
      selectedQuestions = selectedQuestions.slice(0, settings.questionLimit);
    }

    const durationSec = Math.max(5, Math.min(120, Number(settings.timePerQuestion) || 15));

    const playerStats = new Map();
    for (const p of room.players) {
      playerStats.set(p.playerId, {
        playerId: p.playerId,
        name: p.name,
        avatar: p.avatar,
        score: 0,
        correctCount: 0,
        wrongCount: 0,
        streak: 0,
      });
    }

    const state = {
      phase: 'question', // 'question' | 'reveal'
      questionIndex: 0,
      totalQuestions: selectedQuestions.length,
      durationSec,
      questionEndsAt: Date.now() + durationSec * 1000,
      answersThisRound: new Map(), // playerId -> { optionIndex, isCorrect, pointsGained, answeredAt }
      timer: null,
      tickTimer: null,
      questions: selectedQuestions,
      playerStats,
      finished: false,
    };

    room._gameInternal = state;

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
      const q = state.questions[state.questionIndex];
      const optionCounts = [0, 0, 0, 0];
      const roundFeedback = {};
      const answeredPlayerIds = [];

      for (const [pid, ans] of state.answersThisRound.entries()) {
        answeredPlayerIds.push(pid);
        if (ans.optionIndex >= 0 && ans.optionIndex <= 3) {
          optionCounts[ans.optionIndex] += 1;
        }
        roundFeedback[pid] = {
          optionIndex: ans.optionIndex,
          isCorrect: ans.isCorrect,
          pointsGained: ans.pointsGained,
        };
      }

      const leaderboard = Array.from(state.playerStats.values())
        .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount)
        .map((s) => ({
          playerId: s.playerId,
          name: s.name,
          avatar: s.avatar,
          score: s.score,
          streak: s.streak,
          correctCount: s.correctCount,
          wrongCount: s.wrongCount,
        }));

      const remainingSec =
        state.phase === 'question'
          ? Math.max(0, Math.ceil((state.questionEndsAt - Date.now()) / 1000))
          : 0;

      broadcastGameState({
        gameId: 'quiz-kilat',
        phase: state.phase,
        questionIndex: state.questionIndex,
        totalQuestions: state.totalQuestions,
        durationSec: state.durationSec,
        remainingSec,
        question: q
          ? {
              id: q.id,
              text: q.text,
              options: q.options,
              difficulty: q.difficulty,
              // Only expose correctIndex during reveal phase!
              correctIndex: state.phase === 'reveal' ? q.correctIndex : null,
            }
          : null,
        answeredCount: answeredPlayerIds.length,
        totalConnectedPlayers: room.players.filter((p) => p.connected).length,
        answeredPlayerIds,
        optionCounts: state.phase === 'reveal' ? optionCounts : [0, 0, 0, 0],
        roundFeedback: state.phase === 'reveal' ? roundFeedback : {},
        leaderboard,
        isLastQuestion: state.questionIndex >= state.totalQuestions - 1,
      });
    }

    function clearTimers() {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      if (state.tickTimer) {
        clearInterval(state.tickTimer);
        state.tickTimer = null;
      }
    }

    function enterReveal() {
      if (state.phase === 'reveal' || state.finished) return;
      clearTimers();
      state.phase = 'reveal';

      // Players who did not answer lose their streak and count as wrong (timeout)
      for (const p of room.players) {
        if (!state.answersThisRound.has(p.playerId)) {
          const st = state.playerStats.get(p.playerId);
          if (st) {
            st.streak = 0;
            st.wrongCount += 1;
          }
        }
      }

      emitPublicState();
    }

    function startQuestion(index) {
      clearTimers();
      state.questionIndex = index;
      state.phase = 'question';
      state.answersThisRound = new Map();
      state.questionEndsAt = Date.now() + state.durationSec * 1000;

      emitPublicState();

      state.tickTimer = setInterval(() => {
        if (state.phase !== 'question' || state.finished) {
          clearTimers();
          return;
        }
        if (Date.now() >= state.questionEndsAt) {
          enterReveal();
        } else {
          emitPublicState();
        }
      }, 1000);

      state.timer = setTimeout(() => {
        enterReveal();
      }, state.durationSec * 1000 + 150);
    }

    state.enterReveal = enterReveal;
    state.startQuestion = startQuestion;
    state.buildStandardResults = buildStandardResults;
    state.emitPublicState = emitPublicState;
    state.clearTimers = clearTimers;
    state.finishNow = () => {
      if (state.finished) return;
      state.finished = true;
      clearTimers();
      finishGame(buildStandardResults());
    };

    if (state.totalQuestions === 0) {
      state.finishNow();
      return;
    }

    startQuestion(0);
  },

  onPlayerAction(ctx, player, action) {
    const state = ctx.room._gameInternal;
    if (!state || state.finished) return;

    // Host actions pass player === null
    if (!player) {
      if (action?.type === 'host:reveal') {
        state.enterReveal();
        return;
      }
      if (action?.type === 'host:next') {
        if (state.questionIndex + 1 < state.totalQuestions) {
          state.startQuestion(state.questionIndex + 1);
        } else {
          state.finishNow();
        }
        return;
      }
      if (action?.type === 'host:force_end') {
        state.finishNow();
        return;
      }
      return;
    }

    if (action?.type === 'answer') {
      if (state.phase !== 'question') return;
      if (state.answersThisRound.has(player.playerId)) return; // Idempotent guard

      const optionIndex = Number(action.optionIndex);
      if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return;

      const q = state.questions[state.questionIndex];
      if (!q) return;

      const isCorrect = optionIndex === q.correctIndex;
      const stats = state.playerStats.get(player.playerId);
      if (!stats) return;

      const remainingMs = Math.max(0, state.questionEndsAt - Date.now());
      const totalMs = state.durationSec * 1000;

      let pointsGained = 0;
      if (isCorrect) {
        stats.streak += 1;
        stats.correctCount += 1;
        pointsGained = computePoints(true, remainingMs, totalMs, stats.streak, q.difficulty);
        stats.score += pointsGained;
      } else {
        stats.streak = 0;
        stats.wrongCount += 1;
      }

      state.answersThisRound.set(player.playerId, {
        optionIndex,
        isCorrect,
        pointsGained,
        answeredAt: Date.now(),
      });

      const connectedPlayers = ctx.room.players.filter((p) => p.connected);
      const allAnswered =
        connectedPlayers.length > 0 &&
        connectedPlayers.every((p) => state.answersThisRound.has(p.playerId));

      if (allAnswered) {
        state.enterReveal();
      } else {
        state.emitPublicState();
      }
    }
  },

  onDisconnect(ctx, _player) {
    const state = ctx.room._gameInternal;
    if (!state || state.finished) return;
    if (state.phase === 'question') {
      const connectedPlayers = ctx.room.players.filter((p) => p.connected);
      const allAnswered =
        connectedPlayers.length > 0 &&
        connectedPlayers.every((p) => state.answersThisRound.has(p.playerId));
      if (allAnswered) {
        state.enterReveal();
      } else {
        state.emitPublicState();
      }
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
