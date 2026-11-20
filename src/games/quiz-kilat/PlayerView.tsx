import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock, Flame, XCircle } from 'lucide-react';
import type { PlayerGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';

const BUTTON_THEMES = [
  { letter: 'A', shape: '▲', cls: 'bg-rose-600 hover:bg-rose-700 border-rose-800 text-white' },
  { letter: 'B', shape: '◆', cls: 'bg-blue-600 hover:bg-blue-700 border-blue-800 text-white' },
  { letter: 'C', shape: '●', cls: 'bg-amber-500 hover:bg-amber-600 border-amber-700 text-slate-950' },
  { letter: 'D', shape: '■', cls: 'bg-emerald-600 hover:bg-emerald-700 border-emerald-800 text-white' },
];

export function QuizKilatPlayer({ socket, roomCode, player, gameState }: PlayerGameProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const lastQuestionIdRef = useRef<string | null>(null);
  const lastPlayedRevealRef = useRef<string | null>(null);

  const questionId = gameState?.question?.id ?? null;

  // Reset local selection when advancing to a new question
  useEffect(() => {
    if (questionId && questionId !== lastQuestionIdRef.current) {
      lastQuestionIdRef.current = questionId;
      setSelectedIdx(null);
    }
  }, [questionId]);

  // Play feedback sound once per reveal
  useEffect(() => {
    if (!gameState || gameState.phase !== 'reveal' || !questionId) return;
    const revealKey = `${questionId}-reveal`;
    if (lastPlayedRevealRef.current === revealKey) return;
    lastPlayedRevealRef.current = revealKey;

    const myFeedback = gameState.roundFeedback?.[player.playerId];
    if (myFeedback?.isCorrect) {
      sound.play('correct');
    } else {
      sound.play('wrong');
    }
  }, [gameState, player.playerId, questionId]);

  if (!gameState || !gameState.question) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-lg font-bold text-slate-700">Menunggu soal dimulai...</p>
      </div>
    );
  }

  const { phase, questionIndex, totalQuestions, remainingSec, question, leaderboard = [] } = gameState;
  const myStats = leaderboard.find((l: any) => l.playerId === player.playerId);
  const myRank = leaderboard.findIndex((l: any) => l.playerId === player.playerId) + 1;
  const hasAnswered =
    selectedIdx !== null || (gameState.answeredPlayerIds || []).includes(player.playerId);
  const myFeedback = gameState.roundFeedback?.[player.playerId];

  const submitAnswer = (optionIndex: number) => {
    if (phase !== 'question' || hasAnswered) return;
    sound.play('click');
    setSelectedIdx(optionIndex);
    socket.emit('player:game_action', {
      roomCode,
      action: { type: 'answer', optionIndex },
    });
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-60px)] w-full max-w-2xl flex-col justify-between gap-4 px-4 py-4">
      {/* Compact Top Status Bar */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-2xl leading-none" aria-hidden="true">
            {player.avatar}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{player.name}</p>
            <p className="text-xs text-slate-500 tabular-nums">
              Soal {questionIndex + 1}/{totalQuestions} · Peringkat #{myRank || '-'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {myStats?.streak >= 2 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 tabular-nums">
              <Flame className="h-4 w-4" />
              {myStats.streak}x
            </span>
          )}
          <div className="text-right">
            <p className="text-[11px] font-medium text-slate-500">Skor</p>
            <p className="font-mono-num text-lg font-extrabold leading-none text-emerald-700">
              {myStats?.score ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Center Content */}
      {phase === 'question' ? (
        <div className="flex flex-1 flex-col justify-between gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Tingkat {question.difficulty}</span>
              <span
                className={`inline-flex items-center gap-1 font-mono-num text-base font-extrabold ${
                  remainingSec <= 5 ? 'text-rose-600' : 'text-slate-800'
                }`}
              >
                <Clock className="h-4 w-4" />
                {remainingSec}d
              </span>
            </div>
            <h2 className="font-display text-lg font-bold leading-snug text-slate-900 sm:text-2xl">
              {question.text}
            </h2>
          </div>

          {hasAnswered ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-emerald-200 bg-emerald-50/70 p-8 text-center"
            >
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 font-display text-2xl font-black text-amber-300 shadow-sm">
                {selectedIdx !== null ? BUTTON_THEMES[selectedIdx].letter : '✓'}
              </div>
              <h3 className="font-display text-xl font-extrabold text-emerald-950">
                Jawaban Terkunci!
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Menunggu teman lainnya selesai menjawab...
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 gap-3 pb-2 sm:grid-cols-2">
              {question.options.map((opt: string, idx: number) => {
                const theme = BUTTON_THEMES[idx];
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => submitAnswer(idx)}
                    aria-label={`Pilih jawaban ${theme.letter}: ${opt}`}
                    className={`btn-tactile flex min-h-[76px] w-full items-center gap-3.5 rounded-2xl border-b-4 px-4 py-3.5 text-left shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${theme.cls}`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-black/15 font-display text-xl font-black">
                      {theme.letter}
                    </span>
                    <span className="text-base font-bold leading-snug sm:text-lg">{opt}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Reveal Phase Feedback */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex flex-1 flex-col items-center justify-center rounded-3xl border-2 p-8 text-center shadow-sm ${
            myFeedback?.isCorrect
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-rose-300 bg-rose-50'
          }`}
        >
          {myFeedback?.isCorrect ? (
            <>
              <CheckCircle2 className="mb-3 h-16 w-16 text-emerald-600" />
              <h2 className="font-display text-3xl font-black text-emerald-900">Benar!</h2>
              <p className="mt-2 font-mono-num text-2xl font-extrabold text-emerald-700">
                +{myFeedback.pointsGained} Poin
              </p>
            </>
          ) : (
            <>
              <XCircle className="mb-3 h-16 w-16 text-rose-600" />
              <h2 className="font-display text-3xl font-black text-rose-900">
                {myFeedback ? 'Kurang Tepat' : 'Waktu Habis'}
              </h2>
              {question.correctIndex !== null && (
                <p className="mt-3 text-sm font-medium text-slate-700">
                  Jawaban benar:{' '}
                  <strong className="font-bold text-slate-900">
                    {BUTTON_THEMES[question.correctIndex].letter}.{' '}
                    {question.options[question.correctIndex]}
                  </strong>
                </p>
              )}
            </>
          )}

          <p className="mt-6 text-sm font-medium text-slate-600">
            Lihat layar proyektor untuk soal berikutnya...
          </p>
        </motion.div>
      )}
    </div>
  );
}
