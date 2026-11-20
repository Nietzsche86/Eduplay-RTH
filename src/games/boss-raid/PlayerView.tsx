import { useEffect, useRef } from 'react';
import { Clock, Flame, Swords } from 'lucide-react';
import type { PlayerGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';

const OPTION_THEMES = [
  { letter: 'A', cls: 'bg-rose-600 hover:bg-rose-700 border-rose-800 text-white' },
  { letter: 'B', cls: 'bg-blue-600 hover:bg-blue-700 border-blue-800 text-white' },
  { letter: 'C', cls: 'bg-amber-500 hover:bg-amber-600 border-amber-700 text-slate-950' },
  { letter: 'D', cls: 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white' },
];

export function BossRaidPlayer({ socket, roomCode, player, gameState }: PlayerGameProps) {
  const lastOutcomeIdRef = useRef<number | null>(null);
  const myFeedback = gameState?.playerFeedback?.[player.playerId];

  useEffect(() => {
    if (!myFeedback?.id || myFeedback.id === lastOutcomeIdRef.current) return;
    lastOutcomeIdRef.current = myFeedback.id;
    if (myFeedback.isCorrect) {
      sound.play('attack');
    } else {
      sound.play('wrong');
    }
  }, [myFeedback]);

  const currentQuestion = gameState?.playerQuestions?.[player.playerId];
  const myStats = (gameState?.leaderboard || []).find((l: any) => l.playerId === player.playerId);

  if (!gameState || !currentQuestion) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 text-center">
        <p className="text-lg font-bold text-slate-700">Menyiapkan pertempuran...</p>
      </div>
    );
  }

  const hpPct =
    gameState.bossMaxHp > 0
      ? Math.max(0, Math.min(100, (gameState.bossHp / gameState.bossMaxHp) * 100))
      : 0;

  const handleAttack = (optionIndex: number) => {
    if (gameState.bossDefeated) return;
    sound.play('click');
    socket.emit('player:game_action', {
      roomCode,
      action: {
        type: 'attack_answer',
        optionIndex,
        questionInstanceId: currentQuestion.id,
      },
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-60px)] w-full max-w-2xl flex-col justify-between gap-4 px-4 py-4">
      {/* Mini Boss Status & Player Score */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <Swords className="h-4 w-4 text-rose-600" />
            {gameState.bossName}
          </span>
          <span className="inline-flex items-center gap-1 font-mono-num text-sm text-slate-900">
            <Clock className="h-3.5 w-3.5" />
            {gameState.remainingSec}d
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-rose-500 transition-all duration-300"
            style={{ width: `${hpPct}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-slate-600 tabular-nums">
          <span>
            {player.avatar} {player.name}
          </span>
          <div className="flex items-center gap-3">
            {myStats?.combo >= 2 && (
              <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                <Flame className="h-3.5 w-3.5" />
                {myStats.combo}x
              </span>
            )}
            <span className="font-mono-num text-sm font-extrabold text-emerald-700">
              {myStats?.score ?? 0} Poin
            </span>
          </div>
        </div>
      </div>

      {/* Last Attack Feedback Strip */}
      {myFeedback && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-center text-sm font-bold ${
            myFeedback.isCorrect
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {myFeedback.isCorrect
            ? `Serangan masuk! -${myFeedback.damage} HP Boss (+${myFeedback.points} Poin)${
                myFeedback.isCritical ? ' · KRITIS!' : ''
              }`
            : `Meleset! Jawaban benar: ${myFeedback.correctAnswerText}`}
        </div>
      )}

      {/* Question Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="mb-2 text-xs font-semibold text-slate-500">
          Serangan #{currentQuestion.number} · {currentQuestion.difficulty}
        </p>
        <h2 className="font-display text-lg font-bold leading-snug text-slate-900 sm:text-2xl">
          {currentQuestion.text}
        </h2>
      </div>

      {/* Giant Touch Answer Buttons */}
      <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2">
        {currentQuestion.options.map((opt: string, idx: number) => {
          const theme = OPTION_THEMES[idx];
          return (
            <button
              key={`${currentQuestion.id}-${idx}`}
              type="button"
              onClick={() => handleAttack(idx)}
              disabled={gameState.bossDefeated}
              aria-label={`Serang dengan jawaban ${theme.letter}: ${opt}`}
              className={`btn-tactile flex min-h-[76px] w-full items-center gap-3.5 rounded-2xl border-b-4 px-4 py-3.5 text-left shadow-sm disabled:opacity-50 ${theme.cls}`}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/15 font-display text-xl font-black">
                {theme.letter}
              </span>
              <span className="text-base font-bold leading-snug sm:text-lg">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
