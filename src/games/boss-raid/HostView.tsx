import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Flame,
  Maximize2,
  Minimize2,
  Play,
  Shield,
  Sparkles,
  Square,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import type { BossType, HostGameProps } from '../../types/platform';
import { sound } from '../../utils/sound';
import {
  BOSS_META_MAP,
  HERO_CLASS_MAP,
  getBossSpriteCanvas,
  getHeroSpriteCanvas,
  getPropSpriteCanvas,
  type HeroClassId,
} from './pixelSprites';

const LOGICAL_W = 1160;
const LOGICAL_H = 550;
const GROUND_Y = 468;
const CASTLE_X = 92;
const CASTLE_Y = 398;
const BOSS_HOME_X = 945;
const BOSS_HOME_Y = 356;
const MAX_PARTICLES = 320;

// Smooth cinematic easing curves (zero stiff linear movement)
function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

interface Afterimage {
  x: number;
  y: number;
  alpha: number;
  scaleX: number;
  scaleY: number;
}

interface HeroActor {
  playerId: string;
  name: string;
  heroClass: HeroClassId;
  selectedHero: boolean;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  tilt: number;
  state: 'idle' | 'windup' | 'dash_in' | 'attack_hold' | 'dash_back' | 'cast' | 'celebrate';
  stateTimer: number;
  stateDuration: number;
  targetX: number;
  targetY: number;
  firstHitDamage: number;
  firstHitCrit: boolean;
  firstHitBonusShield: number;
  firstHitFired: boolean;
  doubleHitPending: boolean;
  secondHitDamage: number;
  secondHitCrit: boolean;
  bobOffset: number;
  jumpPhase: number;
  afterimages: Afterimage[];
  afterimageAccum: number;
}

interface Projectile {
  active: boolean;
  kind: 'fireball' | 'arrow' | 'holy_orb' | 'heart' | 'shield';
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  arcHeight: number;
  color: string;
  trailColor: string;
  onImpactDamage?: number;
  onImpactCrit?: boolean;
  onImpactLabel?: string;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

interface SlashEffect {
  x: number;
  y: number;
  color: string;
  angle: number;
  life: number;
  maxLife: number;
  radius: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  lineWidth: number;
  life: number;
  maxLife: number;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  maxLife: number;
  gravity: number;
}

interface BeamEffect {
  kind: 'mega_beam' | 'boss_ult';
  life: number;
  maxLife: number;
  color: string;
  coreColor: string;
  boostScale: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
}

function getHeroFormationPos(index: number, total: number): { x: number; y: number } {
  const rows = total <= 4 ? 2 : 3;
  const cols = Math.max(1, Math.ceil(total / rows));
  const row = index % rows;
  const col = Math.floor(index / rows);
  const xMin = 212;
  const xMax = 555;
  const colSpacing = cols > 1 ? Math.min(72, (xMax - xMin) / Math.max(1, cols - 1)) : 0;
  const rowStagger = (row % 2) * 26;
  const x = Math.round(xMin + col * colSpacing + rowStagger);
  const yStart = rows === 2 ? 474 : 458;
  const yGap = rows === 2 ? 32 : 24;
  const y = Math.round(yStart + row * yGap);
  return { x, y };
}

export function BossRaidHost({
  socket,
  roomCode,
  gameState,
  onForceEnd,
  isFullscreen = false,
  onToggleFullscreen,
}: HostGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameStateRef = useRef<any>(gameState);
  gameStateRef.current = gameState;

  const lastProcessedSeqRef = useRef<number>(0);
  const [ghostBossPct, setGhostBossPct] = useState(100);
  const [ghostCastlePct, setGhostCastlePct] = useState(100);

  useEffect(() => {
    if (!gameState) return;
    const bossPct = Math.max(
      0,
      Math.min(100, (gameState.bossHp / Math.max(1, gameState.bossMaxHp)) * 100)
    );
    const castlePct = Math.max(
      0,
      Math.min(100, (gameState.castleHp / Math.max(1, gameState.castleMaxHp)) * 100)
    );
    const t = setTimeout(() => {
      setGhostBossPct(bossPct);
      setGhostCastlePct(castlePct);
    }, 280);
    return () => clearTimeout(t);
  }, [gameState?.bossHp, gameState?.bossMaxHp, gameState?.castleHp, gameState?.castleMaxHp]);

  const hasGameState = Boolean(gameState);

  // Isolated 60fps HTML5 Canvas 2D Simulation & Cinematic Renderer
  useEffect(() => {
    if (!hasGameState) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) return;
    const g: CanvasRenderingContext2D = rawCtx;

    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;

    const particles: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 4,
      color: '#FFFFFF',
      life: 0,
      maxLife: 1,
      gravity: 0,
    }));
    let particleCursor = 0;

    function spawnParticle(
      x: number,
      y: number,
      vx: number,
      vy: number,
      color: string,
      size: number,
      maxLife: number,
      gravity = 240
    ) {
      const p = particles[particleCursor];
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.color = color;
      p.size = size;
      p.life = maxLife;
      p.maxLife = maxLife;
      p.gravity = gravity;
    }

    function spawnBurst(x: number, y: number, colors: string[], count: number, speed = 200) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
        const mag = speed * (0.45 + Math.random() * 0.85);
        spawnParticle(
          x + (Math.random() - 0.5) * 16,
          y + (Math.random() - 0.5) * 16,
          Math.cos(angle) * mag,
          Math.sin(angle) * mag - 50,
          colors[i % colors.length],
          Math.random() > 0.35 ? 5 : 3,
          0.35 + Math.random() * 0.48,
          290
        );
      }
    }

    const stars: Star[] = Array.from({ length: 48 }, (_, i) => ({
      x: ((i * 73 + 19) % (LOGICAL_W - 40)) + 20,
      y: ((i * 41 + 13) % 168) + 14,
      size: i % 4 === 0 ? 3 : 2,
      phase: i * 0.85,
    }));

    const clouds: Cloud[] = [
      { x: 90, y: 74, w: 96, speed: 13 },
      { x: 370, y: 52, w: 124, speed: 9 },
      { x: 640, y: 88, w: 108, speed: 16 },
      { x: 840, y: 60, w: 88, speed: 11 },
    ];

    const actors = new Map<string, HeroActor>();
    const projectiles: Projectile[] = [];
    const floatingTexts: FloatingText[] = [];
    const slashEffects: SlashEffect[] = [];
    const shockwaves: ShockwaveRing[] = [];
    const beams: BeamEffect[] = [];

    let trauma = 0;
    let hitstopTimer = 0;
    let bossFlashTimer = 0;
    let bossRecoilX = 0;
    let bossLungeX = 0;
    let bossSquash = 0;
    let bossAttackAnimTimer = 0;
    let bossExploded = false;
    let castleFlashTimer = 0;
    let screenFlashAlpha = 0;
    let screenFlashColor = '#FFFFFF';
    let speedlineAlpha = 0;
    let speedlineColor = '#34D399';
    let enragedBlend = 0;
    let emberSpawnAccum = 0;
    let elapsed = 0;
    let lastTs = performance.now();
    let rafId = 0;

    function triggerScreenFlash(color: string, alpha: number) {
      screenFlashColor = color;
      screenFlashAlpha = Math.max(screenFlashAlpha, alpha);
    }

    function addShockwave(
      x: number,
      y: number,
      maxRadius: number,
      color: string,
      lineWidth = 6,
      duration = 0.36
    ) {
      shockwaves.push({
        x,
        y,
        radius: 12,
        maxRadius,
        color,
        lineWidth,
        life: duration,
        maxLife: duration,
      });
    }

    function addFloatingText(
      x: number,
      y: number,
      text: string,
      color: string,
      scale = 1
    ) {
      floatingTexts.push({
        x,
        y,
        vy: -64,
        text,
        color,
        scale,
        life: 1.08,
        maxLife: 1.08,
      });
    }

    function hitBossVisual(damage: number, isCrit: boolean, labelPrefix = '') {
      bossFlashTimer = isCrit ? 0.12 : 0.075;
      bossRecoilX = isCrit ? 28 : 15;
      bossSquash = isCrit ? 0.24 : 0.12;
      trauma = Math.min(1, trauma + (isCrit ? 0.62 : 0.3));

      addShockwave(
        BOSS_HOME_X - 24,
        BOSS_HOME_Y + 6,
        isCrit ? 128 : 74,
        isCrit ? '#FEF08A' : '#38BDF8',
        isCrit ? 8 : 5,
        isCrit ? 0.42 : 0.28
      );

      if (isCrit) {
        hitstopTimer = 0.055;
        triggerScreenFlash('#FEF9C3', 0.34);
        sound.play('crit');
      }

      spawnBurst(
        BOSS_HOME_X - 24,
        BOSS_HOME_Y + 6,
        isCrit
          ? ['#FEF08A', '#F97316', '#FFFFFF', '#EF4444']
          : ['#FFFFFF', '#FBBF24', '#38BDF8'],
        isCrit ? 28 : 15,
        isCrit ? 270 : 185
      );
      const label = labelPrefix
        ? `${labelPrefix} -${damage}`
        : isCrit
          ? `CRIT -${damage}!`
          : `-${damage}`;
      addFloatingText(
        BOSS_HOME_X - 28 + (Math.random() - 0.5) * 48,
        BOSS_HOME_Y - 62 + (Math.random() - 0.5) * 22,
        label,
        isCrit ? '#FEF08A' : '#FFFFFF',
        isCrit ? 1.45 : 1.1
      );
    }

    function syncActorsFromState(st: any) {
      if (!st || !Array.isArray(st.heroes)) return;
      const seen = new Set<string>();
      const total = st.heroes.length;

      st.heroes.forEach((h: any, idx: number) => {
        seen.add(h.playerId);
        const pos = getHeroFormationPos(idx, total);
        const existing = actors.get(h.playerId);
        if (!existing) {
          actors.set(h.playerId, {
            playerId: h.playerId,
            name: h.name,
            heroClass: (h.heroClass || 'knight') as HeroClassId,
            selectedHero: Boolean(h.selectedHero),
            homeX: pos.x,
            homeY: pos.y,
            x: pos.x,
            y: pos.y,
            scaleX: 1,
            scaleY: 1,
            tilt: 0,
            state: 'idle',
            stateTimer: 0,
            stateDuration: 0,
            targetX: pos.x,
            targetY: pos.y,
            firstHitDamage: 0,
            firstHitCrit: false,
            firstHitBonusShield: 0,
            firstHitFired: true,
            doubleHitPending: false,
            secondHitDamage: 0,
            secondHitCrit: false,
            bobOffset: idx * 0.9,
            jumpPhase: 0,
            afterimages: [],
            afterimageAccum: 0,
          });
        } else {
          existing.name = h.name;
          existing.heroClass = (h.heroClass || 'knight') as HeroClassId;
          existing.selectedHero = Boolean(h.selectedHero);
          existing.homeX = pos.x;
          existing.homeY = pos.y;
          if (existing.state === 'idle') {
            existing.x += (pos.x - existing.x) * 0.16;
            existing.y += (pos.y - existing.y) * 0.16;
          }
        }
      });

      for (const id of actors.keys()) {
        if (!seen.has(id)) actors.delete(id);
      }
    }

    function processIncomingEvents(st: any) {
      if (!st || !Array.isArray(st.events)) return;
      for (const evt of st.events) {
        if (evt.seq <= lastProcessedSeqRef.current) continue;
        lastProcessedSeqRef.current = evt.seq;

        if (evt.type === 'hero_selected') {
          sound.play('click');
          const actor = actors.get(evt.playerId);
          if (actor) {
            actor.scaleX = 1.25;
            actor.scaleY = 0.78;
            addShockwave(actor.x, actor.y - 16, 46, '#34D399', 4, 0.28);
            spawnBurst(actor.x, actor.y - 16, ['#34D399', '#FBBF24', '#FFFFFF'], 14, 140);
          }
        } else if (evt.type === 'hero_attack') {
          const actor = actors.get(evt.playerId);
          const heroClass = (evt.heroClass || 'knight') as HeroClassId;
          const meta = HERO_CLASS_MAP[heroClass] || HERO_CLASS_MAP.knight;
          const hits: number[] =
            Array.isArray(evt.hits) && evt.hits.length > 0 ? evt.hits : [evt.damage || 80];

          if (actor && (meta.attackStyle === 'melee_dash' || meta.attackStyle === 'double_dash')) {
            // Smooth anticipation windup -> spring dash -> slash impact -> acrobatic return
            actor.state = 'windup';
            actor.stateTimer = 0;
            actor.stateDuration = 0.09;
            actor.targetX = BOSS_HOME_X - 118;
            actor.targetY = BOSS_HOME_Y + 46 + (Math.random() - 0.5) * 34;
            actor.firstHitDamage = hits[0];
            actor.firstHitCrit = Boolean(evt.isCritical && hits.length === 1);
            actor.firstHitBonusShield = Number(evt.bonusShield) || 0;
            actor.firstHitFired = false;
            actor.doubleHitPending = meta.attackStyle === 'double_dash' && hits.length > 1;
            actor.secondHitDamage = hits[1] || 0;
            actor.secondHitCrit = Boolean(evt.isCritical);
            addShockwave(actor.homeX, actor.homeY - 12, 42, meta.accentColor, 3, 0.22);
          } else if (actor) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.44;
            actor.scaleX = 0.85;
            actor.scaleY = 1.22;
            addShockwave(actor.x, actor.y - 18, 44, meta.projectileColor, 4, 0.28);

            const projKind =
              heroClass === 'mage'
                ? 'fireball'
                : heroClass === 'archer'
                  ? 'arrow'
                  : 'holy_orb';
            sound.play(heroClass === 'mage' ? 'fireball' : heroClass === 'archer' ? 'arrow' : 'heal');

            projectiles.push({
              active: true,
              kind: projKind,
              startX: actor.x + 18,
              startY: actor.y - 28,
              targetX: BOSS_HOME_X - 28,
              targetY: BOSS_HOME_Y + 6,
              progress: 0,
              duration: heroClass === 'archer' ? 0.25 : 0.36,
              arcHeight: heroClass === 'archer' ? 16 : 74,
              color: meta.projectileColor,
              trailColor: meta.trailColor,
              onImpactDamage: evt.damage || hits[0],
              onImpactCrit: Boolean(evt.isCritical),
            });

            if (evt.bonusHeal > 0) {
              projectiles.push({
                active: true,
                kind: 'heart',
                startX: actor.x - 10,
                startY: actor.y - 28,
                targetX: CASTLE_X + 20,
                targetY: CASTLE_Y - 20,
                progress: 0,
                duration: 0.44,
                arcHeight: 58,
                color: '#34D399',
                trailColor: '#A7F3D0',
                onImpactLabel: `+${evt.bonusHeal} HP`,
              });
            }
          } else {
            hitBossVisual(evt.damage || 80, Boolean(evt.isCritical));
          }

          if (evt.minionDefeated) {
            addShockwave(BOSS_HOME_X - 140, BOSS_HOME_Y + 34, 86, '#FACC15', 6, 0.38);
            addFloatingText(BOSS_HOME_X - 140, BOSS_HOME_Y - 12, `${evt.minionDefeated} K.O.!`, '#FACC15', 1.25);
          }
        } else if (evt.type === 'hero_heal') {
          sound.play('heal');
          const actor = actors.get(evt.playerId);
          if (actor) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.5;
            actor.scaleX = 0.88;
            actor.scaleY = 1.2;
            addShockwave(actor.x, actor.y - 18, 48, '#34D399', 4, 0.3);
            spawnBurst(actor.x, actor.y - 20, ['#10B981', '#6EE7B7', '#FEF08A'], 16, 130);
          }
          projectiles.push({
            active: true,
            kind: 'heart',
            startX: actor ? actor.x : 260,
            startY: actor ? actor.y - 24 : 330,
            targetX: CASTLE_X + 12,
            targetY: CASTLE_Y - 24,
            progress: 0,
            duration: 0.44,
            arcHeight: 68,
            color: '#10B981',
            trailColor: '#A7F3D0',
            onImpactLabel: `+${evt.healAmount || 65} HP`,
          });
        } else if (evt.type === 'hero_shield') {
          sound.play('shield');
          const actor = actors.get(evt.playerId);
          if (actor) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.5;
            actor.scaleX = 1.18;
            actor.scaleY = 0.86;
            addShockwave(actor.x, actor.y - 18, 48, '#38BDF8', 4, 0.3);
            spawnBurst(actor.x, actor.y - 20, ['#38BDF8', '#FBBF24', '#E0F2FE'], 16, 130);
          }
          projectiles.push({
            active: true,
            kind: 'shield',
            startX: actor ? actor.x : 260,
            startY: actor ? actor.y - 24 : 330,
            targetX: CASTLE_X + 16,
            targetY: CASTLE_Y - 16,
            progress: 0,
            duration: 0.42,
            arcHeight: 54,
            color: '#38BDF8',
            trailColor: '#FBBF24',
            onImpactLabel: `+${evt.shieldAmount || 45} SHIELD`,
          });
        } else if (evt.type === 'beam_tap') {
          const actor = actors.get(evt.playerId);
          const col = actor ? HERO_CLASS_MAP[actor.heroClass]?.accentColor || '#FACC15' : '#FACC15';
          spawnBurst(448, BOSS_HOME_Y + 8, [col, '#FFFFFF', '#34D399'], 8, 175);
          addShockwave(448, BOSS_HOME_Y + 8, 65, col, 4, 0.24);
        } else if (evt.type === 'mega_beam_charge') {
          sound.play('boss_alarm');
          speedlineColor = '#34D399';
          speedlineAlpha = 0.85;
          triggerScreenFlash('#34D399', 0.28);
          for (const actor of actors.values()) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 3.8;
          }
        } else if (evt.type === 'boss_trait') {
          sound.play('boss_alarm');
          if (evt.trait === 'burn') {
            triggerScreenFlash('#F97316', 0.25);
            addShockwave(CASTLE_X + 26, CASTLE_Y - 10, 96, '#F97316', 6, 0.4);
          } else if (evt.trait === 'armor') {
            addShockwave(BOSS_HOME_X, BOSS_HOME_Y, 125, '#F59E0B', 7, 0.45);
          } else if (evt.trait === 'drain') {
            addFloatingText(BOSS_HOME_X, BOSS_HOME_Y - 76, `+${evt.amount || 25} DRAIN`, '#E879F9', 1.2);
          }
        } else if (evt.type === 'class_sync') {
          sound.play('correct');
          triggerScreenFlash('#FACC15', 0.22);
        } else if (evt.type === 'boss_charge_start') {
          sound.play('boss_alarm');
          trauma = Math.min(1, trauma + 0.35);
          triggerScreenFlash('#EF4444', 0.24);
          addShockwave(BOSS_HOME_X - 12, BOSS_HOME_Y, 150, '#EF4444', 7, 0.46);
        } else if (evt.type === 'boss_enraged') {
          sound.play('boss_alarm');
          trauma = 0.85;
          bossSquash = 0.28;
          speedlineColor = '#EF4444';
          speedlineAlpha = 0.9;
          triggerScreenFlash('#DC2626', 0.48);
          addShockwave(BOSS_HOME_X, BOSS_HOME_Y, 210, '#EF4444', 10, 0.55);
          spawnBurst(BOSS_HOME_X, BOSS_HOME_Y, ['#EF4444', '#F97316', '#FEF08A', '#FFFFFF'], 44, 290);
          addFloatingText(BOSS_HOME_X - 18, BOSS_HOME_Y - 98, 'FASE 2: ENRAGED!!', '#FEF08A', 1.55);
        } else if (evt.type === 'boss_break') {
          sound.play('boss_stun');
          hitstopTimer = 0.08;
          trauma = 0.85;
          bossFlashTimer = 0.22;
          bossRecoilX = 44;
          bossSquash = 0.28;
          triggerScreenFlash('#A7F3D0', 0.46);
          addShockwave(BOSS_HOME_X - 10, BOSS_HOME_Y, 190, '#34D399', 9, 0.5);
          spawnBurst(BOSS_HOME_X - 10, BOSS_HOME_Y, ['#FACC15', '#34D399', '#FFFFFF'], 42, 280);
          addFloatingText(
            BOSS_HOME_X - 24,
            BOSS_HOME_Y - 92,
            `BREAK!! -${evt.damage || 100}`,
            '#34D399',
            1.55
          );
        } else if (evt.type === 'boss_ultimate_hit') {
          sound.play('boss_ult');
          bossAttackAnimTimer = 0.95;
          bossLungeX = -46;
          castleFlashTimer = 0.4;
          trauma = 1.0;
          speedlineColor = '#EF4444';
          speedlineAlpha = 0.95;
          triggerScreenFlash('#EF4444', 0.52);
          const bossMeta = BOSS_META_MAP[(st.bossType || 'inferno-dragon') as BossType];
          beams.push({
            kind: 'boss_ult',
            life: 0.92,
            maxLife: 0.92,
            color: bossMeta?.ultimateColor || '#EF4444',
            coreColor: bossMeta?.secondaryColor || '#FEF08A',
            boostScale: 1,
          });
          addShockwave(CASTLE_X + 35, CASTLE_Y - 12, 160, '#EF4444', 9, 0.48);
          spawnBurst(CASTLE_X + 35, CASTLE_Y - 12, ['#EF4444', '#F97316', '#CBD5E1', '#FEF08A'], 46, 265);
          addFloatingText(
            CASTLE_X + 28,
            CASTLE_Y - 96,
            evt.hpDamage > 0 ? `-${evt.hpDamage} HP!` : 'PERISAI TAHAN!',
            evt.hpDamage > 0 ? '#FB7185' : '#38BDF8',
            1.45
          );
        } else if (evt.type === 'mega_beam') {
          sound.play('mega_beam');
          hitstopTimer = 0.085;
          trauma = 1.0;
          bossFlashTimer = 0.3;
          bossRecoilX = 48;
          bossSquash = 0.32;
          speedlineColor = '#FACC15';
          speedlineAlpha = 1.0;
          triggerScreenFlash('#FFFFFF', 0.62);
          const boostScale = 1 + Math.min(0.85, (Number(evt.tapCount) || 0) / 35);
          beams.push({
            kind: 'mega_beam',
            life: 1.15,
            maxLife: 1.15,
            color: '#10B981',
            coreColor: '#FEF08A',
            boostScale,
          });
          addShockwave(BOSS_HOME_X - 20, BOSS_HOME_Y, 220, '#FACC15', 11, 0.55);
          spawnBurst(BOSS_HOME_X - 20, BOSS_HOME_Y, ['#34D399', '#FACC15', '#38BDF8', '#FFFFFF'], 60, 320);
          addFloatingText(
            BOSS_HOME_X - 30,
            BOSS_HOME_Y - 106,
            `MEGA BEAM -${evt.damage || 160}!`,
            '#FACC15',
            1.65
          );
        } else if (evt.type === 'victory') {
          sound.play('victory_8bit');
          bossExploded = true;
          trauma = 1.0;
          triggerScreenFlash('#FEF9C3', 0.72);
          addShockwave(BOSS_HOME_X, BOSS_HOME_Y, 260, '#FACC15', 12, 0.7);
          spawnBurst(
            BOSS_HOME_X,
            BOSS_HOME_Y,
            ['#EF4444', '#F97316', '#FACC15', '#34D399', '#FFFFFF', '#A855F7'],
            110,
            360
          );
          for (const actor of actors.values()) {
            actor.state = 'celebrate';
            actor.jumpPhase = Math.random() * Math.PI * 2;
          }
          addFloatingText(LOGICAL_W * 0.5, 168, 'BOSS DIKALAHKAN!', '#FACC15', 2.0);
        } else if (evt.type === 'defeat') {
          sound.play('defeat_8bit');
          trauma = 0.9;
          triggerScreenFlash('#EF4444', 0.45);
          spawnBurst(CASTLE_X + 20, CASTLE_Y - 10, ['#94A3B8', '#475569', '#EF4444'], 50, 220);
          addFloatingText(LOGICAL_W * 0.5, 168, 'BENTENG RUNTUH!', '#FB7185', 1.85);
        }
      }
    }

    function drawPixelSky(ctx2: CanvasRenderingContext2D, enraged: number, t: number) {
      const bands = [
        enraged > 0.5 ? '#1B0712' : '#09152B',
        enraged > 0.5 ? '#350B18' : '#0E2440',
        enraged > 0.5 ? '#591220' : '#143857',
        enraged > 0.5 ? '#7F1D1D' : '#184E5E',
        enraged > 0.5 ? '#991B1B' : '#1F5F5B',
      ];
      const bandH = Math.ceil(GROUND_Y / bands.length);
      bands.forEach((col, i) => {
        ctx2.fillStyle = col;
        ctx2.fillRect(0, i * bandH, LOGICAL_W, bandH + 2);
      });

      for (const s of stars) {
        const blink = 0.45 + 0.55 * Math.sin(t * 2.8 + s.phase);
        ctx2.fillStyle =
          enraged > 0.5 ? `rgba(254, 202, 202, ${blink})` : `rgba(254, 249, 195, ${blink})`;
        ctx2.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }

      // Pixel moon with soft ambient halo
      const mx = 148;
      const my = 62;
      ctx2.fillStyle = enraged > 0.5 ? 'rgba(239, 68, 68, 0.16)' : 'rgba(254, 240, 138, 0.12)';
      ctx2.fillRect(mx - 28, my - 28, 56, 56);
      ctx2.fillStyle = enraged > 0.5 ? '#EF4444' : '#FEF08A';
      ctx2.fillRect(mx - 14, my - 14, 28, 28);
      ctx2.fillRect(mx - 18, my - 10, 36, 20);
      ctx2.fillRect(mx - 10, my - 18, 20, 36);
      ctx2.fillStyle = bands[0];
      ctx2.fillRect(mx - 4, my - 14, 18, 22);

      for (const c of clouds) {
        ctx2.fillStyle = enraged > 0.5 ? 'rgba(127, 29, 29, 0.55)' : 'rgba(148, 163, 184, 0.24)';
        const cx = Math.round(c.x);
        const cy = Math.round(c.y);
        ctx2.fillRect(cx, cy, c.w, 12);
        ctx2.fillRect(cx + 14, cy - 8, c.w - 28, 10);
        ctx2.fillRect(cx + 24, cy - 14, c.w - 52, 8);
      }

      ctx2.fillStyle = enraged > 0.5 ? '#2B0A12' : '#0D2636';
      const peaks = [
        [0, 390, 150, 265, 310, 390],
        [220, 400, 410, 245, 600, 400],
        [490, 400, 690, 260, 890, 400],
        [760, 400, 960, 252, 1180, 400],
      ];
      for (const p of peaks) {
        ctx2.beginPath();
        ctx2.moveTo(p[0], GROUND_Y);
        ctx2.lineTo(p[2], p[3]);
        ctx2.lineTo(p[4], GROUND_Y);
        ctx2.closePath();
        ctx2.fill();
      }
    }

    function drawPixelGround(ctx2: CanvasRenderingContext2D, enraged: number) {
      ctx2.fillStyle = enraged > 0.5 ? '#991B1B' : '#065F46';
      ctx2.fillRect(0, GROUND_Y, LOGICAL_W, 10);
      ctx2.fillStyle = enraged > 0.5 ? '#DC2626' : '#10B981';
      for (let x = 0; x < LOGICAL_W; x += 24) {
        ctx2.fillRect(x, GROUND_Y, 14, 4);
      }
      ctx2.fillStyle = '#1E293B';
      ctx2.fillRect(0, GROUND_Y + 10, LOGICAL_W, LOGICAL_H - GROUND_Y);
      for (let row = 0; row < 3; row++) {
        const y = GROUND_Y + 16 + row * 20;
        const offset = (row % 2) * 22;
        for (let x = -20 + offset; x < LOGICAL_W; x += 48) {
          ctx2.fillStyle = row === 0 ? '#334155' : '#0F172A';
          ctx2.fillRect(x, y, 42, 14);
          ctx2.fillStyle = '#475569';
          ctx2.fillRect(x + 2, y + 2, 36, 3);
        }
      }
    }

    function drawPixelCastle(
      ctx2: CanvasRenderingContext2D,
      castleHpPct: number,
      castleShield: number,
      burning: boolean,
      flash: boolean,
      t: number
    ) {
      const baseX = 16;
      const baseY = GROUND_Y - 196;

      ctx2.fillStyle = flash ? '#FFFFFF' : '#475569';
      ctx2.fillRect(baseX, baseY + 34, 114, 162);
      ctx2.fillStyle = flash ? '#FFFFFF' : '#64748B';
      ctx2.fillRect(baseX + 8, baseY, 44, 196);
      for (let i = 0; i < 6; i++) {
        ctx2.fillStyle = flash ? '#FFFFFF' : '#94A3B8';
        ctx2.fillRect(baseX + i * 20, baseY + 22, 12, 14);
      }
      for (let i = 0; i < 3; i++) {
        ctx2.fillRect(baseX + 6 + i * 16, baseY - 12, 10, 14);
      }

      const flutter = Math.round(Math.sin(t * 7) * 3.5);
      ctx2.fillStyle = '#E2E8F0';
      ctx2.fillRect(baseX + 28, baseY - 46, 4, 36);
      ctx2.fillStyle = '#059669';
      ctx2.fillRect(baseX + 32, baseY - 44, 30, 18);
      ctx2.fillStyle = '#FACC15';
      ctx2.fillRect(baseX + 42, baseY - 39, 10, 8);
      ctx2.fillStyle = '#047857';
      ctx2.fillRect(baseX + 58, baseY - 42 + flutter, 10, 14);

      if (!flash) {
        ctx2.fillStyle = '#334155';
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 3; c++) {
            ctx2.fillRect(baseX + 10 + c * 34 + (r % 2) * 12, baseY + 46 + r * 24, 22, 8);
          }
        }
      }

      ctx2.fillStyle = '#1E293B';
      ctx2.fillRect(baseX + 60, GROUND_Y - 68, 42, 68);
      ctx2.fillStyle = '#78350F';
      ctx2.fillRect(baseX + 65, GROUND_Y - 62, 32, 62);
      ctx2.fillStyle = '#92400E';
      ctx2.fillRect(baseX + 79, GROUND_Y - 62, 4, 62);

      if (castleHpPct < 55 && !flash) {
        ctx2.fillStyle = '#0F172A';
        ctx2.fillRect(baseX + 26, baseY + 60, 4, 28);
        ctx2.fillRect(baseX + 30, baseY + 84, 12, 4);
        ctx2.fillRect(baseX + 86, baseY + 52, 4, 24);
      }

      // Twin flickering torches
      const flicker = Math.sin(t * 16) > 0 ? 1 : 0;
      const torchPositions = [
        [baseX + 54, GROUND_Y - 82],
        [baseX + 106, GROUND_Y - 82],
      ];
      for (const [tx, ty] of torchPositions) {
        ctx2.fillStyle = '#78350F';
        ctx2.fillRect(tx, ty, 5, 16);
        ctx2.fillStyle = '#F97316';
        ctx2.fillRect(tx - 3, ty - 10 - flicker * 3, 11, 12);
        ctx2.fillStyle = '#FEF08A';
        ctx2.fillRect(tx - 1, ty - 7 - flicker * 2, 7, 8);
      }

      // Inferno Dragon BURN flames roaring on Castle!
      if (burning) {
        for (let i = 0; i < 5; i++) {
          const fx = baseX + 14 + i * 22;
          const fh = 22 + Math.round(Math.abs(Math.sin(t * 14 + i * 1.4)) * 20);
          ctx2.fillStyle = '#EF4444';
          ctx2.fillRect(fx, baseY + 34 - fh, 16, fh);
          ctx2.fillStyle = '#F97316';
          ctx2.fillRect(fx + 3, baseY + 34 - Math.round(fh * 0.72), 10, Math.round(fh * 0.72));
          ctx2.fillStyle = '#FEF08A';
          ctx2.fillRect(fx + 5, baseY + 34 - Math.round(fh * 0.42), 6, Math.round(fh * 0.42));
        }
      }

      // Glowing Shield Barrier Dome
      if (castleShield > 0) {
        const pulse = 0.28 + 0.16 * Math.sin(t * 6);
        ctx2.save();
        ctx2.strokeStyle = `rgba(56, 189, 248, ${0.75 + pulse * 0.4})`;
        ctx2.lineWidth = 4;
        ctx2.fillStyle = `rgba(56, 189, 248, ${pulse * 0.48})`;
        ctx2.beginPath();
        ctx2.arc(baseX + 76, GROUND_Y - 56, 122, -Math.PI * 0.48, Math.PI * 0.16);
        ctx2.stroke();
        ctx2.fill();
        ctx2.restore();
      }
    }

    function drawMinions(ctx2: CanvasRenderingContext2D, st: any, t: number) {
      if (!st || !Array.isArray(st.minions) || st.minions.length === 0) return;
      const bossType = (st.bossType || 'inferno-dragon') as BossType;
      const bodyCol =
        bossType === 'inferno-dragon'
          ? '#F97316'
          : bossType === 'titan-golem'
            ? '#94A3B8'
            : '#A855F7';
      const coreCol =
        bossType === 'inferno-dragon'
          ? '#FEF08A'
          : bossType === 'titan-golem'
            ? '#34D399'
            : '#E879F9';

      st.minions.forEach((m: any, idx: number) => {
        const mx = BOSS_HOME_X - 154 - idx * 24;
        const my = GROUND_Y - 62 - idx * 54 + Math.sin(t * 5.2 + idx * 2.1) * 9;
        const sx = 1 + Math.sin(t * 6 + idx) * 0.08;
        const sy = 1 - Math.sin(t * 6 + idx) * 0.08;

        ctx2.fillStyle = 'rgba(0,0,0,0.35)';
        ctx2.fillRect(Math.round(mx - 16), GROUND_Y - 6, 32, 8);

        ctx2.save();
        ctx2.translate(Math.round(mx), Math.round(my));
        ctx2.scale(sx, sy);
        // 16-bit Pixel Minion Silhouette
        ctx2.fillStyle = '#0F172A';
        ctx2.fillRect(-18, -18, 36, 36);
        ctx2.fillStyle = bodyCol;
        ctx2.fillRect(-14, -14, 28, 28);
        ctx2.fillStyle = coreCol;
        ctx2.fillRect(-10, -4, 6, 6);
        ctx2.fillRect(2, -4, 6, 6);
        ctx2.fillStyle = '#0F172A';
        ctx2.fillRect(-8, -2, 3, 3);
        ctx2.fillRect(4, -2, 3, 3);
        ctx2.restore();

        // Minion mini HP bar
        const pct = Math.max(0, Math.min(1, m.hp / Math.max(1, m.maxHp)));
        ctx2.fillStyle = '#020617';
        ctx2.fillRect(Math.round(mx - 22), Math.round(my - 30), 44, 7);
        ctx2.fillStyle = '#FACC15';
        ctx2.fillRect(Math.round(mx - 20), Math.round(my - 28), Math.round(40 * pct), 3);
      });
    }

    function drawBoss(ctx2: CanvasRenderingContext2D, st: any, t: number) {
      if (bossExploded || !st) return;
      const bossType = (st.bossType || 'inferno-dragon') as BossType;
      const isEnraged = Boolean(st.bossEnraged);
      const isStunned = Boolean(st.bossStunned);
      const isArmor = Boolean(st.bossArmorActive);
      const isCharging = st.ultimate?.status === 'charging';

      const speed = isEnraged ? 6.4 : 3.1;
      const bobY = isStunned ? 12 : Math.sin(t * speed) * (isEnraged ? 13 : 8);
      const rageJitterX = isEnraged && !isStunned ? Math.sin(t * 32) * 3.5 : 0;
      const bx = Math.round(BOSS_HOME_X + bossRecoilX + bossLungeX + rageJitterX);
      const by = Math.round(BOSS_HOME_Y + bobY);

      const breatheScaleY = 1 + Math.sin(t * speed) * 0.045 - bossSquash;
      const breatheScaleX = 1 - Math.sin(t * speed) * 0.03 + bossSquash;

      ctx2.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx2.fillRect(bx - 82, GROUND_Y - 8, 164, 16);

      // Phase 2 Enraged crimson aura + pixel lightning
      if (isEnraged && !isStunned) {
        const auraR = 114 + Math.sin(t * 11) * 12;
        const grad = ctx2.createRadialGradient(bx, by, 24, bx, by, auraR);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.55)');
        grad.addColorStop(0.6, 'rgba(249, 115, 22, 0.25)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx2.fillStyle = grad;
        ctx2.fillRect(bx - auraR, by - auraR, auraR * 2, auraR * 2);

        if (Math.floor(t * 14) % 2 === 0) {
          ctx2.strokeStyle = '#FEF08A';
          ctx2.lineWidth = 3;
          ctx2.beginPath();
          ctx2.moveTo(bx - 92, by - 76);
          ctx2.lineTo(bx - 70, by - 46);
          ctx2.lineTo(bx - 96, by - 18);
          ctx2.stroke();
        }
      }

      // Charging Ultimate expanding energy vortex
      if (isCharging) {
        const chargePct =
          1 -
          Math.max(
            0,
            Math.min(
              1,
              (st.ultimate?.chargeRemainingSec ?? 5) / (st.ultimate?.chargeDurationSec || 10)
            )
          );
        const ringR = 58 + chargePct * 78 + Math.sin(t * 20) * 7;
        ctx2.save();
        ctx2.strokeStyle = '#EF4444';
        ctx2.lineWidth = 7;
        ctx2.beginPath();
        ctx2.arc(bx - 22, by, ringR, 0, Math.PI * 2);
        ctx2.stroke();

        ctx2.strokeStyle = '#FACC15';
        ctx2.lineWidth = 3;
        ctx2.beginPath();
        ctx2.arc(bx - 22, by, ringR * 0.72, 0, Math.PI * 2);
        ctx2.stroke();
        ctx2.restore();
      }

      const useAttackFrame =
        bossAttackAnimTimer > 0 || isCharging || (isEnraged && Math.floor(t * 4.5) % 2 === 0);
      const sprite = getBossSpriteCanvas(
        bossType,
        useAttackFrame ? 'attack' : 'idle',
        bossFlashTimer > 0
      );
      const drawSize = 202;
      ctx2.save();
      ctx2.imageSmoothingEnabled = false;
      ctx2.translate(bx, by);
      ctx2.scale(breatheScaleX, breatheScaleY);
      if (isStunned) {
        ctx2.rotate(0.14 + Math.sin(t * 14) * 0.04);
      } else if (bossLungeX < -4) {
        ctx2.rotate(-0.08);
      }
      ctx2.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx2.restore();

      // Titan Golem STONE ARMOR shimmering barrier
      if (isArmor && !isStunned) {
        const pulse = 0.45 + 0.25 * Math.sin(t * 8);
        ctx2.save();
        ctx2.strokeStyle = `rgba(251, 191, 36, ${pulse + 0.25})`;
        ctx2.lineWidth = 5;
        ctx2.fillStyle = `rgba(245, 158, 11, ${pulse * 0.22})`;
        ctx2.strokeRect(bx - 104, by - 102, 208, 204);
        ctx2.fillRect(bx - 104, by - 102, 208, 204);
        ctx2.fillStyle = '#FEF08A';
        ctx2.font = '900 12px ui-monospace, monospace';
        ctx2.textAlign = 'center';
        ctx2.fillText('ARMOR BATU 40%', bx, by - 110);
        ctx2.restore();
      }

      // Orbiting stun stars
      if (isStunned) {
        const starSprite = getPropSpriteCanvas('star');
        for (let i = 0; i < 3; i++) {
          const ang = t * 4.6 + (i * Math.PI * 2) / 3;
          const sx = bx + Math.cos(ang) * 62 - 10;
          const sy = by - 100 + Math.sin(ang) * 15 - 10;
          ctx2.imageSmoothingEnabled = false;
          ctx2.drawImage(starSprite, Math.round(sx), Math.round(sy), 20, 20);
        }
      }
    }

    function drawHeroes(ctx2: CanvasRenderingContext2D, st: any, t: number) {
      const sorted = Array.from(actors.values()).sort((a, b) => a.y - b.y);
      const heroSize = sorted.length > 12 ? 48 : 58;
      const isHeroSelect = st?.phase === 'hero_select';
      const syncedClasses: string[] = st?.classSync?.classes || [];

      for (const actor of sorted) {
        const isAttacking =
          actor.state === 'dash_in' ||
          actor.state === 'attack_hold' ||
          actor.state === 'cast' ||
          st?.cinematic?.kind === 'mega_beam';
        let offsetY = 0;
        let idleScaleX = 1;
        let idleScaleY = 1;

        if (actor.state === 'celebrate') {
          const jump = Math.abs(Math.sin(t * 7.5 + actor.jumpPhase));
          offsetY = -jump * 30;
          idleScaleY = 0.92 + jump * 0.16;
          idleScaleX = 1.08 - jump * 0.12;
        } else if (actor.state === 'idle') {
          const breathe = Math.sin(t * 4.1 + actor.bobOffset);
          offsetY = breathe * 3.2;
          idleScaleY = 1 + breathe * 0.04;
          idleScaleX = 1 - breathe * 0.028;
        }

        const drawX = Math.round(actor.x);
        const drawY = Math.round(actor.y + offsetY);

        // Ground shadow
        ctx2.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx2.fillRect(drawX - 18, Math.round(actor.y) - 4, 36, 7);

        // Golden Class-Sync 2x floor aura for highlighted classes!
        if (syncedClasses.includes(actor.heroClass)) {
          ctx2.save();
          ctx2.strokeStyle = '#FACC15';
          ctx2.lineWidth = 3;
          ctx2.globalAlpha = 0.65 + 0.3 * Math.sin(t * 10);
          ctx2.beginPath();
          ctx2.ellipse(drawX, Math.round(actor.y) - 1, 24, 7, 0, 0, Math.PI * 2);
          ctx2.stroke();
          ctx2.restore();
        }

        // Smooth multi-ghost dash motion afterimages
        if (actor.afterimages.length > 0) {
          const ghost = getHeroSpriteCanvas(actor.heroClass, 'attack');
          for (const ghostItem of actor.afterimages) {
            ctx2.save();
            ctx2.globalAlpha = ghostItem.alpha * 0.48;
            ctx2.imageSmoothingEnabled = false;
            ctx2.translate(Math.round(ghostItem.x), Math.round(ghostItem.y));
            ctx2.scale(ghostItem.scaleX, ghostItem.scaleY);
            ctx2.drawImage(ghost, -heroSize / 2, -heroSize, heroSize, heroSize);
            ctx2.restore();
          }
        }

        // Crisp 16x16 Hero Sprite with dynamic squash-and-stretch + tilt
        const sprite = getHeroSpriteCanvas(actor.heroClass, isAttacking ? 'attack' : 'idle');
        ctx2.save();
        ctx2.imageSmoothingEnabled = false;
        ctx2.translate(drawX, drawY);
        ctx2.rotate(actor.tilt);
        ctx2.scale(actor.scaleX * idleScaleX, actor.scaleY * idleScaleY);
        ctx2.drawImage(sprite, -heroSize / 2, -heroSize, heroSize, heroSize);
        ctx2.restore();

        // Nameplate above head
        const label = actor.name.length > 10 ? `${actor.name.slice(0, 9)}..` : actor.name;
        ctx2.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        const textW = ctx2.measureText(label).width;
        const boxW = Math.ceil(textW + 10);
        const boxX = Math.round(drawX - boxW / 2);
        const boxY = Math.round(drawY - heroSize - 19);

        ctx2.fillStyle = actor.selectedHero ? 'rgba(2, 44, 34, 0.9)' : 'rgba(15, 23, 42, 0.85)';
        ctx2.fillRect(boxX, boxY, boxW, 15);
        ctx2.strokeStyle = actor.selectedHero
          ? HERO_CLASS_MAP[actor.heroClass]?.accentColor || '#34D399'
          : '#64748B';
        ctx2.lineWidth = 1;
        ctx2.strokeRect(boxX + 0.5, boxY + 0.5, boxW - 1, 14);

        ctx2.fillStyle = '#F8FAFC';
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.fillText(label, drawX, boxY + 8);

        if (isHeroSelect && !actor.selectedHero) {
          ctx2.fillStyle = '#FACC15';
          ctx2.font = 'bold 13px ui-monospace, monospace';
          ctx2.fillText('?', drawX, boxY - 8 + Math.sin(t * 8 + actor.bobOffset) * 2);
        }
      }
    }

    function drawMegaBeamQteCharge(ctx2: CanvasRenderingContext2D, st: any, t: number) {
      if (!st?.cinematic || st.cinematic.kind !== 'mega_beam') return;
      const tapCount = Number(st.cinematic.tapCount) || 0;
      const coreX = 448;
      const coreY = BOSS_HOME_Y + 8;
      const radius = 34 + Math.min(58, tapCount * 2.2) + Math.sin(t * 28) * 6;

      ctx2.save();
      // Converging energy streams from every Hero into plasma core!
      for (const actor of actors.values()) {
        ctx2.strokeStyle = HERO_CLASS_MAP[actor.heroClass]?.accentColor || '#34D399';
        ctx2.lineWidth = 4 + Math.min(4, tapCount * 0.12);
        ctx2.beginPath();
        ctx2.moveTo(actor.x + 12, actor.y - 26);
        ctx2.lineTo(coreX, coreY);
        ctx2.stroke();
      }

      // Giant pulsating Emerald-Gold Plasma Core
      const grad = ctx2.createRadialGradient(coreX, coreY, 6, coreX, coreY, radius * 1.4);
      grad.addColorStop(0, '#FFFFFF');
      grad.addColorStop(0.35, '#FEF08A');
      grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.85)');
      grad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx2.fillStyle = grad;
      ctx2.beginPath();
      ctx2.arc(coreX, coreY, radius * 1.4, 0, Math.PI * 2);
      ctx2.fill();

      ctx2.strokeStyle = '#FEF08A';
      ctx2.lineWidth = 4;
      ctx2.beginPath();
      ctx2.arc(coreX, coreY, radius, 0, Math.PI * 2);
      ctx2.stroke();
      ctx2.restore();
    }

    function drawProjectilesAndEffects(ctx2: CanvasRenderingContext2D, st: any) {
      drawMegaBeamQteCharge(ctx2, st, elapsed);

      // Beams (Mega Pixel Beam or Boss Ultimate Laser)
      for (const b of beams) {
        const alpha = Math.min(1, (b.life / b.maxLife) * 1.5);
        ctx2.save();
        ctx2.globalAlpha = alpha;
        if (b.kind === 'mega_beam') {
          const yCenter = BOSS_HOME_Y + 8;
          const beamH = (64 + Math.sin(elapsed * 44) * 10) * b.boostScale;
          for (const actor of actors.values()) {
            ctx2.strokeStyle = HERO_CLASS_MAP[actor.heroClass]?.accentColor || '#34D399';
            ctx2.lineWidth = 5;
            ctx2.beginPath();
            ctx2.moveTo(actor.x + 12, actor.y - 24);
            ctx2.lineTo(445, yCenter);
            ctx2.stroke();
          }
          ctx2.fillStyle = '#059669';
          ctx2.fillRect(435, yCenter - beamH / 2 - 10, BOSS_HOME_X - 425, beamH + 20);
          ctx2.fillStyle = '#34D399';
          ctx2.fillRect(435, yCenter - beamH / 2, BOSS_HOME_X - 425, beamH);
          ctx2.fillStyle = '#FEF08A';
          ctx2.fillRect(435, yCenter - beamH * 0.28, BOSS_HOME_X - 425, beamH * 0.56);
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(435, yCenter - 9, BOSS_HOME_X - 425, 18);
        } else {
          const yStart = BOSS_HOME_Y + 2;
          const yEnd = CASTLE_Y - 12;
          ctx2.strokeStyle = b.color;
          ctx2.lineWidth = 60;
          ctx2.beginPath();
          ctx2.moveTo(BOSS_HOME_X - 60, yStart);
          ctx2.lineTo(CASTLE_X + 20, yEnd);
          ctx2.stroke();

          ctx2.strokeStyle = b.coreColor;
          ctx2.lineWidth = 24;
          ctx2.beginPath();
          ctx2.moveTo(BOSS_HOME_X - 60, yStart);
          ctx2.lineTo(CASTLE_X + 20, yEnd);
          ctx2.stroke();
        }
        ctx2.restore();
      }

      // Projectiles
      for (const p of projectiles) {
        if (!p.active) continue;
        const u = easeOutCubic(Math.min(1, p.progress));
        const px = p.startX + (p.targetX - p.startX) * u;
        const py = p.startY + (p.targetY - p.startY) * u - Math.sin(u * Math.PI) * p.arcHeight;

        ctx2.imageSmoothingEnabled = false;
        if (p.kind === 'heart') {
          ctx2.drawImage(getPropSpriteCanvas('heart'), Math.round(px - 12), Math.round(py - 12), 24, 24);
        } else if (p.kind === 'shield') {
          ctx2.drawImage(getPropSpriteCanvas('shield'), Math.round(px - 12), Math.round(py - 12), 24, 24);
        } else if (p.kind === 'arrow') {
          ctx2.fillStyle = p.trailColor;
          ctx2.fillRect(Math.round(px - 22), Math.round(py - 3), 30, 6);
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(Math.round(px + 2), Math.round(py - 5), 11, 10);
        } else {
          ctx2.fillStyle = p.color;
          ctx2.fillRect(Math.round(px - 12), Math.round(py - 12), 24, 24);
          ctx2.fillStyle = p.trailColor;
          ctx2.fillRect(Math.round(px - 8), Math.round(py - 8), 16, 16);
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(Math.round(px - 4), Math.round(py - 4), 8, 8);
        }
      }

      // Expanding Pixel Shockwave Rings
      for (const sw of shockwaves) {
        const u = 1 - sw.life / sw.maxLife;
        const r = sw.radius + (sw.maxRadius - sw.radius) * easeOutExpo(u);
        ctx2.save();
        ctx2.globalAlpha = Math.max(0, sw.life / sw.maxLife);
        ctx2.strokeStyle = sw.color;
        ctx2.lineWidth = Math.max(2, sw.lineWidth * (1 - u * 0.6));
        ctx2.beginPath();
        ctx2.arc(Math.round(sw.x), Math.round(sw.y), Math.round(r), 0, Math.PI * 2);
        ctx2.stroke();
        ctx2.restore();
      }

      // Sword / Ninja Slash Arcs
      for (const s of slashEffects) {
        const alpha = Math.max(0, s.life / s.maxLife);
        ctx2.save();
        ctx2.globalAlpha = alpha;
        ctx2.translate(s.x, s.y);
        ctx2.rotate(s.angle);
        ctx2.strokeStyle = s.color;
        ctx2.lineWidth = 12;
        ctx2.beginPath();
        ctx2.arc(0, 0, s.radius, -1.15, 1.15);
        ctx2.stroke();
        ctx2.strokeStyle = '#FFFFFF';
        ctx2.lineWidth = 5;
        ctx2.beginPath();
        ctx2.arc(0, 0, s.radius - 4, -0.95, 0.95);
        ctx2.stroke();
        ctx2.restore();
      }

      // Pooled pixel particles
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const pt = particles[i];
        if (!pt.active) continue;
        ctx2.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.maxLife));
        ctx2.fillStyle = pt.color;
        ctx2.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
      }
      ctx2.globalAlpha = 1;

      // Anime Speedlines Overlay during high-intensity cinematics
      const activeSpeed =
        st?.cinematic?.kind === 'mega_beam' ? Math.max(speedlineAlpha, 0.55) : speedlineAlpha;
      if (activeSpeed > 0.04) {
        ctx2.save();
        ctx2.globalAlpha = activeSpeed * 0.42;
        ctx2.strokeStyle = speedlineColor;
        ctx2.lineWidth = 3;
        const cx = LOGICAL_W * 0.5;
        const cy = LOGICAL_H * 0.5;
        for (let i = 0; i < 24; i++) {
          const ang = (i / 24) * Math.PI * 2 + elapsed * 1.4;
          const r1 = 360 + ((i * 37) % 90);
          const r2 = 660;
          ctx2.beginPath();
          ctx2.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
          ctx2.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
          ctx2.stroke();
        }
        ctx2.restore();
      }

      // Retro Outlined Floating Numbers
      for (const ft of floatingTexts) {
        const alpha = Math.max(0, Math.min(1, ft.life / (ft.maxLife * 0.45)));
        const fontSize = Math.round(21 * ft.scale);
        ctx2.save();
        ctx2.globalAlpha = alpha;
        ctx2.font = `900 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'middle';
        ctx2.lineWidth = 5;
        ctx2.strokeStyle = '#020617';
        ctx2.strokeText(ft.text, Math.round(ft.x), Math.round(ft.y));
        ctx2.fillStyle = ft.color;
        ctx2.fillText(ft.text, Math.round(ft.x), Math.round(ft.y));
        ctx2.restore();
      }

      // Full-screen Cinematic Impact Flash Overlay
      if (screenFlashAlpha > 0.01) {
        ctx2.save();
        ctx2.globalAlpha = screenFlashAlpha;
        ctx2.fillStyle = screenFlashColor;
        ctx2.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        ctx2.restore();
      }
    }

    function step(now: number) {
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsed += dt;

      const st = gameStateRef.current;
      syncActorsFromState(st);
      processIncomingEvents(st);

      trauma = Math.max(0, trauma - dt * 1.85);
      bossFlashTimer = Math.max(0, bossFlashTimer - dt);
      castleFlashTimer = Math.max(0, castleFlashTimer - dt);
      bossAttackAnimTimer = Math.max(0, bossAttackAnimTimer - dt);
      screenFlashAlpha = Math.max(0, screenFlashAlpha - dt * 2.4);
      speedlineAlpha = Math.max(0, speedlineAlpha - dt * 0.85);
      bossRecoilX *= Math.pow(0.0008, dt);
      bossLungeX *= Math.pow(0.003, dt);
      bossSquash *= Math.pow(0.001, dt);

      const targetEnraged = st?.bossEnraged ? 1 : 0;
      enragedBlend += (targetEnraged - enragedBlend) * Math.min(1, dt * 3);

      let simDt = dt;
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
        simDt = 0;
      }

      if (simDt > 0) {
        for (const c of clouds) {
          c.x -= c.speed * simDt;
          if (c.x + c.w < -20) c.x = LOGICAL_W + 20;
        }

        emberSpawnAccum += simDt;
        const emberInterval = enragedBlend > 0.5 ? 0.065 : 0.18;
        if (emberSpawnAccum >= emberInterval) {
          emberSpawnAccum = 0;
          spawnParticle(
            Math.random() * LOGICAL_W,
            GROUND_Y - 4,
            (Math.random() - 0.5) * 32,
            -42 - Math.random() * 48,
            enragedBlend > 0.5 ? '#FB923C' : '#FDE047',
            3,
            1.4 + Math.random() * 1.1,
            -10
          );
        }

        // Fluid Hero Squash-Stretch & Eased State Machine
        for (const actor of actors.values()) {
          // Decay afterimages
          for (let i = actor.afterimages.length - 1; i >= 0; i--) {
            actor.afterimages[i].alpha -= simDt * 4.2;
            if (actor.afterimages[i].alpha <= 0) actor.afterimages.splice(i, 1);
          }

          if (actor.state === 'windup') {
            actor.stateTimer += simDt;
            const u = Math.min(1, actor.stateTimer / actor.stateDuration);
            actor.x = actor.homeX - u * 12;
            actor.scaleX = 1 + u * 0.25;
            actor.scaleY = 1 - u * 0.24;
            actor.tilt = -u * 0.14;
            if (u >= 1) {
              actor.state = 'dash_in';
              actor.stateTimer = 0;
              actor.stateDuration = 0.2;
              sound.play('slash');
            }
          } else if (actor.state === 'dash_in') {
            actor.stateTimer += simDt;
            const rawU = Math.min(1, actor.stateTimer / actor.stateDuration);
            const u = easeInOutQuart(rawU);
            actor.x = actor.homeX - 12 + (actor.targetX - (actor.homeX - 12)) * u;
            actor.y = actor.homeY + (actor.targetY - actor.homeY) * u - Math.sin(rawU * Math.PI) * 14;
            actor.scaleX = 1.32;
            actor.scaleY = 0.82;
            actor.tilt = 0.16;

            actor.afterimageAccum += simDt;
            if (actor.afterimageAccum >= 0.035) {
              actor.afterimageAccum = 0;
              actor.afterimages.push({
                x: actor.x,
                y: actor.y,
                alpha: 0.9,
                scaleX: actor.scaleX,
                scaleY: actor.scaleY,
              });
              if (actor.afterimages.length > 5) actor.afterimages.shift();
            }

            if (rawU >= 1) {
              actor.state = 'attack_hold';
              actor.stateTimer = 0;
              actor.stateDuration = actor.doubleHitPending ? 0.28 : 0.18;
              actor.scaleX = 0.86;
              actor.scaleY = 1.2;
              actor.tilt = 0.06;

              if (!actor.firstHitFired) {
                actor.firstHitFired = true;
                const meta = HERO_CLASS_MAP[actor.heroClass] || HERO_CLASS_MAP.knight;
                slashEffects.push({
                  x: BOSS_HOME_X - 42,
                  y: BOSS_HOME_Y + 12,
                  color: meta.projectileColor,
                  angle: -0.62,
                  life: 0.28,
                  maxLife: 0.28,
                  radius: 62,
                });
                hitBossVisual(actor.firstHitDamage, actor.firstHitCrit);
                if (actor.firstHitBonusShield > 0) {
                  projectiles.push({
                    active: true,
                    kind: 'shield',
                    startX: actor.homeX,
                    startY: actor.homeY - 24,
                    targetX: CASTLE_X + 18,
                    targetY: CASTLE_Y - 12,
                    progress: 0,
                    duration: 0.42,
                    arcHeight: 48,
                    color: '#38BDF8',
                    trailColor: '#FBBF24',
                    onImpactLabel: `+${actor.firstHitBonusShield} SHIELD`,
                  });
                }
              }
            }
          } else if (actor.state === 'attack_hold') {
            actor.stateTimer += simDt;
            actor.scaleX += (1 - actor.scaleX) * Math.min(1, simDt * 12);
            actor.scaleY += (1 - actor.scaleY) * Math.min(1, simDt * 12);
            if (actor.doubleHitPending && actor.stateTimer >= 0.13) {
              actor.doubleHitPending = false;
              sound.play('slash');
              actor.scaleX = 1.22;
              actor.scaleY = 0.84;
              slashEffects.push({
                x: BOSS_HOME_X - 32,
                y: BOSS_HOME_Y + 4,
                color: '#FB7185',
                angle: 0.78,
                life: 0.26,
                maxLife: 0.26,
                radius: 64,
              });
              hitBossVisual(actor.secondHitDamage, actor.secondHitCrit);
            }
            if (actor.stateTimer >= actor.stateDuration) {
              actor.state = 'dash_back';
              actor.stateTimer = 0;
              actor.stateDuration = 0.25;
            }
          } else if (actor.state === 'dash_back') {
            actor.stateTimer += simDt;
            const rawU = Math.min(1, actor.stateTimer / actor.stateDuration);
            const u = easeOutCubic(rawU);
            actor.x = actor.targetX + (actor.homeX - actor.targetX) * u;
            actor.y = actor.targetY + (actor.homeY - actor.targetY) * u - Math.sin(rawU * Math.PI) * 44;
            actor.tilt = -Math.sin(rawU * Math.PI) * 0.26;
            actor.scaleX = 1.12;
            actor.scaleY = 0.92;
            if (rawU >= 1) {
              actor.x = actor.homeX;
              actor.y = actor.homeY;
              actor.scaleX = 1.2;
              actor.scaleY = 0.82;
              actor.tilt = 0;
              actor.state = 'idle';
            }
          } else if (actor.state === 'cast') {
            actor.stateTimer += simDt;
            const u = Math.min(1, actor.stateTimer / actor.stateDuration);
            actor.x = actor.homeX - Math.sin(u * Math.PI) * 10;
            actor.scaleX += (1 - actor.scaleX) * Math.min(1, simDt * 10);
            actor.scaleY += (1 - actor.scaleY) * Math.min(1, simDt * 10);
            actor.tilt = -Math.sin(u * Math.PI) * 0.1;
            if (u >= 1) {
              actor.x = actor.homeX;
              actor.tilt = 0;
              actor.state = 'idle';
            }
          } else {
            // Smooth spring return to neutral scale in idle
            actor.scaleX += (1 - actor.scaleX) * Math.min(1, simDt * 10);
            actor.scaleY += (1 - actor.scaleY) * Math.min(1, simDt * 10);
            actor.tilt *= Math.pow(0.01, simDt);
          }
        }

        // Update projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.progress += simDt / p.duration;
          const u = easeOutCubic(Math.min(1, p.progress));
          const px = p.startX + (p.targetX - p.startX) * u;
          const py = p.startY + (p.targetY - p.startY) * u - Math.sin(u * Math.PI) * p.arcHeight;
          spawnParticle(
            px,
            py,
            (Math.random() - 0.5) * 28,
            (Math.random() - 0.5) * 28,
            p.trailColor,
            4,
            0.24,
            0
          );

          if (p.progress >= 1) {
            if (p.onImpactDamage) {
              hitBossVisual(p.onImpactDamage, Boolean(p.onImpactCrit));
            } else if (p.onImpactLabel) {
              addShockwave(p.targetX, p.targetY, 64, p.color, 5, 0.3);
              spawnBurst(p.targetX, p.targetY, [p.color, p.trailColor, '#FFFFFF'], 18, 155);
              addFloatingText(p.targetX + 16, p.targetY - 30, p.onImpactLabel, p.color, 1.2);
            }
            projectiles.splice(i, 1);
          }
        }

        for (let i = slashEffects.length - 1; i >= 0; i--) {
          slashEffects[i].life -= simDt;
          if (slashEffects[i].life <= 0) slashEffects.splice(i, 1);
        }

        for (let i = shockwaves.length - 1; i >= 0; i--) {
          shockwaves[i].life -= simDt;
          if (shockwaves[i].life <= 0) shockwaves.splice(i, 1);
        }

        for (let i = beams.length - 1; i >= 0; i--) {
          beams[i].life -= simDt;
          if (beams[i].life <= 0) beams.splice(i, 1);
        }

        for (let i = floatingTexts.length - 1; i >= 0; i--) {
          const ft = floatingTexts[i];
          ft.y += ft.vy * simDt;
          ft.vy *= 0.93;
          ft.life -= simDt;
          if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        for (let i = 0; i < MAX_PARTICLES; i++) {
          const pt = particles[i];
          if (!pt.active) continue;
          pt.x += pt.vx * simDt;
          pt.y += pt.vy * simDt;
          pt.vy += pt.gravity * simDt;
          pt.life -= simDt;
          if (pt.life <= 0) pt.active = false;
        }
      }

      // Render Frame
      g.save();
      const shakeMag = trauma * trauma * 18;
      if (shakeMag > 0.2) {
        const sx = (Math.random() - 0.5) * 2 * shakeMag;
        const sy = (Math.random() - 0.5) * 2 * shakeMag;
        g.translate(Math.round(sx), Math.round(sy));
      }

      drawPixelSky(g, enragedBlend, elapsed);
      drawPixelGround(g, enragedBlend);

      const castleHpPct = st ? (st.castleHp / Math.max(1, st.castleMaxHp)) * 100 : 100;
      drawPixelCastle(
        g,
        castleHpPct,
        st?.castleShield || 0,
        Boolean(st?.castleBurning),
        castleFlashTimer > 0,
        elapsed
      );
      drawMinions(g, st, elapsed);
      drawBoss(g, st, elapsed);
      drawHeroes(g, st, elapsed);
      drawProjectilesAndEffects(g, st);

      g.restore();

      rafId = requestAnimationFrame(step);
    }

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [hasGameState]);

  if (!gameState) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#060E16] font-mono-num text-lg font-bold text-emerald-300">
        MEMUAT ARENA PIXEL HEROES...
      </div>
    );
  }

  const bossPct = Math.max(
    0,
    Math.min(100, (gameState.bossHp / Math.max(1, gameState.bossMaxHp)) * 100)
  );
  const castlePct = Math.max(
    0,
    Math.min(100, (gameState.castleHp / Math.max(1, gameState.castleMaxHp)) * 100)
  );
  const shieldPct = Math.max(
    0,
    Math.min(100, (gameState.castleShield / Math.max(1, gameState.castleMaxShield || 300)) * 100)
  );
  const comboPct = Math.max(0, Math.min(100, Number(gameState.comboFever) || 0));
  const isCharging = gameState.ultimate?.status === 'charging';
  const isHeroSelect = gameState.phase === 'hero_select';
  const activeCinematic = gameState.cinematic;
  const activeClassSync = gameState.classSync;

  const handleStartBattleNow = () => {
    sound.play('click');
    socket.emit('host:game_action', {
      roomCode,
      action: { type: 'host:start_battle_now' },
    });
  };

  return (
    <div
      data-testid="boss-raid-host-arena"
      className="flex h-full w-full flex-col gap-2 overflow-hidden bg-[#060E16] px-2.5 py-2 text-white sm:px-4"
    >
      {/* TOP RETRO 16-BIT RPG HUD BAR (shrink-0, zero overflow) */}
      <div className="pixel-panel grid shrink-0 grid-cols-1 gap-2 rounded-xl border-2 border-emerald-500/40 bg-[#0D1E2B] px-3 py-2 lg:grid-cols-12 lg:items-center">
        {/* LEFT: CASTLE HP & SHIELD */}
        <div className="flex flex-col gap-1 lg:col-span-3">
          <div className="flex items-center justify-between font-mono-num text-xs font-extrabold">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <span>HP BENTENG</span>
              {gameState.castleBurning && (
                <span className="border border-orange-400 bg-orange-600 px-1 text-[10px] text-white animate-pulse">
                  TERBAKAR!
                </span>
              )}
              {gameState.heroicSpiritActive && (
                <span className="border border-amber-300 bg-amber-500 px-1 text-[10px] text-slate-950">
                  1.5X FEVER
                </span>
              )}
            </span>
            <span className="text-white">
              {gameState.castleHp}/{gameState.castleMaxHp}
            </span>
          </div>
          <div className="relative h-3.5 w-full overflow-hidden border-2 border-slate-950 bg-slate-900">
            <div
              className="absolute inset-y-0 left-0 bg-amber-300/80 transition-all duration-300"
              style={{ width: `${ghostCastlePct}%` }}
            />
            <div
              className={`relative h-full transition-all duration-150 ${
                castlePct <= 30 ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${castlePct}%` }}
            />
          </div>

          <div className="flex items-center justify-between font-mono-num text-[11px] font-bold text-sky-300">
            <span className="inline-flex items-center gap-1">
              <Shield className="h-3 w-3" />
              PERISAI
            </span>
            <span>{gameState.castleShield}</span>
          </div>
          <div className="h-2 w-full overflow-hidden border border-slate-950 bg-slate-900">
            <div
              className="h-full bg-sky-400 transition-all duration-200"
              style={{ width: `${shieldPct}%` }}
            />
          </div>
        </div>

        {/* CENTER: BOSS HP BAR + COMBO FEVER METER */}
        <div className="flex flex-col gap-1.5 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Flame
                className={`h-4 w-4 ${
                  gameState.bossEnraged ? 'text-rose-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <h1 className="font-mono-num text-sm font-black tracking-wide text-amber-200 sm:text-base">
                {gameState.bossName.toUpperCase()}
              </h1>
              {gameState.raidLevel && (
                <span className="border border-emerald-400/50 bg-emerald-950 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-emerald-300 uppercase">
                  {gameState.raidLevel === 'santai'
                    ? 'LV.1 SANTAI'
                    : gameState.raidLevel === 'epik'
                      ? 'LV.3 EPIK'
                      : 'LV.2 STANDAR'}
                </span>
              )}
              {gameState.bossEnraged && (
                <span className="border border-rose-400 bg-rose-700 px-1.5 py-0.5 font-mono-num text-[10px] font-black text-white">
                  ENRAGED!
                </span>
              )}
              {gameState.bossArmorActive && (
                <span className="border border-amber-300 bg-amber-600 px-1.5 py-0.5 font-mono-num text-[10px] font-black text-slate-950">
                  ARMOR 40%
                </span>
              )}
              {gameState.bossStunned && (
                <span className="border border-emerald-300 bg-emerald-600 px-1.5 py-0.5 font-mono-num text-[10px] font-black text-white">
                  STUNNED {gameState.bossStunnedRemainingSec}d
                </span>
              )}
            </div>
            <span
              data-testid="boss-hp-value"
              className="font-mono-num text-xs font-black text-white sm:text-sm"
            >
              {gameState.bossHp} / {gameState.bossMaxHp} HP
            </span>
          </div>

          {/* Boss HP Bar with 50% Phase Gate notch */}
          <div className="relative h-5 w-full overflow-hidden border-2 border-amber-400/70 bg-slate-950">
            <div
              className="absolute inset-y-0 left-0 bg-amber-300/80 transition-all duration-300"
              style={{ width: `${ghostBossPct}%` }}
            />
            <div
              className={`relative h-full transition-all duration-150 ${
                gameState.bossEnraged
                  ? 'bg-gradient-to-r from-red-700 via-rose-600 to-orange-500'
                  : 'bg-gradient-to-r from-rose-600 via-red-500 to-amber-500'
              }`}
              style={{ width: `${bossPct}%` }}
            />
            {/* 50% Phase Gate visual notch */}
            <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 bg-amber-200/80" />
          </div>

          {/* Combo Fever Bar */}
          <div className="flex items-center gap-2">
            <span className="inline-flex shrink-0 items-center gap-1 font-mono-num text-[11px] font-black text-amber-300">
              <Zap className="h-3.5 w-3.5 fill-current" />
              COMBO FEVER
            </span>
            <div className="h-2.5 flex-1 overflow-hidden border border-amber-400/40 bg-slate-950">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-yellow-400 transition-all duration-200"
                style={{ width: `${comboPct}%` }}
              />
            </div>
            <span className="w-9 text-right font-mono-num text-xs font-black text-amber-200">
              {comboPct}%
            </span>
          </div>
        </div>

        {/* RIGHT: TIMER, FULL MODE & HOST CONTROLS */}
        <div className="flex items-center justify-between gap-2 lg:col-span-3 lg:justify-end">
          <div className="flex items-center gap-1.5 border-2 border-emerald-500/40 bg-slate-950 px-2.5 py-1 font-mono-num">
            <Timer className="h-4 w-4 text-amber-300" />
            <div className="leading-tight">
              <p className="text-[9px] font-bold text-emerald-300">
                {isHeroSelect ? 'PILIH HERO' : 'WAKTU'}
              </p>
              <p className="text-base font-black text-white">
                {isHeroSelect ? `${gameState.heroSelectRemainingSec}d` : `${gameState.remainingSec}d`}
              </p>
            </div>
          </div>

          {onToggleFullscreen && (
            <button
              type="button"
              data-testid="hud-fullmode-btn"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Keluar Layar Penuh (Esc)' : 'Layar Penuh Tanpa Scroll (F)'}
              className="pixel-btn inline-flex items-center gap-1 border-2 border-emerald-400/70 bg-emerald-800 px-2.5 py-2 font-mono-num text-[11px] font-black text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>KELUAR FULL</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>FULL</span>
                </>
              )}
            </button>
          )}

          {isHeroSelect ? (
            <button
              type="button"
              onClick={handleStartBattleNow}
              className="pixel-btn inline-flex items-center gap-1 border-2 border-emerald-300 bg-emerald-600 px-2.5 py-2 font-mono-num text-[11px] font-black text-white hover:bg-emerald-500 whitespace-nowrap shrink-0"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>MULAI</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onForceEnd();
              }}
              className="pixel-btn inline-flex items-center gap-1 border-2 border-rose-400/70 bg-rose-700 px-2.5 py-2 font-mono-num text-[11px] font-black text-white hover:bg-rose-600 whitespace-nowrap shrink-0"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>AKHIRI</span>
            </button>
          )}
        </div>
      </div>

      {/* MAIN 60FPS HTML5 CANVAS 2D STAGE (flex-1 min-h-0 guarantees 100% viewport fit, zero scroll) */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl border-4 border-emerald-900 bg-[#050C14] shadow-xl">
        <canvas
          ref={canvasRef}
          data-testid="pixel-battle-canvas"
          className="pixelated block h-full w-full object-contain"
        />

        {/* PHASE 1: HERO SELECT OVERLAY BANNER */}
        {isHeroSelect && (
          <div className="pointer-events-none absolute inset-x-4 top-3 flex justify-center">
            <div className="pixel-panel border-2 border-amber-400 bg-[#062E24]/95 px-5 py-2 text-center">
              <p className="font-mono-num text-sm font-black tracking-wide text-amber-300 sm:text-base">
                FASE PILIH HERO PIXEL ({gameState.heroSelectRemainingSec} DETIK)
              </p>
              <p className="mt-0.5 font-mono-num text-xs text-emerald-100">
                Siswa mengetuk kelas Hero di HP — karakter langsung berbaris di arena!
              </p>
            </div>
          </div>
        )}

        {/* SYNCHRONIZED CINEMATIC OVERLAY (Phase 2 Enraged / Boss Break / Mega Beam QTE!) */}
        {activeCinematic && (
          <div
            data-testid="host-cinematic-banner"
            className="pointer-events-none absolute inset-x-4 top-3 flex justify-center"
          >
            <div
              className={`pixel-panel w-full max-w-2xl border-2 px-5 py-2.5 text-center ${
                activeCinematic.kind === 'mega_beam'
                  ? 'border-amber-300 bg-emerald-900/95'
                  : activeCinematic.kind === 'boss_break'
                    ? 'border-emerald-300 bg-emerald-950/95'
                    : 'border-rose-400 bg-rose-950/95'
              }`}
            >
              <p className="font-mono-num text-base font-black tracking-wide text-amber-300 sm:text-xl">
                {activeCinematic.title}
              </p>
              <p className="mt-0.5 font-mono-num text-xs font-bold text-white sm:text-sm">
                {activeCinematic.subtitle}
              </p>
              {activeCinematic.kind === 'mega_beam' && (
                <div className="mt-2 flex items-center justify-center gap-3 font-mono-num text-sm font-black text-amber-200">
                  <Zap className="h-4 w-4 animate-bounce fill-current text-amber-300" />
                  <span>BOOST TAP KELAS: {activeCinematic.tapCount}x</span>
                  <Zap className="h-4 w-4 animate-bounce fill-current text-amber-300" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* BOSS ULTIMATE / BREAK WARNING BANNER */}
        {isCharging && !activeCinematic && (
          <div className="pointer-events-none absolute inset-x-4 top-3 flex justify-center">
            <div className="pixel-panel w-full max-w-2xl border-2 border-amber-300 bg-rose-900/95 px-4 py-2 text-center">
              <div className="flex items-center justify-center gap-2 font-mono-num text-sm font-black text-amber-200 sm:text-base">
                <AlertTriangle className="h-5 w-5 animate-bounce text-amber-300" />
                <span>⚠️ BOSS MENGISI ULTIMATE! JAWAB SOAL UNTUK BREAK!</span>
              </div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="font-mono-num text-xs font-black text-white">
                  BREAK: {gameState.ultimate.breakProgress} / {gameState.ultimate.breakTarget}
                </span>
                <div className="h-3 flex-1 overflow-hidden border border-amber-300 bg-slate-950">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150"
                    style={{
                      width: `${Math.min(
                        100,
                        (gameState.ultimate.breakProgress /
                          Math.max(1, gameState.ultimate.breakTarget)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <span className="font-mono-num text-xs font-black text-amber-300">
                  {gameState.ultimate.chargeRemainingSec}d
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CLASS-SYNC 2X CALLOUT BANNER (Lv. 3 Epik) */}
        {activeClassSync && !isCharging && !activeCinematic && (
          <div className="pointer-events-none absolute inset-x-4 top-3 flex justify-center">
            <div className="pixel-panel inline-flex items-center gap-2 border-2 border-amber-300 bg-amber-950/95 px-4 py-1.5 font-mono-num text-xs font-black text-amber-200 sm:text-sm">
              <Sparkles className="h-4 w-4 text-amber-300" />
              <span>{activeClassSync.label}</span>
              <span className="border border-amber-300 bg-amber-400 px-1.5 text-slate-950">
                {activeClassSync.remainingSec}d
              </span>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM RETRO RPG BAR (shrink-0, compact for zero-scroll fit) */}
      <div className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-12">
        <section className="pixel-panel rounded-xl border-2 border-emerald-500/35 bg-[#0D1E2B] px-3.5 py-2 lg:col-span-7">
          <div className="flex items-center justify-between font-mono-num text-[10px] font-black uppercase tracking-wider text-emerald-300">
            <span>LIVE BATTLE LOG</span>
            {gameState.bossTraitName && (
              <span className="text-amber-300">TRAIT BOSS: {gameState.bossTraitName}</span>
            )}
          </div>
          <div className="mt-1 flex flex-col gap-0.5 font-mono-num text-xs">
            {(gameState.battleLog || []).slice(0, 2).map((line: string, idx: number) => (
              <p
                key={`${idx}-${line}`}
                className={`truncate ${idx === 0 ? 'font-bold text-amber-200' : 'text-slate-300'}`}
              >
                &gt; {line}
              </p>
            ))}
          </div>
        </section>

        <section className="pixel-panel rounded-xl border-2 border-amber-400/35 bg-[#0D1E2B] px-3.5 py-2 lg:col-span-5">
          <div className="mb-1 flex items-center justify-between font-mono-num text-[10px] font-black uppercase tracking-wider text-amber-300">
            <span className="inline-flex items-center gap-1">
              <Trophy className="h-3 w-3" />
              TOP HERO KELAS
            </span>
            <span className="text-emerald-300">{(gameState.heroes || []).length} HERO AKTIF</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {(gameState.leaderboard || []).slice(0, 3).map((p: any, idx: number) => {
              const cls = HERO_CLASS_MAP[(p.heroClass || 'knight') as HeroClassId];
              return (
                <div
                  key={p.playerId}
                  className="truncate border border-emerald-500/30 bg-slate-950/90 px-2 py-1 font-mono-num"
                >
                  <p className="truncate text-[11px] font-extrabold text-white">
                    #{idx + 1} {p.name}
                  </p>
                  <p
                    className="truncate text-[10px] font-bold"
                    style={{ color: cls?.accentColor || '#34D399' }}
                  >
                    {cls?.name} · {p.score}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
