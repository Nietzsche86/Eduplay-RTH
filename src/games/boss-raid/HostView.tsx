import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Flag, ShieldAlert, Swords, Trophy } from 'lucide-react';
import type { HostGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';

export function BossRaidHost({ gameState, onForceEnd }: HostGameProps) {
  const lastAttackIdRef = useRef<string | null>(null);
  const [bossShake, setBossShake] = useState(false);

  const recentAttacks = gameState?.recentAttacks || [];
  const latestAttack = recentAttacks.length > 0 ? recentAttacks[recentAttacks.length - 1] : null;

  useEffect(() => {
    if (!latestAttack) return;
    if (latestAttack.id !== lastAttackIdRef.current) {
      lastAttackIdRef.current = latestAttack.id;
      sound.play('attack');
      setBossShake(true);
      const t = setTimeout(() => setBossShake(false), 260);
      return () => clearTimeout(t);
    }
  }, [latestAttack]);

  if (!gameState) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-lg font-medium text-slate-600">Memanggil Boss Arena...</p>
      </div>
    );
  }

  const {
    bossName,
    bossHp,
    bossMaxHp,
    bossDefeated,
    remainingSec,
    leaderboard = [],
  } = gameState;

  const hpPct = bossMaxHp > 0 ? Math.max(0, Math.min(100, (bossHp / bossMaxHp) * 100)) : 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top HUD */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-display text-lg font-extrabold text-slate-900">
            <Swords className="h-5 w-5 text-rose-600" />
            <span>Serbuan Boss Edukasi</span>
          </div>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="text-sm font-medium text-slate-600">
            Jawab soal di HP untuk melancarkan serangan bersama!
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div
            className={`flex items-center gap-2 font-mono-num text-2xl font-extrabold ${
              remainingSec <= 10 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            <Clock className="h-5 w-5" />
            <span>{remainingSec}d</span>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.play('click');
              onForceEnd();
            }}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
          >
            <Flag className="h-4 w-4" />
            <span>Akhiri Ronde</span>
          </button>
        </div>
      </div>

      {/* Main Arena + Damage Leaderboard */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Boss Battle Stage */}
        <div className="bg-emerald-royal relative flex flex-col justify-between overflow-hidden rounded-3xl border border-emerald-800 p-6 text-white shadow-md sm:p-8 lg:col-span-8">
          {/* Boss Header & HP Bar */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="h-6 w-6 text-amber-300" />
                <h2 className="font-display text-2xl font-black tracking-tight sm:text-3xl">
                  {bossName}
                </h2>
              </div>
              <span className="font-mono-num text-lg font-bold text-amber-300 sm:text-xl">
                HP {bossHp} / {bossMaxHp}
              </span>
            </div>

            <div className="h-6 w-full overflow-hidden rounded-xl border border-amber-400/35 bg-black/35 p-1">
              <div
                className={`h-full rounded-lg transition-all duration-300 ${
                  hpPct > 50 ? 'bg-emerald-400' : hpPct > 20 ? 'bg-amber-400' : 'bg-rose-500'
                }`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>

          {/* Center Illustrated Boss SVG + Floating Damage */}
          <div className="relative my-8 flex min-h-[260px] items-center justify-center">
            <motion.div
              animate={
                bossDefeated
                  ? { scale: 0.7, opacity: 0.2, rotate: -14 }
                  : bossShake
                  ? { x: [-12, 12, -8, 8, 0], scale: [1, 0.94, 1.03, 1] }
                  : { y: [0, -8, 0] }
              }
              transition={
                bossShake
                  ? { duration: 0.25 }
                  : { duration: 2.4, repeat: bossDefeated ? 0 : Infinity, ease: 'easeInOut' }
              }
              className="relative"
            >
              {/* Hand-crafted geometric Golem Boss SVG */}
              <svg
                viewBox="0 0 220 220"
                className={`h-52 w-52 sm:h-60 sm:w-60 drop-shadow-xl transition-all ${
                  bossShake ? 'brightness-150' : ''
                }`}
                aria-label={bossName}
              >
                {/* Crown / Horns */}
                <polygon points="55,55 75,18 92,50" fill="#F59E0B" stroke="#0F172A" strokeWidth="5" />
                <polygon points="165,55 145,18 128,50" fill="#F59E0B" stroke="#0F172A" strokeWidth="5" />
                {/* Body Shield */}
                <rect x="42" y="48" width="136" height="128" rx="28" fill="#334155" stroke="#94A3B8" strokeWidth="6" />
                {/* Chest Core */}
                <polygon points="110,118 134,142 110,166 86,142" fill={hpPct < 30 ? '#F43F5E' : '#38BDF8'} />
                {/* Visor */}
                <rect x="64" y="74" width="92" height="30" rx="12" fill="#0F172A" />
                {/* Eyes */}
                <circle cx="88" cy="89" r="8" fill={bossDefeated ? '#64748B' : '#F43F5E'} />
                <circle cx="132" cy="89" r="8" fill={bossDefeated ? '#64748B' : '#F43F5E'} />
                {/* Fists */}
                <rect x="12" y="100" width="28" height="58" rx="12" fill="#475569" stroke="#94A3B8" strokeWidth="4" />
                <rect x="180" y="100" width="28" height="58" rx="12" fill="#475569" stroke="#94A3B8" strokeWidth="4" />
              </svg>

              {bossDefeated && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="rounded-2xl bg-emerald-500 px-5 py-2 font-display text-2xl font-black text-white shadow-lg">
                    BOSS KALAH!
                  </span>
                </div>
              )}
            </motion.div>

            {/* Floating Recent Attack Feed */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap justify-center gap-2">
              <AnimatePresence>
                {recentAttacks.slice(-3).map((atk: any) => (
                  <motion.div
                    key={atk.id}
                    initial={{ opacity: 0, y: 24, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-extrabold shadow-md ${
                      atk.isCritical
                        ? 'bg-amber-400 text-slate-950'
                        : 'bg-white/95 text-slate-900'
                    }`}
                  >
                    <span>{atk.avatar}</span>
                    <span>{atk.name}</span>
                    <span className="font-mono-num text-rose-600">-{atk.damage}</span>
                    {atk.isCritical && <span className="text-xs font-black">CRIT!</span>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs font-medium text-slate-400">
            <span>Status: {bossDefeated ? 'Kemenangan Tim!' : 'Pertempuran Berlangsung'}</span>
            <span>Combo 3x+ menghasilkan Serangan Kritis</span>
          </div>
        </div>

        {/* Right MVP Damage Leaderboard */}
        <aside className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-4">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              <h3 className="font-display text-lg font-bold text-slate-900">Pahlawan Terkuat</h3>
            </div>
            <span className="text-xs font-semibold text-slate-500">Total Skor</span>
          </div>

          <div className="flex flex-col divide-y divide-slate-100">
            {leaderboard.slice(0, 8).map((entry: any, idx: number) => (
              <div key={entry.playerId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 font-mono-num text-xs font-bold text-slate-500">
                    #{idx + 1}
                  </span>
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {entry.avatar}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{entry.name}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {entry.damageDealt} DMG{entry.combo >= 2 ? ` · ${entry.combo}x combo` : ''}
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
