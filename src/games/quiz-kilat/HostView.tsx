import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Clock, Flag, Trophy, Users } from 'lucide-react';
import type { HostGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';

const OPTION_STYLES = [
  { letter: 'A', bg: 'bg-rose-600', softBg: 'bg-rose-50', border: 'border-rose-700', bar: 'bg-rose-500', shape: '▲' },
  { letter: 'B', bg: 'bg-blue-600', softBg: 'bg-blue-50', border: 'border-blue-700', bar: 'bg-blue-500', shape: '◆' },
  { letter: 'C', bg: 'bg-amber-500', softBg: 'bg-amber-50', border: 'border-amber-600', bar: 'bg-amber-500', shape: '●' },
  { letter: 'D', bg: 'bg-emerald-600', softBg: 'bg-emerald-50', border: 'border-emerald-700', bar: 'bg-emerald-500', shape: '■' },
];

export function QuizKilatHost({ socket, roomCode, gameState, onForceEnd }: HostGameProps) {
  const prevTickRef = useRef<number | null>(null);
  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gameState) return;
    if (
      gameState.phase === 'question' &&
      gameState.remainingSec <= 5 &&
      gameState.remainingSec > 0 &&
      prevTickRef.current !== gameState.remainingSec
    ) {
      sound.play('countdown');
    }
    prevTickRef.current = gameState.remainingSec;

    if (prevPhaseRef.current === 'question' && gameState.phase === 'reveal') {
      sound.play('correct');
    }
    prevPhaseRef.current = gameState.phase;
  }, [gameState]);

  if (!gameState || !gameState.question) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-medium text-slate-600">Menyiapkan soal...</p>
      </div>
    );
  }

  const {
    phase,
    questionIndex,
    totalQuestions,
    durationSec,
    remainingSec,
    question,
    answeredCount,
    totalConnectedPlayers,
    optionCounts = [0, 0, 0, 0],
    leaderboard = [],
    isLastQuestion,
  } = gameState;

  const progressPct = durationSec > 0 ? Math.max(0, Math.min(100, (remainingSec / durationSec) * 100)) : 0;
  const maxVotes = Math.max(1, ...optionCounts);

  const handleRevealEarly = () => {
    sound.play('click');
    socket.emit('host:game_action', { roomCode, action: { type: 'host:reveal' } });
  };

  const handleNext = () => {
    sound.play('click');
    socket.emit('host:game_action', { roomCode, action: { type: 'host:next' } });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Projector HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="font-display text-lg font-bold text-slate-900">
            Soal {questionIndex + 1} / {totalQuestions}
          </div>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="text-sm font-medium text-slate-600">
            Tingkat: <strong className="text-slate-900">{question.difficulty}</strong>
          </span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-600 tabular-nums">
            <Users className="h-4 w-4 text-emerald-600" />
            <span>
              {answeredCount} / {Math.max(1, totalConnectedPlayers)} menjawab
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {phase === 'question' ? (
            <button
              type="button"
              onClick={handleRevealEarly}
              className="btn-tactile inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Tutup Jawaban
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="btn-tactile inline-flex items-center gap-2 rounded-xl border-b-4 border-emerald-900 bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              <span>{isLastQuestion ? 'Lihat Podium Juara' : 'Soal Berikutnya'}</span>
              <ArrowRight className="h-4 w-4 text-amber-300" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              sound.play('click');
              onForceEnd();
            }}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
          >
            <Flag className="h-4 w-4" />
            <span>Akhiri</span>
          </button>
        </div>
      </div>

      {/* Main 2-Zone Stage */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left/Main Question & Options Stage */}
        <div className="flex flex-col gap-5 lg:col-span-8">
          {/* Timer Bar + Question Card */}
          <div className="overflow-hidden rounded-3xl border border-emerald-900/10 bg-white shadow-sm">
            <div className="h-2.5 w-full bg-emerald-100">
              <div
                className={`h-full transition-all duration-700 ease-linear ${
                  remainingSec <= 5 ? 'bg-rose-500' : 'bg-emerald-600'
                }`}
                style={{ width: `${phase === 'reveal' ? 0 : progressPct}%` }}
              />
            </div>

            <div className="p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">
                  {phase === 'question' ? 'Waktu Tersisa' : 'Pembahasan Kunci Jawaban'}
                </span>
                <div
                  className={`flex items-center gap-2 font-mono-num text-2xl font-extrabold ${
                    phase === 'question' && remainingSec <= 5 ? 'text-rose-600' : 'text-slate-900'
                  }`}
                >
                  <Clock className="h-5 w-5" />
                  <span>{phase === 'reveal' ? 'SELESAI' : `${remainingSec}d`}</span>
                </div>
              </div>

              <motion.h2
                key={question.id}
                initial={{ y: 6 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.16 }}
                className="font-display text-2xl font-extrabold leading-snug text-slate-900 sm:text-3xl lg:text-4xl"
              >
                {question.text}
              </motion.h2>
            </div>
          </div>

          {/* 2x2 Options Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {question.options.map((opt: string, idx: number) => {
              const style = OPTION_STYLES[idx];
              const isCorrect = phase === 'reveal' && question.correctIndex === idx;
              const isDimmed = phase === 'reveal' && question.correctIndex !== idx;
              const count = optionCounts[idx] || 0;
              const barPct = Math.round((count / maxVotes) * 100);

              return (
                <div
                  key={idx}
                  className={`relative overflow-hidden rounded-2xl border-2 p-5 transition-all duration-200 ${
                    isCorrect
                      ? 'border-emerald-500 bg-emerald-50 ring-4 ring-emerald-200/70'
                      : isDimmed
                      ? 'border-slate-200 bg-white opacity-55'
                      : 'border-slate-200 bg-white shadow-sm'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-b-4 font-display text-xl font-black text-white ${style.bg} ${style.border}`}
                    >
                      {style.letter}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                          {opt}
                        </p>
                        {isCorrect && (
                          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" aria-label="Jawaban Benar" />
                        )}
                      </div>

                      {phase === 'reveal' && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600 tabular-nums">
                            <span>{count} siswa memilih</span>
                            <span>{style.shape}</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isCorrect ? 'bg-emerald-500' : style.bar
                              }`}
                              style={{ width: `${count > 0 ? Math.max(10, barPct) : 0}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Live Leaderboard */}
        <aside className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-4">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h3 className="font-display text-lg font-bold text-slate-900">Klasemen Sementara</h3>
            </div>
            <span className="text-xs font-semibold text-slate-500 tabular-nums">
              {leaderboard.length} siswa
            </span>
          </div>

          <div className="flex flex-col divide-y divide-slate-100">
            {leaderboard.slice(0, 8).map((entry: any, idx: number) => (
              <div key={entry.playerId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono-num text-xs font-bold ${
                      idx === 0
                        ? 'bg-amber-100 text-amber-800'
                        : idx === 1
                        ? 'bg-slate-200 text-slate-700'
                        : idx === 2
                        ? 'bg-orange-100 text-orange-800'
                        : 'text-slate-500'
                    }`}
                  >
                    #{idx + 1}
                  </span>
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {entry.avatar}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{entry.name}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {entry.correctCount} benar{entry.streak >= 2 ? ` · ${entry.streak}x streak` : ''}
                    </p>
                  </div>
                </div>
                <span className="font-mono-num text-base font-extrabold text-emerald-700">
                  {entry.score}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
