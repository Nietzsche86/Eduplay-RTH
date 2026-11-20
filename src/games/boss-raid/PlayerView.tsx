import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Eye,
  Flame,
  Heart,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from 'lucide-react';
import type { BossType, PlayerGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';
import {
  HERO_CLASS_LIST,
  HERO_CLASS_MAP,
  getBossPreviewDataUrl,
  getHeroPreviewDataUrl,
  type HeroClassId,
} from './pixelSprites';

const OPTION_STYLES = [
  { letter: 'A', bg: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-400' },
  { letter: 'B', bg: 'bg-sky-700 hover:bg-sky-600 border-sky-400' },
  { letter: 'C', bg: 'bg-amber-600 hover:bg-amber-500 border-amber-300' },
  { letter: 'D', bg: 'bg-purple-700 hover:bg-purple-600 border-purple-400' },
];

function triggerHaptic(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore on browsers without vibration support
    }
  }
}

interface ImpactBeat {
  id: number;
  kind: 'attack' | 'heal' | 'shield';
  label: string;
  sublabel: string;
  isCrit?: boolean;
}

export function BossRaidPlayer({ socket, roomCode, player, gameState }: PlayerGameProps) {
  const lastFeedbackIdRef = useRef<number>(
    gameState?.playerFeedback?.[player.playerId]?.id || 0
  );
  const lastUltSeqRef = useRef<number>(0);
  const impactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [impactBeat, setImpactBeat] = useState<ImpactBeat | null>(null);
  const [phoneShake, setPhoneShake] = useState(false);
  const [myBeamTaps, setMyBeamTaps] = useState(0);

  // Cleanup timers only on component unmount so periodic 1s server ticks never freeze impactBeat!
  useEffect(() => {
    return () => {
      if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    };
  }, []);

  const myHero = useMemo(() => {
    const list: any[] = gameState?.heroes || [];
    return list.find((h) => h.playerId === player.playerId) || null;
  }, [gameState?.heroes, player.playerId]);

  const myHeroClass: HeroClassId = (myHero?.heroClass || 'knight') as HeroClassId;
  const heroMeta = HERO_CLASS_MAP[myHeroClass] || HERO_CLASS_MAP.knight;
  const bossType: BossType = (gameState?.bossType || 'inferno-dragon') as BossType;
  const question = gameState?.playerQuestions?.[player.playerId] || null;
  const feedback = gameState?.playerFeedback?.[player.playerId] || null;

  // Pre-compute crisp pixel preview URLs offline (Heroes + active Boss)
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

  const bossPreviews = useMemo(
    () => ({
      idle: getBossPreviewDataUrl(bossType, 'idle', 3),
      attack: getBossPreviewDataUrl(bossType, 'attack', 3),
    }),
    [bossType]
  );

  // Reset personal Mega Beam tap counter when cinematic ends
  useEffect(() => {
    if (!gameState?.cinematic || gameState.cinematic.kind !== 'mega_beam') {
      setMyBeamTaps(0);
    }
  }, [gameState?.cinematic?.kind]);

  // Trigger dramatic phone shake & haptic rumble when Boss Ultimate hits Castle!
  useEffect(() => {
    const events: any[] = gameState?.events || [];
    for (const evt of events) {
      if (evt.type === 'boss_ultimate_hit' && evt.seq > lastUltSeqRef.current) {
        lastUltSeqRef.current = evt.seq;
        triggerHaptic([95, 35, 110]);
        setPhoneShake(true);
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
        shakeTimerRef.current = setTimeout(() => {
          setPhoneShake(false);
          shakeTimerRef.current = null;
        }, 520);
        break;
      }
    }
  }, [gameState?.events]);

  // Audio + Action Impact Beat + Haptic Feedback (keyed strictly by primitive feedback.id!)
  const feedbackId = feedback?.id ?? 0;
  useEffect(() => {
    if (!feedbackId || feedbackId === lastFeedbackIdRef.current || !feedback) return;
    lastFeedbackIdRef.current = feedbackId;

    const scheduleImpactClear = (ms: number) => {
      if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
      impactTimerRef.current = setTimeout(() => {
        setImpactBeat(null);
        impactTimerRef.current = null;
      }, ms);
    };

    if (feedback.kind === 'answer_correct') {
      sound.play('correct');
      triggerHaptic(22);
      // Immediately clear any lingering impact beat so skill buttons show right away
      if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
      setImpactBeat(null);
    } else if (feedback.kind === 'answer_wrong') {
      sound.play('wrong');
      triggerHaptic([45, 30, 45]);
      if (impactTimerRef.current) clearTimeout(impactTimerRef.current);
      setImpactBeat(null);
    } else if (feedback.kind === 'skill_attack') {
      sound.play(
        feedback.isCritical
          ? 'crit'
          : myHeroClass === 'mage'
            ? 'fireball'
            : myHeroClass === 'archer'
              ? 'arrow'
              : myHeroClass === 'healer'
                ? 'heal'
                : 'slash'
      );
      triggerHaptic(feedback.isCritical ? [35, 25, 75] : [30, 20, 45]);
      setImpactBeat({
        id: feedbackId,
        kind: 'attack',
        label: feedback.isCritical
          ? `CRIT -${feedback.damage || 120}!`
          : `-${feedback.damage || 80} HP!`,
        sublabel: feedback.message,
        isCrit: Boolean(feedback.isCritical),
      });
      scheduleImpactClear(1000);
    } else if (feedback.kind === 'skill_heal') {
      sound.play('heal');
      triggerHaptic([28, 20, 35]);
      setImpactBeat({
        id: feedbackId,
        kind: 'heal',
        label: `+${feedback.amount || 65} HP!`,
        sublabel: feedback.message,
      });
      scheduleImpactClear(900);
    } else if (feedback.kind === 'skill_shield') {
      sound.play('shield');
      triggerHaptic([28, 20, 35]);
      setImpactBeat({
        id: feedbackId,
        kind: 'shield',
        label: `+${feedback.amount || 45} SHIELD!`,
        sublabel: feedback.message,
      });
      scheduleImpactClear(900);
    }
  }, [feedbackId, myHeroClass]);

  if (!gameState) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-[#09131C] p-6 font-mono-num text-sm font-bold text-emerald-300">
        MEMASUKI DUNIA PIXEL HEROES...
      </div>
    );
  }

  const handleSelectHero = (heroClass: HeroClassId) => {
    sound.play('click');
    triggerHaptic(18);
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

  const handleMegaBeamTap = () => {
    sound.play('click');
    triggerHaptic(16);
    setMyBeamTaps((c) => c + 1);
    socket.emit('player:game_action', {
      roomCode,
      playerId: player.playerId,
      action: { type: 'beam_tap' },
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
                      className="pixelated anim-pixel-breathe h-14 w-14 object-contain"
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
  // 2. VICTORY / DEFEATED DRAMATIC END SCENE
  // ========================================================
  if (gameState.phase === 'victory' || gameState.phase === 'defeat') {
    const isWin = gameState.phase === 'victory';
    return (
      <div
        data-testid={isWin ? 'player-victory-scene' : 'player-defeated-scene'}
        className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-[#09131C] p-4 font-mono-num text-white"
      >
        <div
          className={`pixel-panel w-full max-w-md border-4 p-6 text-center ${
            isWin
              ? 'border-amber-400 bg-gradient-to-b from-[#0A3A2B] to-[#071D17]'
              : 'border-rose-500 bg-gradient-to-b from-[#3B0D18] to-[#1A070D]'
          }`}
        >
          <img
            src={heroPreviews[myHeroClass].attack}
            alt={heroMeta.name}
            className="pixelated anim-pixel-breathe mx-auto h-24 w-24 object-contain"
          />
          <h1
            className={`mt-3 text-4xl font-black tracking-widest ${
              isWin ? 'text-amber-300' : 'text-rose-400'
            }`}
          >
            {isWin ? 'VICTORY!' : 'DEFEATED'}
          </h1>
          <p className="mt-1.5 text-sm font-extrabold text-white">
            {isWin
              ? `Selamat! ${gameState.bossName} berhasil dikalahkan!`
              : `Benteng runtuh! ${gameState.bossName} berhasil bertahan.`}
          </p>
          <p className="mt-1 text-xs text-slate-300">Menuju Podium Juara EduPlay RTH...</p>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/15 pt-4 text-sm font-extrabold">
            <div className="border border-white/15 bg-black/35 p-2">
              <p className="text-[10px] text-emerald-300">SKOR PRIBADI</p>
              <p className="text-lg text-amber-300">{myHero?.score || 0}</p>
            </div>
            <div className="border border-white/15 bg-black/35 p-2">
              <p className="text-[10px] text-emerald-300">BENAR</p>
              <p className="text-lg text-white">{myHero?.correctCount || 0}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // 3. ACTIVE BATTLE CONTROLLER (MINI PIXEL ARENA + RETRO RPG)
  // ========================================================
  const bossPct = Math.max(
    0,
    Math.min(100, (gameState.bossHp / Math.max(1, gameState.bossMaxHp)) * 100)
  );
  const castlePct = Math.max(
    0,
    Math.min(100, (gameState.castleHp / Math.max(1, gameState.castleMaxHp)) * 100)
  );
  const isCharging = gameState.ultimate?.status === 'charging';
  const energy = myHero?.energy || 0;
  const healAmount = myHeroClass === 'healer' ? 130 : 65;
  const shieldAmount = myHeroClass === 'knight' ? 100 : 45;
  const activeCinematic = gameState.cinematic;
  const isMyClassSynced = Boolean(gameState.classSync?.classes?.includes(myHeroClass));
  const activeMinionCount = Array.isArray(gameState.minions) ? gameState.minions.length : 0;

  return (
    <div
      data-testid="boss-raid-player-battle"
      className={`min-h-[calc(100vh-3.5rem)] bg-[#09131C] px-3 py-2.5 font-mono-num text-white ${
        phoneShake ? 'anim-phone-shake ring-4 ring-inset ring-rose-500' : ''
      }`}
    >
      <div className="mx-auto flex max-w-lg flex-col gap-2.5">
        {/* BREAK PHASE URGENT FLASHING ALERT */}
        {isCharging && !activeCinematic && (
          <div className="pixel-panel animate-pulse border-2 border-amber-300 bg-rose-800 px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-1.5 text-xs font-black text-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span>BOSS ULTIMATE! JAWAB CEPAT UNTUK BREAK!</span>
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-white">
              PROGRES BREAK: {gameState.ultimate.breakProgress}/{gameState.ultimate.breakTarget} (
              {gameState.ultimate.chargeRemainingSec}d)
            </p>
          </div>
        )}

        {/* LIVE MINI PIXEL BATTLE ARENA ON STUDENT PHONE! */}
        <section
          data-testid="student-mini-arena"
          className={`pixel-panel relative overflow-hidden border-2 p-2.5 ${
            gameState.bossEnraged
              ? 'border-rose-500/80 bg-gradient-to-b from-[#3B0B17] via-[#591220] to-[#1E293B]'
              : 'border-emerald-500/50 bg-gradient-to-b from-[#0C2138] via-[#134053] to-[#1E293B]'
          }`}
        >
          {/* Top Compact Info Strip */}
          <div className="flex items-center justify-between gap-2 text-[10px] font-black">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="truncate text-white">{player.name}</span>
              <span style={{ color: heroMeta.accentColor }}>({heroMeta.name})</span>
              {gameState.castleBurning && (
                <span className="border border-orange-400 bg-orange-600 px-1 text-[9px] text-white">
                  BURN!
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="border border-amber-400/50 bg-slate-950/90 px-1.5 py-0.5 text-amber-300">
                SKOR {myHero?.score || 0}
              </span>
              <span className="border border-emerald-400/50 bg-slate-950/90 px-1.5 py-0.5 text-emerald-300">
                ⚡{energy}
              </span>
            </div>
          </div>

          {/* Animated Hero vs Mini-Boss Pixel Stage */}
          <div className="relative mt-1.5 flex h-[86px] items-end justify-between border-b-4 border-emerald-600/80 px-4 pb-1">
            {/* Hero Sprite (Left) */}
            <div className="relative flex flex-col items-center">
              <img
                key={impactBeat ? `hero-${impactBeat.id}` : 'hero-idle'}
                src={
                  impactBeat || energy > 0
                    ? heroPreviews[myHeroClass].attack
                    : heroPreviews[myHeroClass].idle
                }
                alt={heroMeta.name}
                className={`pixelated h-14 w-14 object-contain ${
                  impactBeat?.kind === 'attack'
                    ? 'anim-hero-lunge'
                    : impactBeat
                      ? 'anim-hero-cast'
                      : 'anim-pixel-breathe'
                }`}
              />
              {impactBeat?.kind === 'heal' && (
                <span className="anim-damage-pop pointer-events-none absolute -top-2 left-1/2 whitespace-nowrap text-xs font-black text-emerald-300">
                  {impactBeat.label}
                </span>
              )}
              {impactBeat?.kind === 'shield' && (
                <span className="anim-damage-pop pointer-events-none absolute -top-2 left-1/2 whitespace-nowrap text-xs font-black text-sky-300">
                  {impactBeat.label}
                </span>
              )}
            </div>

            {/* Center Dynamic Status / Slash Burst */}
            <div className="flex flex-col items-center justify-center self-center text-center">
              {impactBeat?.kind === 'attack' ? (
                <div
                  key={`burst-${impactBeat.id}`}
                  className="anim-slash-burst border-2 border-amber-300 bg-amber-400/20 px-2 py-0.5 text-[11px] font-black text-amber-200"
                >
                  {impactBeat.isCrit ? '💥 CRIT!' : '⚔️ HIT!'}
                </div>
              ) : (
                <span className="text-[10px] font-black tracking-widest text-emerald-200/80">
                  VS
                </span>
              )}
              {activeMinionCount > 0 && (
                <span className="mt-1 border border-amber-400 bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                  MINION x{activeMinionCount}
                </span>
              )}
            </div>

            {/* Mini Boss Sprite (Right) */}
            <div className="relative flex flex-col items-center">
              <img
                key={impactBeat?.kind === 'attack' ? `boss-${impactBeat.id}` : 'boss-idle'}
                src={
                  isCharging || gameState.bossEnraged ? bossPreviews.attack : bossPreviews.idle
                }
                alt={gameState.bossName}
                className={`pixelated h-[76px] w-[76px] object-contain ${
                  impactBeat?.kind === 'attack' ? 'anim-boss-hit' : 'anim-pixel-breathe'
                }`}
              />
              {impactBeat?.kind === 'attack' && (
                <span
                  key={`dmg-${impactBeat.id}`}
                  className={`anim-damage-pop pointer-events-none absolute top-3 left-1/2 whitespace-nowrap text-sm font-black drop-shadow-[0_2px_2px_rgba(0,0,0,0.95)] ${
                    impactBeat.isCrit ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {impactBeat.label}
                </span>
              )}
              {gameState.bossStunned && (
                <span className="absolute -top-1 right-0 border border-emerald-300 bg-emerald-600 px-1 text-[9px] font-black text-white">
                  STUN!
                </span>
              )}
              {gameState.bossArmorActive && !gameState.bossStunned && (
                <span className="absolute -top-1 right-0 border border-amber-300 bg-amber-600 px-1 text-[9px] font-black text-slate-950">
                  ARMOR
                </span>
              )}
            </div>
          </div>

          {/* Dual Mini Bars (Boss & Castle) */}
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-extrabold">
            <div>
              <div className="mb-0.5 flex justify-between text-emerald-300">
                <span>BENTENG ({gameState.castleShield} SHD)</span>
                <span>{Math.round(castlePct)}%</span>
              </div>
              <div className="h-2 w-full border border-slate-950 bg-slate-950">
                <div
                  className={`h-full transition-all ${
                    castlePct <= 30 ? 'bg-rose-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${castlePct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex justify-between text-rose-300">
                <span className="truncate">{gameState.bossName}</span>
                <span>{Math.round(bossPct)}%</span>
              </div>
              <div className="h-2 w-full border border-slate-950 bg-slate-950">
                <div
                  className="h-full bg-rose-500 transition-all"
                  style={{ width: `${bossPct}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* TEAM LIVE TOAST (Class-wide camaraderie) */}
        {gameState.teamToast && (
          <div className="border border-emerald-400/40 bg-[#0D232A] px-2.5 py-1.5 text-[11px] font-bold text-emerald-200">
            <span className="text-amber-300">★ TIM:</span> {gameState.teamToast.message}
          </div>
        )}

        {/* SYNCHRONIZED "LIHAT PROYEKTOR!" CUTSCENE OR MEGA BEAM QTE TAP-TO-BOOST */}
        {activeCinematic ? (
          activeCinematic.kind === 'mega_beam' ? (
            <section
              data-testid="mega-beam-qte-card"
              className="pixel-panel flex flex-col items-center gap-3 border-4 border-amber-300 bg-gradient-to-b from-emerald-900 to-[#08261E] p-5 text-center"
            >
              <div className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-400 px-3 py-1 text-xs font-black text-slate-950">
                <Eye className="h-4 w-4" />
                <span>LIHAT PROYEKTOR &amp; TAP HP!</span>
              </div>
              <h2 className="text-xl font-black text-amber-200">MEGA PIXEL BEAM 100%!</h2>
              <p className="text-xs font-bold text-emerald-100">
                Tap secepatnya bersama teman sekelas untuk memperbesar laser raksasa!
              </p>

              <button
                type="button"
                data-testid="mega-beam-tap-btn"
                onClick={handleMegaBeamTap}
                className="pixel-btn flex min-h-[112px] w-full flex-col items-center justify-center gap-1 border-4 border-amber-200 bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 px-4 py-4 text-slate-950 active:scale-95"
              >
                <Zap className="h-9 w-9 fill-current" />
                <span className="text-lg font-black uppercase">TAP CEPAT! BOOST LASER!</span>
                <span className="text-xs font-extrabold">
                  TAP-MU: {myBeamTaps}x · BOOST KELAS: {activeCinematic.tapCount}x
                </span>
              </button>
            </section>
          ) : (
            <section
              data-testid="projector-cutscene-card"
              className={`pixel-panel flex flex-col items-center gap-2.5 border-4 p-6 text-center ${
                activeCinematic.kind === 'boss_break'
                  ? 'border-emerald-300 bg-emerald-950'
                  : 'border-rose-400 bg-rose-950'
              }`}
            >
              <div className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-400 px-3 py-1 text-xs font-black text-slate-950">
                <Eye className="h-4 w-4" />
                <span>LIHAT LAYAR PROYEKTOR!</span>
              </div>
              <h2 className="text-xl font-black text-amber-200">{activeCinematic.title}</h2>
              <p className="text-xs font-bold text-white">{activeCinematic.subtitle}</p>
            </section>
          )
        ) : impactBeat ? (
          /* 1.05s ACTION IMPACT BEAT PANEL (Let students enjoy their Hero's hit!) */
          <section
            data-testid="action-impact-panel"
            className={`pixel-panel flex min-h-[180px] flex-col items-center justify-center gap-2 border-4 p-5 text-center ${
              impactBeat.kind === 'attack'
                ? 'border-amber-300 bg-gradient-to-b from-amber-950 to-[#18140C]'
                : impactBeat.kind === 'heal'
                  ? 'border-emerald-300 bg-emerald-950'
                  : 'border-sky-300 bg-sky-950'
            }`}
          >
            <p className="text-xs font-black tracking-widest text-amber-300">
              {impactBeat.kind === 'attack'
                ? 'JURUS MENGHANTAM BOSS!'
                : impactBeat.kind === 'heal'
                  ? 'GELOMBANG HEAL AKTIF!'
                  : 'PERISAI BENTENG DIPERKUAT!'}
            </p>
            <p className="text-3xl font-black text-white">{impactBeat.label}</p>
            <p className="text-xs font-bold text-slate-200">{impactBeat.sublabel}</p>
          </section>
        ) : energy > 0 ? (
          /* ACTION ENERGY MODE: 3 LARGE RETRO PIXEL SKILL BUTTONS */
          <section
            data-testid="skill-action-panel"
            className="pixel-panel flex flex-col gap-2.5 border-2 border-amber-400 bg-[#0F2622] p-3.5"
          >
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-sm font-black text-amber-300">
                <Zap className="h-4 w-4 fill-current" />
                ENERGI AKSI SIAP ({energy})!
              </span>
              <span className="text-[11px] font-bold text-emerald-200">PILIH JURUSMU</span>
            </div>

            {isMyClassSynced && (
              <div className="animate-pulse border-2 border-amber-300 bg-amber-400 px-3 py-1 text-center text-xs font-black text-slate-950">
                ⚡ BONUS 2X CLASS-SYNC AKTIF UNTUK {heroMeta.name.toUpperCase()}!
              </div>
            )}

            {/* 1. Primary Hero Skill */}
            <button
              type="button"
              data-testid="skill-btn-primary"
              onClick={() => handleUseSkill('primary')}
              className={`pixel-btn flex min-h-[66px] items-center gap-3 border-2 px-3.5 py-2.5 text-left text-white hover:brightness-110 ${
                isMyClassSynced
                  ? 'border-yellow-200 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 ring-2 ring-amber-300'
                  : 'border-amber-300 bg-gradient-to-r from-amber-600 to-orange-600'
              }`}
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
                  {activeMinionCount > 0
                    ? `Menyerang Minion & Boss! ${heroMeta.shortPerk}`
                    : heroMeta.shortPerk}
                </p>
              </div>
            </button>

            {/* 2. Heal Castle */}
            <button
              type="button"
              data-testid="skill-btn-heal"
              onClick={() => handleUseSkill('heal')}
              className="pixel-btn flex min-h-[60px] items-center gap-3 border-2 border-emerald-300 bg-emerald-700 px-3.5 py-2.5 text-left text-white hover:bg-emerald-600"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-emerald-200 bg-slate-950/60">
                <Heart className="h-5 w-5 text-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black uppercase text-white">
                  HEAL BENTENG (+{healAmount} HP)
                </p>
                <p className="mt-0.5 text-[11px] font-bold text-emerald-100">
                  {gameState.castleBurning
                    ? '🔥 PADAMKAN BARA API BENTENG SEKARANG!'
                    : myHeroClass === 'healer'
                      ? 'BONUS 2X TABIB AKTIF! Pulihkan Benteng super deras!'
                      : 'Pulihkan HP Benteng dari serangan Boss.'}
                </p>
              </div>
            </button>

            {/* 3. Shield Castle */}
            <button
              type="button"
              data-testid="skill-btn-shield"
              onClick={() => handleUseSkill('shield')}
              className="pixel-btn flex min-h-[60px] items-center gap-3 border-2 border-sky-300 bg-sky-700 px-3.5 py-2.5 text-left text-white hover:bg-sky-600"
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
          /* QUESTION DIALOG PANEL */
          <section
            data-testid="question-dialog-panel"
            className="pixel-panel flex flex-col gap-2.5 border-2 border-emerald-400/60 bg-[#0E1E2B] p-3.5"
          >
            {feedback && !feedback.isCorrect && (
              <div className="border border-rose-400 bg-rose-950/90 px-2.5 py-1.5 text-[11px] font-bold text-rose-200">
                &gt; {feedback.message}
              </div>
            )}

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

                <div className="border-2 border-white/20 bg-slate-950 p-3">
                  <p className="font-sans text-base font-bold leading-snug text-white">
                    {question.text}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {question.options.map((opt: string, idx: number) => {
                    const st = OPTION_STYLES[idx] || OPTION_STYLES[0];
                    return (
                      <button
                        key={`${question.id}-${idx}`}
                        type="button"
                        data-testid={`answer-opt-${idx}`}
                        onClick={() => handleSubmitAnswer(idx)}
                        className={`pixel-btn flex min-h-[52px] items-center gap-3 border-2 px-3 py-2 text-left text-white ${st.bg}`}
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
              <p className="py-8 text-center text-sm text-emerald-200">
                Menyiapkan soal berikutnya...
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
