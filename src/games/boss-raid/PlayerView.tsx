import { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Flame, Heart, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import type { PlayerGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';
import {
  HERO_CLASS_LIST,
  HERO_CLASS_MAP,
  getHeroPreviewDataUrl,
  type HeroClassId,
} from './pixelSprites';

const OPTION_STYLES = [
  { letter: 'A', bg: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-400' },
  { letter: 'B', bg: 'bg-sky-700 hover:bg-sky-600 border-sky-400' },
  { letter: 'C', bg: 'bg-amber-600 hover:bg-amber-500 border-amber-300' },
  { letter: 'D', bg: 'bg-purple-700 hover:bg-purple-600 border-purple-400' },
];

export function BossRaidPlayer({ socket, roomCode, player, gameState }: PlayerGameProps) {
  const lastFeedbackIdRef = useRef<number>(0);

  const myHero = useMemo(() => {
    const list: any[] = gameState?.heroes || [];
    return list.find((h) => h.playerId === player.playerId) || null;
  }, [gameState?.heroes, player.playerId]);

  const myHeroClass: HeroClassId = (myHero?.heroClass || 'knight') as HeroClassId;
  const heroMeta = HERO_CLASS_MAP[myHeroClass] || HERO_CLASS_MAP.knight;
  const question = gameState?.playerQuestions?.[player.playerId] || null;
  const feedback = gameState?.playerFeedback?.[player.playerId] || null;

  // Pre-compute crisp pixel preview URLs offline
  const heroPreviews = useMemo(() => {
    const map: Record<HeroClassId, { idle: string; attack: string }> = {} as any;
    for (const h of HERO_CLASS_LIST) {
      map[h.id] = {
        idle: getHeroPreviewDataUrl(h.id, 'idle', 4),
        attack: getHeroPreviewDataUrl(h.id, 'attack', 4),
      };
    }
    return map;
  }, []);

  useEffect(() => {
    if (!feedback?.id || feedback.id === lastFeedbackIdRef.current) return;
    lastFeedbackIdRef.current = feedback.id;
    if (feedback.kind === 'answer_correct') sound.play('correct');
    else if (feedback.kind === 'answer_wrong') sound.play('wrong');
    else if (feedback.kind === 'skill_attack') {
      sound.play(
        myHeroClass === 'mage'
          ? 'fireball'
          : myHeroClass === 'archer'
            ? 'arrow'
            : myHeroClass === 'healer'
              ? 'heal'
              : 'slash'
      );
    } else if (feedback.kind === 'skill_heal') sound.play('heal');
    else if (feedback.kind === 'skill_shield') sound.play('shield');
  }, [feedback, myHeroClass]);

  if (!gameState) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-[#09131C] p-6 font-mono-num text-sm font-bold text-emerald-300">
        MEMASUKI DUNIA PIXEL HEROES...
      </div>
    );
  }

  const handleSelectHero = (heroClass: HeroClassId) => {
    sound.play('click');
    socket.emit('player:game_action', {
      roomCode,
      playerId: player.playerId,
      action: { type: 'select_hero', heroClass },
    });
  };

  const handleSubmitAnswer = (optionIndex: number) => {
    if (!question) return;
    sound.play('click');
    socket.emit('player:game_action', {
      roomCode,
      playerId: player.playerId,
      action: {
        type: 'submit_answer',
        optionIndex,
        questionInstanceId: question.id,
      },
    });
  };

  const handleUseSkill = (skillType: 'primary' | 'heal' | 'shield') => {
    socket.emit('player:game_action', {
      roomCode,
      playerId: player.playerId,
      action: { type: 'use_skill', skillType },
    });
  };

  // ========================================================
  // 1. HERO SELECTION PHASE (15s)
  // ========================================================
  if (gameState.phase === 'hero_select') {
    return (
      <div
        data-testid="hero-select-screen"
        className="min-h-[calc(100vh-3.5rem)] bg-[#09131C] px-3 py-4 font-mono-num text-white"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-3">
          {/* Retro RPG Title Box */}
          <div className="pixel-panel border-2 border-amber-400 bg-[#0D232A] p-3.5 text-center">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span className="text-emerald-300">PILIH KELAS HERO PIXEL</span>
              <span className="border border-amber-300 bg-amber-400 px-2 py-0.5 text-slate-950">
                {gameState.heroSelectRemainingSec} DETIK
              </span>
            </div>
            <p className="mt-1.5 text-xs text-slate-200">
              Ketuk Hero favoritmu — karaktermu langsung muncul berbaris di proyektor!
            </p>
          </div>

          {/* 5 Pixel Hero Class Cards */}
          <div className="flex flex-col gap-2.5">
            {HERO_CLASS_LIST.map((hero) => {
              const selected = myHero?.selectedHero && myHeroClass === hero.id;
              return (
                <button
                  key={hero.id}
                  type="button"
                  data-testid={`select-hero-${hero.id}`}
                  onClick={() => handleSelectHero(hero.id)}
                  className={`pixel-btn flex items-center gap-3.5 border-2 p-3 text-left ${
                    selected
                      ? 'border-amber-300 bg-emerald-900/90 ring-2 ring-amber-300/60'
                      : 'border-emerald-500/35 bg-[#10212E] hover:border-emerald-400'
                  }`}
                >
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center border-2 border-slate-950 bg-[#08131B] p-1">
                    <img
                      src={selected ? heroPreviews[hero.id].attack : heroPreviews[hero.id].idle}
                      alt={hero.name}
                      className="pixelated h-14 w-14 object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-white">{hero.name}</span>
                      <span
                        className="border px-1.5 py-0.5 text-[10px] font-black text-slate-950"
                        style={{
                          backgroundColor: hero.accentColor,
                          borderColor: hero.accentColor,
                        }}
                      >
                        {hero.shortPerk}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-300">{hero.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 2. VICTORY / DEFEAT CELEBRATION BRIEF SCREEN
  // ========================================================
  if (gameState.phase === 'victory' || gameState.phase === 'defeat') {
    const isWin = gameState.phase === 'victory';
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#09131C] p-4 font-mono-num text-white">
        <div
          className={`pixel-panel w-full max-w-md border-4 p-6 text-center ${
            isWin ? 'border-amber-400 bg-[#0A2B22]' : 'border-rose-500 bg-[#2A0E16]'
          }`}
        >
          <img
            src={heroPreviews[myHeroClass].attack}
            alt={heroMeta.name}
            className="pixelated mx-auto h-24 w-24 object-contain"
          />
          <h1
            className={`mt-3 text-2xl font-black ${
              isWin ? 'text-amber-300' : 'text-rose-300'
            }`}
          >
            {isWin ? 'KEMENANGAN KELAS!' : 'PERTEMPURAN SELESAI!'}
          </h1>
          <p className="mt-1 text-xs text-slate-200">
            Menuju Podium Juara EduPlay RTH...
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/15 pt-4 text-sm font-extrabold">
            <div className="border border-white/15 bg-black/30 p-2">
              <p className="text-[10px] text-emerald-300">SKOR PRIBADI</p>
              <p className="text-lg text-amber-300">{myHero?.score || 0}</p>
            </div>
            <div className="border border-white/15 bg-black/30 p-2">
              <p className="text-[10px] text-emerald-300">BENAR</p>
              <p className="text-lg text-white">{myHero?.correctCount || 0}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 3. ACTIVE BATTLE CONTROLLER (RETRO 16-BIT RPG)
  // ========================================================
  const bossPct = Math.max(0, Math.min(100, (gameState.bossHp / Math.max(1, gameState.bossMaxHp)) * 100));
  const castlePct = Math.max(
    0,
    Math.min(100, (gameState.castleHp / Math.max(1, gameState.castleMaxHp)) * 100)
  );
  const isCharging = gameState.ultimate?.status === 'charging';
  const energy = myHero?.energy || 0;
  const healAmount = myHeroClass === 'healer' ? 120 : 60;
  const shieldAmount = myHeroClass === 'knight' ? 95 : 45;

  return (
    <div
      data-testid="boss-raid-player-battle"
      className="min-h-[calc(100vh-3.5rem)] bg-[#09131C] px-3 py-3 font-mono-num text-white"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        {/* BREAK PHASE URGENT FLASHING ALERT */}
        {isCharging && (
          <div className="pixel-panel animate-pulse border-2 border-amber-300 bg-rose-800 px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span>BOSS ULTIMATE! JAWAB CEPAT UNTUK BREAK!</span>
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-white">
              PROGRES BREAK: {gameState.ultimate.breakProgress}/{gameState.ultimate.breakTarget} ({gameState.ultimate.chargeRemainingSec}d)
            </p>
          </div>
        )}

        {/* RETRO RPG STATUS HEADER */}
        <div className="pixel-panel border-2 border-emerald-500/45 bg-[#0E202E] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-emerald-400/60 bg-slate-950">
                <img
                  src={energy > 0 ? heroPreviews[myHeroClass].attack : heroPreviews[myHeroClass].idle}
                  alt={heroMeta.name}
                  className="pixelated h-10 w-10 object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-white">{player.name}</p>
                <p className="text-[11px] font-bold" style={{ color: heroMeta.accentColor }}>
                  {heroMeta.name} · Streak x{myHero?.streak || 0}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="border border-amber-400/50 bg-slate-950 px-2.5 py-1 text-right">
                <p className="text-[9px] font-bold text-emerald-300">SKOR</p>
                <p className="text-sm font-black text-amber-300">{myHero?.score || 0}</p>
              </div>
              <div className="border border-emerald-400/50 bg-slate-950 px-2.5 py-1 text-right">
                <p className="text-[9px] font-bold text-emerald-300">ENERGI</p>
                <p className="text-sm font-black text-emerald-300">{energy}</p>
              </div>
            </div>
          </div>

          {/* Compact Boss & Castle Mini-Bars */}
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-2.5 text-[10px] font-extrabold">
            <div>
              <div className="mb-1 flex justify-between text-rose-300">
                <span className="truncate">{gameState.bossName}</span>
                <span>{Math.round(bossPct)}%</span>
              </div>
              <div className="h-2.5 w-full border border-slate-950 bg-slate-950">
                <div className="h-full bg-rose-500 transition-all" style={{ width: `${bossPct}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-emerald-300">
                <span>BENTENG ({gameState.castleShield} SHD)</span>
                <span>{Math.round(castlePct)}%</span>
              </div>
              <div className="h-2.5 w-full border border-slate-950 bg-slate-950">
                <div
                  className="h-full bg-emerald-400 transition-all"
                  style={{ width: `${castlePct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* INSTANT ACTION FEEDBACK STRIP */}
        {feedback && (
          <div
            className={`border-2 px-3 py-2 text-xs font-extrabold ${
              feedback.isCorrect
                ? 'border-emerald-400 bg-emerald-950/90 text-emerald-200'
                : 'border-rose-400 bg-rose-950/90 text-rose-200'
            }`}
          >
            &gt; {feedback.message}
          </div>
        )}

        {/* ACTION ENERGY MODE (3 LARGE PIXEL SKILL BUTTONS) OR QUESTION MODE */}
        {energy > 0 ? (
          <section
            data-testid="skill-action-panel"
            className="pixel-panel flex flex-col gap-3 border-2 border-amber-400 bg-[#0F2622] p-4"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-black text-amber-300">
                <Zap className="h-4 w-4 fill-current" />
                ENERGI AKSI SIAP ({energy})!
              </span>
              <span className="text-[11px] font-bold text-emerald-200">PILIH JURUSMU</span>
            </div>

            {/* 1. Primary Hero Skill */}
            <button
              type="button"
              data-testid="skill-btn-primary"
              onClick={() => handleUseSkill('primary')}
              className="pixel-btn flex min-h-[68px] items-center gap-3 border-2 border-amber-300 bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-3 text-left text-white hover:brightness-110"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-amber-200 bg-slate-950/60">
                {myHeroClass === 'mage' ? (
                  <Flame className="h-6 w-6 text-amber-300" />
                ) : (
                  <Swords className="h-6 w-6 text-amber-200" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase tracking-wide text-white">
                  JURUS UTAMA: {heroMeta.skillName}
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-amber-100">
                  {heroMeta.shortPerk}
                </p>
              </div>
            </button>

            {/* 2. Heal Castle */}
            <button
              type="button"
              data-testid="skill-btn-heal"
              onClick={() => handleUseSkill('heal')}
              className="pixel-btn flex min-h-[62px] items-center gap-3 border-2 border-emerald-300 bg-emerald-700 px-4 py-3 text-left text-white hover:bg-emerald-600"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-emerald-200 bg-slate-950/60">
                <Heart className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase text-white">
                  HEAL BENTENG (+{healAmount} HP)
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-emerald-100">
                  {myHeroClass === 'healer'
                    ? 'BONUS 2X TABIB AKTIF! Pulihkan HP Benteng super deras!'
                    : 'Pulihkan HP Benteng dari serangan Boss.'}
                </p>
              </div>
            </button>

            {/* 3. Shield Castle */}
            <button
              type="button"
              data-testid="skill-btn-shield"
              onClick={() => handleUseSkill('shield')}
              className="pixel-btn flex min-h-[62px] items-center gap-3 border-2 border-sky-300 bg-sky-700 px-4 py-3 text-left text-white hover:bg-sky-600"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-sky-200 bg-slate-950/60">
                <Shield className="h-5 w-5 text-sky-200" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase text-white">
                  PERISAI BENTENG (+{shieldAmount} SHIELD)
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-sky-100">
                  {myHeroClass === 'knight'
                    ? 'BONUS KSATRIA AKTIF! Perisai Benteng 2x lebih tebal!'
                    : 'Menahan serangan Ultimate & serangan balasan Boss.'}
                </p>
              </div>
            </button>
          </section>
        ) : (
          <section
            data-testid="question-dialog-panel"
            className="pixel-panel flex flex-col gap-3 border-2 border-emerald-400/60 bg-[#0E1E2B] p-4"
          >
            {question ? (
              <>
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Sparkles className="h-3.5 w-3.5" />
                    SOAL #{question.number}
                  </span>
                  <span className="border border-amber-400/50 bg-slate-950 px-2 py-0.5 text-amber-300">
                    {question.difficulty}
                  </span>
                </div>

                {/* Classic 16-bit RPG Question Box */}
                <div className="border-2 border-white/20 bg-slate-950 p-3.5">
                  <p className="font-sans text-base font-bold leading-snug text-white">
                    {question.text}
                  </p>
                </div>

                {/* 4 Big Retro Answer Buttons */}
                <div className="flex flex-col gap-2.5">
                  {question.options.map((opt: string, idx: number) => {
                    const st = OPTION_STYLES[idx] || OPTION_STYLES[0];
                    return (
                      <button
                        key={`${question.id}-${idx}`}
                        type="button"
                        data-testid={`answer-opt-${idx}`}
                        onClick={() => handleSubmitAnswer(idx)}
                        className={`pixel-btn flex min-h-[54px] items-center gap-3 border-2 px-3.5 py-2.5 text-left text-white ${st.bg}`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-white/40 bg-black/35 text-sm font-black">
                          {st.letter}
                        </span>
                        <span className="font-sans text-sm font-bold leading-snug">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-emerald-200">Menyiapkan soal berikutnya...</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
