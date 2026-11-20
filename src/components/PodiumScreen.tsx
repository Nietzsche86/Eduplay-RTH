import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { Award, Download, Home, RotateCcw, Trophy } from 'lucide-react';
import type { GameResultEntry } from '../types/platform';
import { calculateAccuracy, downloadResultsCsv } from '../utils/csv';
import { sortStandardResults } from '../utils/scoring';
import { sound } from '../utils/sound';
import { SchoolLogo, SCHOOL_NAME } from './SchoolLogo';

interface PodiumScreenProps {
  mode: 'host' | 'player';
  gameName: string;
  packTitle: string;
  results: GameResultEntry[];
  currentPlayerId?: string;
  onPlayAgain?: () => void;
  onExitToDashboard?: () => void;
  onLeaveRoom?: () => void;
}

export function PodiumScreen({
  mode,
  gameName,
  packTitle,
  results,
  currentPlayerId,
  onPlayAgain,
  onExitToDashboard,
  onLeaveRoom,
}: PodiumScreenProps) {
  const sorted = sortStandardResults(results);
  const top1 = sorted[0];
  const top2 = sorted[1];
  const top3 = sorted[2];

  const myIndex = currentPlayerId ? sorted.findIndex((r) => r.playerId === currentPlayerId) : -1;
  const myEntry = myIndex >= 0 ? sorted[myIndex] : null;
  const myRank = myIndex >= 0 ? myIndex + 1 : null;

  useEffect(() => {
    sound.play('win');

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    if (mode === 'host' || (myRank !== null && myRank <= 3)) {
      const fireBurst = (originX: number, angle: number) => {
        confetti({
          particleCount: 55,
          angle,
          spread: 60,
          origin: { x: originX, y: 0.65 },
          colors: ['#059669', '#10B981', '#F59E0B', '#FDE047', '#38BDF8'],
        });
      };

      fireBurst(0.15, 60);
      fireBurst(0.85, 120);
      const t = setTimeout(() => {
        confetti({
          particleCount: 75,
          spread: 85,
          origin: { x: 0.5, y: 0.55 },
          colors: ['#059669', '#F59E0B', '#FDE047', '#10B981', '#FFFFFF'],
        });
      }, 450);

      return () => clearTimeout(t);
    }
  }, [mode, myRank]);

  if (mode === 'player') {
    const accuracy = myEntry ? calculateAccuracy(myEntry.correctCount, myEntry.wrongCount) : 0;
    return (
      <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-xl flex-col justify-between gap-6 px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-3xl border border-emerald-900/15 bg-white text-center shadow-sm"
        >
          <div className="bg-emerald-royal px-6 py-7 text-white">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-300 ring-2 ring-amber-300/50">
              {myRank && myRank <= 3 ? <Trophy className="h-9 w-9" /> : <Award className="h-9 w-9" />}
            </div>

            <p className="text-xs font-bold text-amber-200">
              {gameName} · {packTitle}
            </p>

            <h1 className="mt-1 font-display text-3xl font-black text-white sm:text-4xl">
              {myRank === 1
                ? 'Juara 1!'
                : myRank === 2
                ? 'Juara 2!'
                : myRank === 3
                ? 'Juara 3!'
                : `Peringkat #${myRank ?? '-'}`}
            </h1>

            {myEntry && (
              <div className="mt-3 flex items-center justify-center gap-2 text-lg font-bold text-emerald-50">
                <span className="text-3xl">{myEntry.avatar}</span>
                <span>{myEntry.name}</span>
              </div>
            )}
          </div>

          <div className="p-6">
            {myEntry && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-emerald-50 p-3.5">
                  <p className="text-xs font-semibold text-emerald-800">Total Skor</p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-emerald-950">
                    {myEntry.score}
                  </p>
                </div>
                <div className="rounded-2xl bg-teal-50 p-3.5">
                  <p className="text-xs font-semibold text-teal-800">Benar</p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-teal-950">
                    {myEntry.correctCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-rose-50 p-3.5">
                  <p className="text-xs font-semibold text-rose-700">Salah</p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-rose-900">
                    {myEntry.wrongCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3.5">
                  <p className="text-xs font-semibold text-amber-800">Akurasi</p>
                  <p className="mt-1 font-mono-num text-2xl font-black text-amber-950">
                    {accuracy}%
                  </p>
                </div>
              </div>
            )}

            {sorted.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5 text-left">
                <p className="mb-3 text-xs font-bold text-slate-500">3 Besar Ruangan Ini</p>
                <div className="space-y-2">
                  {sorted.slice(0, 3).map((entry, idx) => (
                    <div
                      key={entry.playerId}
                      className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm ${
                        entry.playerId === currentPlayerId
                          ? 'bg-emerald-50 font-bold text-emerald-950 ring-1 ring-emerald-200'
                          : 'bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono-num text-xs font-extrabold text-slate-500">
                          #{idx + 1}
                        </span>
                        <span className="text-lg">{entry.avatar}</span>
                        <span className="truncate font-semibold">{entry.name}</span>
                      </div>
                      <span className="font-mono-num font-extrabold text-emerald-700">
                        {entry.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <div className="flex flex-col gap-3 text-center">
          <p className="text-xs font-medium text-slate-500">
            Tetap di halaman ini jika guru akan memulai ronde berikutnya.
          </p>
          {onLeaveRoom && (
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onLeaveRoom();
              }}
              className="btn-tactile inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
            >
              <Home className="h-4 w-4" />
              <span>Keluar ke Halaman Utama</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // HOST PROJECTOR PODIUM VIEW
  const handleExportCsv = () => {
    sound.play('click');
    const safeSlug = packTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    downloadResultsCsv(sorted, `eduplay-rth-${safeSlug || 'nilai'}`);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-900/10 bg-white p-1.5 shadow-sm">
            <SchoolLogo className="h-full w-full" />
          </div>
          <div>
            <p className="text-sm font-bold text-emerald-700">
              Hasil Akhir · {gameName} · {packTitle}
            </p>
            <h1 className="font-display text-3xl font-black text-emerald-950 sm:text-4xl">
              Podium Juara EduPlay RTH
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-tactile inline-flex items-center gap-2 rounded-xl border-b-4 border-emerald-900 bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 text-amber-300" />
            <span>Export Nilai ke CSV (Excel)</span>
          </button>

          {onPlayAgain && (
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onPlayAgain();
              }}
              className="btn-tactile inline-flex items-center gap-2 rounded-xl border-b-4 border-amber-700 bg-amber-500 px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-400 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Main Lagi</span>
            </button>
          )}

          {onExitToDashboard && (
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onExitToDashboard();
              }}
              className="btn-tactile inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Home className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
          )}
        </div>
      </div>

      {/* Animated Top 3 Royal Emerald & Gold Podium Stage */}
      {sorted.length > 0 ? (
        <section
          aria-label="Podium Juara 1, 2, dan 3"
          className="bg-emerald-royal overflow-hidden rounded-3xl border border-emerald-800 px-6 pt-8 pb-8 text-white shadow-md"
        >
          <p className="mb-6 text-center text-xs font-bold tracking-wide text-amber-300">
            {SCHOOL_NAME} · Panggung Penghargaan Kelas
          </p>
          <div className="mx-auto grid max-w-3xl grid-cols-3 items-end gap-3 sm:gap-6">
            {/* 2nd Place */}
            <div className="flex flex-col items-center">
              {top2 ? (
                <motion.div
                  initial={{ opacity: 0, y: 36 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="flex w-full flex-col items-center"
                >
                  <span className="text-4xl sm:text-5xl" aria-hidden="true">
                    {top2.avatar}
                  </span>
                  <p className="mt-2 max-w-full truncate text-center font-display text-sm font-extrabold text-white sm:text-lg">
                    {top2.name}
                  </p>
                  <p className="font-mono-num text-xs font-bold text-emerald-200 sm:text-sm">
                    {top2.score} poin
                  </p>
                  <div className="mt-3 flex h-28 w-full flex-col items-center justify-center rounded-t-2xl border-t-4 border-slate-200 bg-gradient-to-b from-slate-200 to-slate-300 sm:h-36">
                    <span className="font-display text-3xl font-black text-slate-800 sm:text-4xl">
                      2
                    </span>
                  </div>
                </motion.div>
              ) : (
                <div className="h-24 w-full" />
              )}
            </div>

            {/* 1st Place */}
            <div className="flex flex-col items-center">
              {top1 && (
                <motion.div
                  initial={{ opacity: 0, y: 48 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08, duration: 0.45 }}
                  className="flex w-full flex-col items-center"
                >
                  <Trophy className="mb-1 h-9 w-9 text-amber-300 drop-shadow-sm" />
                  <span className="text-5xl sm:text-6xl" aria-hidden="true">
                    {top1.avatar}
                  </span>
                  <p className="mt-2 max-w-full truncate text-center font-display text-base font-black text-white sm:text-xl">
                    {top1.name}
                  </p>
                  <p className="font-mono-num text-sm font-extrabold text-amber-300 sm:text-base">
                    {top1.score} poin
                  </p>
                  <div className="mt-3 flex h-40 w-full flex-col items-center justify-center rounded-t-2xl border-t-4 border-amber-200 bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-lg sm:h-48">
                    <span className="font-display text-4xl font-black text-amber-950 sm:text-5xl">
                      1
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* 3rd Place */}
            <div className="flex flex-col items-center">
              {top3 ? (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="flex w-full flex-col items-center"
                >
                  <span className="text-4xl sm:text-5xl" aria-hidden="true">
                    {top3.avatar}
                  </span>
                  <p className="mt-2 max-w-full truncate text-center font-display text-sm font-extrabold text-white sm:text-lg">
                    {top3.name}
                  </p>
                  <p className="font-mono-num text-xs font-bold text-emerald-200 sm:text-sm">
                    {top3.score} poin
                  </p>
                  <div className="mt-3 flex h-20 w-full flex-col items-center justify-center rounded-t-2xl border-t-4 border-orange-200 bg-gradient-to-b from-orange-300 to-orange-400 sm:h-28">
                    <span className="font-display text-3xl font-black text-orange-950 sm:text-4xl">
                      3
                    </span>
                  </div>
                </motion.div>
              ) : (
                <div className="h-20 w-full" />
              )}
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-base font-semibold text-slate-600">
            Belum ada skor siswa yang tercatat pada sesi ini.
          </p>
        </div>
      )}

      {/* Full Recap Table */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="font-display text-lg font-bold text-slate-900">Rekap Nilai Lengkap</h2>
          <span className="text-sm font-medium text-slate-500 tabular-nums">
            Total {sorted.length} siswa
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-600">
              <tr>
                <th className="px-6 py-3.5">Peringkat</th>
                <th className="px-6 py-3.5">Nama Siswa</th>
                <th className="px-6 py-3.5 text-right">Total Skor</th>
                <th className="px-6 py-3.5 text-right">Benar</th>
                <th className="px-6 py-3.5 text-right">Salah</th>
                <th className="px-6 py-3.5 text-right">Akurasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((entry, idx) => {
                const accuracy = calculateAccuracy(entry.correctCount, entry.wrongCount);
                return (
                  <tr key={entry.playerId} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-mono-num font-bold text-slate-700">
                      #{idx + 1}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xl" aria-hidden="true">
                          {entry.avatar}
                        </span>
                        <span className="font-bold text-slate-900">{entry.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono-num font-extrabold text-emerald-700">
                      {entry.score}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono-num font-semibold text-emerald-700">
                      {entry.correctCount}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono-num font-semibold text-rose-700">
                      {entry.wrongCount}
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono-num font-bold text-slate-800">
                      {accuracy}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
