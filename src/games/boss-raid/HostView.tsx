import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Flame, Play, Shield, Square, Timer, Trophy, Zap } from 'lucide-react';
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
const LOGICAL_H = 490;
const GROUND_Y = 408;
const CASTLE_X = 92;
const CASTLE_Y = 338;
const BOSS_HOME_X = 945;
const BOSS_HOME_Y = 298;
const MAX_PARTICLES = 240;

interface HeroActor {
  playerId: string;
  name: string;
  heroClass: HeroClassId;
  selectedHero: boolean;
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  state: 'idle' | 'dash_in' | 'attack_hold' | 'dash_back' | 'cast' | 'celebrate';
  stateTimer: number;
  stateDuration: number;
  targetX: number;
  targetY: number;
  doubleHitPending: boolean;
  secondHitDamage: number;
  secondHitCrit: boolean;
  bobOffset: number;
  jumpPhase: number;
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
  // Organize students cleanly in 2 to 3 staggered RPG formation rows grounded on the battleground
  const rows = total <= 4 ? 2 : 3;
  const cols = Math.max(1, Math.ceil(total / rows));
  const row = index % rows;
  const col = Math.floor(index / rows);
  const xMin = 215;
  const xMax = 560;
  const colSpacing = cols > 1 ? Math.min(72, (xMax - xMin) / Math.max(1, cols - 1)) : 0;
  const rowStagger = (row % 2) * 26;
  const x = Math.round(xMin + col * colSpacing + rowStagger);
  const yStart = rows === 2 ? 414 : 398;
  const yGap = rows === 2 ? 32 : 24;
  const y = Math.round(yStart + row * yGap);
  return { x, y };
}

export function BossRaidHost({ socket, roomCode, gameState, onForceEnd }: HostGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameStateRef = useRef<any>(gameState);
  gameStateRef.current = gameState;

  const lastProcessedSeqRef = useRef<number>(0);
  const [ghostBossPct, setGhostBossPct] = useState(100);
  const [ghostCastlePct, setGhostCastlePct] = useState(100);

  // Sync trailing damage ghost bars smoothly
  useEffect(() => {
    if (!gameState) return;
    const bossPct = Math.max(0, Math.min(100, (gameState.bossHp / Math.max(1, gameState.bossMaxHp)) * 100));
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

  // Isolated 60fps HTML5 Canvas 2D Simulation & Renderer
  useEffect(() => {
    if (!hasGameState) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rawCtx = canvas.getContext('2d');
    if (!rawCtx) return;
    const g: CanvasRenderingContext2D = rawCtx;

    canvas.width = LOGICAL_W;
    canvas.height = LOGICAL_H;

    // Pre-allocated zero-GC particle ring buffer
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

    function spawnBurst(x: number, y: number, colors: string[], count: number, speed = 180) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
        const mag = speed * (0.45 + Math.random() * 0.75);
        spawnParticle(
          x + (Math.random() - 0.5) * 14,
          y + (Math.random() - 0.5) * 14,
          Math.cos(angle) * mag,
          Math.sin(angle) * mag - 45,
          colors[i % colors.length],
          Math.random() > 0.4 ? 5 : 3,
          0.35 + Math.random() * 0.45,
          300
        );
      }
    }

    const stars: Star[] = Array.from({ length: 42 }, (_, i) => ({
      x: ((i * 73 + 19) % (LOGICAL_W - 40)) + 20,
      y: ((i * 41 + 13) % 165) + 16,
      size: i % 4 === 0 ? 3 : 2,
      phase: i * 0.85,
    }));

    const clouds: Cloud[] = [
      { x: 90, y: 74, w: 96, speed: 12 },
      { x: 370, y: 52, w: 124, speed: 9 },
      { x: 640, y: 88, w: 108, speed: 15 },
      { x: 840, y: 60, w: 88, speed: 11 },
    ];

    const actors = new Map<string, HeroActor>();
    const projectiles: Projectile[] = [];
    const floatingTexts: FloatingText[] = [];
    const slashEffects: SlashEffect[] = [];
    const beams: BeamEffect[] = [];

    let trauma = 0;
    let hitstopTimer = 0;
    let bossFlashTimer = 0;
    let bossRecoilX = 0;
    let bossAttackAnimTimer = 0;
    let bossExploded = false;
    let castleFlashTimer = 0;
    let enragedBlend = 0;
    let emberSpawnAccum = 0;
    let elapsed = 0;
    let lastTs = performance.now();
    let rafId = 0;

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
        vy: -56,
        text,
        color,
        scale,
        life: 1.05,
        maxLife: 1.05,
      });
    }

    function hitBossVisual(damage: number, isCrit: boolean, labelPrefix = '') {
      bossFlashTimer = isCrit ? 0.1 : 0.065;
      bossRecoilX = isCrit ? 22 : 12;
      trauma = Math.min(1, trauma + (isCrit ? 0.55 : 0.28));
      if (isCrit) {
        hitstopTimer = 0.05;
        sound.play('crit');
      }
      spawnBurst(
        BOSS_HOME_X - 24,
        BOSS_HOME_Y + 6,
        isCrit
          ? ['#FEF08A', '#F97316', '#FFFFFF', '#EF4444']
          : ['#FFFFFF', '#FBBF24', '#38BDF8'],
        isCrit ? 22 : 12,
        isCrit ? 240 : 170
      );
      const label = labelPrefix
        ? `${labelPrefix} -${damage}`
        : isCrit
          ? `CRIT -${damage}!`
          : `-${damage}`;
      addFloatingText(
        BOSS_HOME_X - 28 + (Math.random() - 0.5) * 46,
        BOSS_HOME_Y - 58 + (Math.random() - 0.5) * 20,
        label,
        isCrit ? '#FEF08A' : '#FFFFFF',
        isCrit ? 1.38 : 1.05
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
            state: 'idle',
            stateTimer: 0,
            stateDuration: 0,
            targetX: pos.x,
            targetY: pos.y,
            doubleHitPending: false,
            secondHitDamage: 0,
            secondHitCrit: false,
            bobOffset: idx * 0.9,
            jumpPhase: 0,
          });
        } else {
          existing.name = h.name;
          existing.heroClass = (h.heroClass || 'knight') as HeroClassId;
          existing.selectedHero = Boolean(h.selectedHero);
          existing.homeX = pos.x;
          existing.homeY = pos.y;
          if (existing.state === 'idle') {
            existing.x += (pos.x - existing.x) * 0.15;
            existing.y += (pos.y - existing.y) * 0.15;
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
            spawnBurst(actor.x, actor.y - 16, ['#34D399', '#FBBF24', '#FFFFFF'], 10, 120);
          }
        } else if (evt.type === 'hero_attack') {
          const actor = actors.get(evt.playerId);
          const heroClass = (evt.heroClass || 'knight') as HeroClassId;
          const meta = HERO_CLASS_MAP[heroClass] || HERO_CLASS_MAP.knight;
          const hits: number[] = Array.isArray(evt.hits) && evt.hits.length > 0 ? evt.hits : [evt.damage || 80];

          if (actor && (meta.attackStyle === 'melee_dash' || meta.attackStyle === 'double_dash')) {
            actor.state = 'dash_in';
            actor.stateTimer = 0;
            actor.stateDuration = 0.2;
            actor.targetX = BOSS_HOME_X - 120;
            actor.targetY = BOSS_HOME_Y + 46 + (Math.random() - 0.5) * 32;
            actor.doubleHitPending = meta.attackStyle === 'double_dash' && hits.length > 1;
            actor.secondHitDamage = hits[1] || 0;
            actor.secondHitCrit = Boolean(evt.isCritical);

            sound.play('slash');
            setTimeout(() => {
              slashEffects.push({
                x: BOSS_HOME_X - 42,
                y: BOSS_HOME_Y + 12,
                color: meta.projectileColor,
                angle: -0.6,
                life: 0.26,
                maxLife: 0.26,
                radius: 56,
              });
              hitBossVisual(hits[0], Boolean(evt.isCritical && hits.length === 1));
              if (evt.bonusShield > 0) {
                projectiles.push({
                  active: true,
                  kind: 'shield',
                  startX: actor.homeX,
                  startY: actor.homeY - 24,
                  targetX: CASTLE_X + 18,
                  targetY: CASTLE_Y - 12,
                  progress: 0,
                  duration: 0.42,
                  arcHeight: 45,
                  color: '#38BDF8',
                  trailColor: '#FBBF24',
                  onImpactLabel: `+${evt.bonusShield} SHIELD`,
                });
              }
            }, 190);
          } else if (actor) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.42;

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
              startX: actor.x + 16,
              startY: actor.y - 26,
              targetX: BOSS_HOME_X - 28,
              targetY: BOSS_HOME_Y + 6,
              progress: 0,
              duration: heroClass === 'archer' ? 0.28 : 0.4,
              arcHeight: heroClass === 'archer' ? 18 : 68,
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
                duration: 0.48,
                arcHeight: 55,
                color: '#34D399',
                trailColor: '#A7F3D0',
                onImpactLabel: `+${evt.bonusHeal} HP`,
              });
            }
          } else {
            hitBossVisual(evt.damage || 80, Boolean(evt.isCritical));
          }
        } else if (evt.type === 'hero_heal') {
          sound.play('heal');
          const actor = actors.get(evt.playerId);
          if (actor) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.5;
            spawnBurst(actor.x, actor.y - 20, ['#10B981', '#6EE7B7', '#FEF08A'], 12, 110);
          }
          projectiles.push({
            active: true,
            kind: 'heart',
            startX: actor ? actor.x : 260,
            startY: actor ? actor.y - 24 : 330,
            targetX: CASTLE_X + 12,
            targetY: CASTLE_Y - 24,
            progress: 0,
            duration: 0.48,
            arcHeight: 62,
            color: '#10B981',
            trailColor: '#A7F3D0',
            onImpactLabel: `+${evt.healAmount || 60} HP`,
          });
        } else if (evt.type === 'hero_shield') {
          sound.play('shield');
          const actor = actors.get(evt.playerId);
          if (actor) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.5;
            spawnBurst(actor.x, actor.y - 20, ['#38BDF8', '#FBBF24', '#E0F2FE'], 12, 110);
          }
          projectiles.push({
            active: true,
            kind: 'shield',
            startX: actor ? actor.x : 260,
            startY: actor ? actor.y - 24 : 330,
            targetX: CASTLE_X + 16,
            targetY: CASTLE_Y - 16,
            progress: 0,
            duration: 0.46,
            arcHeight: 50,
            color: '#38BDF8',
            trailColor: '#FBBF24',
            onImpactLabel: `+${evt.shieldAmount || 45} SHIELD`,
          });
        } else if (evt.type === 'boss_charge_start') {
          sound.play('boss_alarm');
          trauma = Math.min(1, trauma + 0.3);
        } else if (evt.type === 'boss_enraged') {
          sound.play('boss_alarm');
          trauma = Math.min(1, trauma + 0.7);
          spawnBurst(BOSS_HOME_X, BOSS_HOME_Y, ['#EF4444', '#F97316', '#FEF08A'], 32, 260);
          addFloatingText(BOSS_HOME_X - 18, BOSS_HOME_Y - 96, 'MODE ENRAGED!!', '#EF4444', 1.45);
        } else if (evt.type === 'boss_break') {
          sound.play('boss_stun');
          hitstopTimer = 0.065;
          trauma = Math.min(1, trauma + 0.72);
          bossFlashTimer = 0.16;
          bossRecoilX = 36;
          spawnBurst(BOSS_HOME_X - 10, BOSS_HOME_Y, ['#FACC15', '#34D399', '#FFFFFF'], 30, 250);
          addFloatingText(
            BOSS_HOME_X - 24,
            BOSS_HOME_Y - 92,
            `BREAK!! -${evt.damage || 100}`,
            '#34D399',
            1.45
          );
        } else if (evt.type === 'boss_ultimate_hit') {
          sound.play('boss_ult');
          bossAttackAnimTimer = 0.9;
          castleFlashTimer = 0.35;
          trauma = 1.0;
          const bossMeta = BOSS_META_MAP[(st.bossType || 'inferno-dragon') as BossType];
          beams.push({
            kind: 'boss_ult',
            life: 0.85,
            maxLife: 0.85,
            color: bossMeta?.ultimateColor || '#EF4444',
            coreColor: bossMeta?.secondaryColor || '#FEF08A',
          });
          spawnBurst(CASTLE_X + 35, CASTLE_Y - 12, ['#EF4444', '#F97316', '#CBD5E1'], 34, 240);
          addFloatingText(
            CASTLE_X + 24,
            CASTLE_Y - 92,
            evt.hpDamage > 0 ? `-${evt.hpDamage} HP!` : 'PERISAI TAHAN!',
            evt.hpDamage > 0 ? '#FB7185' : '#38BDF8',
            1.35
          );
        } else if (evt.type === 'mega_beam') {
          sound.play('mega_beam');
          hitstopTimer = 0.07;
          trauma = 0.92;
          bossFlashTimer = 0.25;
          bossRecoilX = 34;
          beams.push({
            kind: 'mega_beam',
            life: 1.05,
            maxLife: 1.05,
            color: '#10B981',
            coreColor: '#FEF08A',
          });
          for (const actor of actors.values()) {
            actor.state = 'cast';
            actor.stateTimer = 0;
            actor.stateDuration = 0.75;
          }
          spawnBurst(BOSS_HOME_X - 20, BOSS_HOME_Y, ['#34D399', '#FACC15', '#38BDF8', '#FFFFFF'], 42, 290);
          addFloatingText(
            BOSS_HOME_X - 30,
            BOSS_HOME_Y - 102,
            `MEGA BEAM -${evt.damage || 160}!`,
            '#FACC15',
            1.55
          );
        } else if (evt.type === 'victory') {
          sound.play('victory_8bit');
          bossExploded = true;
          trauma = 1.0;
          spawnBurst(
            BOSS_HOME_X,
            BOSS_HOME_Y,
            ['#EF4444', '#F97316', '#FACC15', '#34D399', '#FFFFFF', '#A855F7'],
            95,
            340
          );
          for (const actor of actors.values()) {
            actor.state = 'celebrate';
            actor.jumpPhase = Math.random() * Math.PI * 2;
          }
          addFloatingText(LOGICAL_W * 0.5, 168, 'BOSS DIKALAHKAN!', '#FACC15', 1.9);
        } else if (evt.type === 'defeat') {
          sound.play('defeat_8bit');
          trauma = 0.85;
          spawnBurst(CASTLE_X + 20, CASTLE_Y - 10, ['#94A3B8', '#475569', '#EF4444'], 45, 210);
          addFloatingText(LOGICAL_W * 0.5, 168, 'BENTENG RUNTUH!', '#FB7185', 1.8);
        }
      }
    }

    function drawPixelSky(ctx2: CanvasRenderingContext2D, enraged: number, t: number) {
      // Layered 16-bit sunset/night sky transitioning to crimson apocalyptic sky when enraged
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

      // Twinkling pixel stars
      for (const s of stars) {
        const blink = 0.45 + 0.55 * Math.sin(t * 2.8 + s.phase);
        ctx2.fillStyle = enraged > 0.5 ? `rgba(254, 202, 202, ${blink})` : `rgba(254, 249, 195, ${blink})`;
        ctx2.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
      }

      // Pixel moon
      const mx = 148;
      const my = 62;
      ctx2.fillStyle = enraged > 0.5 ? '#EF4444' : '#FEF08A';
      ctx2.fillRect(mx - 14, my - 14, 28, 28);
      ctx2.fillRect(mx - 18, my - 10, 36, 20);
      ctx2.fillRect(mx - 10, my - 18, 20, 36);
      // Crescent cutout
      ctx2.fillStyle = bands[0];
      ctx2.fillRect(mx - 4, my - 14, 18, 22);

      // Parallax pixel clouds
      for (const c of clouds) {
        ctx2.fillStyle = enraged > 0.5 ? 'rgba(127, 29, 29, 0.55)' : 'rgba(148, 163, 184, 0.24)';
        const cx = Math.round(c.x);
        const cy = Math.round(c.y);
        ctx2.fillRect(cx, cy, c.w, 12);
        ctx2.fillRect(cx + 14, cy - 8, c.w - 28, 10);
        ctx2.fillRect(cx + 24, cy - 14, c.w - 52, 8);
      }

      // Distant jagged pixel mountains
      ctx2.fillStyle = enraged > 0.5 ? '#2B0A12' : '#0D2636';
      const peaks = [
        [0, 330, 150, 210, 310, 330],
        [220, 340, 410, 190, 600, 340],
        [490, 340, 690, 205, 890, 340],
        [760, 340, 960, 200, 1180, 340],
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
      // Top mossy/volcanic rim
      ctx2.fillStyle = enraged > 0.5 ? '#991B1B' : '#065F46';
      ctx2.fillRect(0, GROUND_Y, LOGICAL_W, 10);
      ctx2.fillStyle = enraged > 0.5 ? '#DC2626' : '#10B981';
      for (let x = 0; x < LOGICAL_W; x += 24) {
        ctx2.fillRect(x, GROUND_Y, 14, 4);
      }
      // Rocky soil body
      ctx2.fillStyle = '#1E293B';
      ctx2.fillRect(0, GROUND_Y + 10, LOGICAL_W, LOGICAL_H - GROUND_Y);
      // Pixel cobblestone bricks
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
      flash: boolean,
      t: number
    ) {
      const baseX = 16;
      const baseY = GROUND_Y - 196;

      // Main fortress body
      ctx2.fillStyle = flash ? '#FFFFFF' : '#475569';
      ctx2.fillRect(baseX, baseY + 34, 114, 162);
      // Left tall watchtower
      ctx2.fillStyle = flash ? '#FFFFFF' : '#64748B';
      ctx2.fillRect(baseX + 8, baseY, 44, 196);
      // Battlements (crenellations)
      for (let i = 0; i < 6; i++) {
        ctx2.fillStyle = flash ? '#FFFFFF' : '#94A3B8';
        ctx2.fillRect(baseX + i * 20, baseY + 22, 12, 14);
      }
      for (let i = 0; i < 3; i++) {
        ctx2.fillRect(baseX + 6 + i * 16, baseY - 12, 10, 14);
      }

      // Emerald & Gold Royal Banner on tower
      const flutter = Math.round(Math.sin(t * 6) * 3);
      ctx2.fillStyle = '#E2E8F0';
      ctx2.fillRect(baseX + 28, baseY - 46, 4, 36);
      ctx2.fillStyle = '#059669';
      ctx2.fillRect(baseX + 32, baseY - 44, 30, 18);
      ctx2.fillStyle = '#FACC15';
      ctx2.fillRect(baseX + 42, baseY - 39, 10, 8);
      ctx2.fillStyle = '#047857';
      ctx2.fillRect(baseX + 58, baseY - 42 + flutter, 10, 14);

      // Stone brick details
      if (!flash) {
        ctx2.fillStyle = '#334155';
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 3; c++) {
            ctx2.fillRect(baseX + 10 + c * 34 + (r % 2) * 12, baseY + 46 + r * 24, 22, 8);
          }
        }
      }

      // Wooden arched castle gate
      ctx2.fillStyle = '#1E293B';
      ctx2.fillRect(baseX + 60, GROUND_Y - 68, 42, 68);
      ctx2.fillStyle = '#78350F';
      ctx2.fillRect(baseX + 65, GROUND_Y - 62, 32, 62);
      ctx2.fillStyle = '#92400E';
      ctx2.fillRect(baseX + 79, GROUND_Y - 62, 4, 62);

      // Cracks if Castle HP < 50%
      if (castleHpPct < 55 && !flash) {
        ctx2.fillStyle = '#0F172A';
        ctx2.fillRect(baseX + 26, baseY + 60, 4, 28);
        ctx2.fillRect(baseX + 30, baseY + 84, 12, 4);
        ctx2.fillRect(baseX + 86, baseY + 52, 4, 24);
      }

      // Twin flickering pixel torches!
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

      // Glowing Pixel Shield Barrier Dome when Castle Shield > 0
      if (castleShield > 0) {
        const pulse = 0.28 + 0.14 * Math.sin(t * 5);
        ctx2.save();
        ctx2.strokeStyle = `rgba(56, 189, 248, ${0.7 + pulse * 0.4})`;
        ctx2.lineWidth = 4;
        ctx2.fillStyle = `rgba(56, 189, 248, ${pulse * 0.45})`;
        ctx2.beginPath();
        ctx2.arc(baseX + 76, GROUND_Y - 56, 120, -Math.PI * 0.48, Math.PI * 0.15);
        ctx2.stroke();
        ctx2.fill();
        ctx2.restore();
      }
    }

    function drawBoss(ctx2: CanvasRenderingContext2D, st: any, t: number) {
      if (bossExploded || !st) return;
      const bossType = (st.bossType || 'inferno-dragon') as BossType;
      const isEnraged = Boolean(st.bossEnraged);
      const isStunned = Boolean(st.bossStunned);
      const isCharging = st.ultimate?.status === 'charging';

      const speed = isEnraged ? 5.8 : 2.8;
      const bobY = isStunned ? 10 : Math.sin(t * speed) * (isEnraged ? 11 : 7);
      const rageJitterX = isEnraged && !isStunned ? Math.sin(t * 28) * 3 : 0;
      const bx = Math.round(BOSS_HOME_X + bossRecoilX + rageJitterX);
      const by = Math.round(BOSS_HOME_Y + bobY);

      // Ground shadow
      ctx2.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx2.fillRect(bx - 76, GROUND_Y - 8, 152, 16);

      // Phase 2 Enraged crimson aura + pixel lightning bolts
      if (isEnraged && !isStunned) {
        const auraR = 104 + Math.sin(t * 10) * 10;
        const grad = ctx2.createRadialGradient(bx, by, 24, bx, by, auraR);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.48)');
        grad.addColorStop(0.65, 'rgba(249, 115, 22, 0.22)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx2.fillStyle = grad;
        ctx2.fillRect(bx - auraR, by - auraR, auraR * 2, auraR * 2);

        // Jagged red pixel lightning sparks
        if (Math.floor(t * 12) % 2 === 0) {
          ctx2.strokeStyle = '#FCA5A5';
          ctx2.lineWidth = 3;
          ctx2.beginPath();
          ctx2.moveTo(bx - 88, by - 72);
          ctx2.lineTo(bx - 72, by - 46);
          ctx2.lineTo(bx - 92, by - 22);
          ctx2.stroke();
        }
      }

      // Charging Ultimate expanding energy ring
      if (isCharging) {
        const chargePct =
          1 -
          Math.max(
            0,
            Math.min(1, (st.ultimate?.chargeRemainingSec ?? 5) / (st.ultimate?.chargeDurationSec || 10))
          );
        const ringR = 54 + chargePct * 72 + Math.sin(t * 18) * 6;
        ctx2.save();
        ctx2.strokeStyle = '#EF4444';
        ctx2.lineWidth = 6;
        ctx2.beginPath();
        ctx2.arc(bx - 20, by, ringR, 0, Math.PI * 2);
        ctx2.stroke();

        ctx2.strokeStyle = '#FACC15';
        ctx2.lineWidth = 3;
        ctx2.beginPath();
        ctx2.arc(bx - 20, by, ringR * 0.72, 0, Math.PI * 2);
        ctx2.stroke();
        ctx2.restore();
      }

      // Draw crisp 32x32 Boss pixel sprite scaled 6x (192x192)
      const useAttackFrame =
        bossAttackAnimTimer > 0 || isCharging || (isEnraged && Math.floor(t * 4) % 2 === 0);
      const sprite = getBossSpriteCanvas(
        bossType,
        useAttackFrame ? 'attack' : 'idle',
        bossFlashTimer > 0
      );
      const drawSize = 198;
      ctx2.save();
      ctx2.imageSmoothingEnabled = false;
      ctx2.translate(bx, by);
      if (isStunned) {
        ctx2.rotate(0.14);
      }
      ctx2.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      ctx2.restore();

      // Orbiting pixel stars when Boss is STUNNED!
      if (isStunned) {
        const starSprite = getPropSpriteCanvas('star');
        for (let i = 0; i < 3; i++) {
          const ang = t * 4.2 + (i * Math.PI * 2) / 3;
          const sx = bx + Math.cos(ang) * 58 - 10;
          const sy = by - 96 + Math.sin(ang) * 14 - 10;
          ctx2.imageSmoothingEnabled = false;
          ctx2.drawImage(starSprite, Math.round(sx), Math.round(sy), 20, 20);
        }
      }
    }

    function drawHeroes(ctx2: CanvasRenderingContext2D, st: any, t: number) {
      const sorted = Array.from(actors.values()).sort((a, b) => a.y - b.y);
      const heroSize = sorted.length > 12 ? 48 : 56;
      const isHeroSelect = st?.phase === 'hero_select';

      for (const actor of sorted) {
        const isAttacking =
          actor.state === 'dash_in' || actor.state === 'attack_hold' || actor.state === 'cast';
        let offsetY = 0;
        if (actor.state === 'celebrate') {
          offsetY = -Math.abs(Math.sin(t * 7 + actor.jumpPhase)) * 26;
        } else if (actor.state === 'idle') {
          offsetY = Math.sin(t * 3.8 + actor.bobOffset) * 3;
        }

        const drawX = Math.round(actor.x);
        const drawY = Math.round(actor.y + offsetY);

        // Shadow
        ctx2.fillStyle = 'rgba(0, 0, 0, 0.36)';
        ctx2.fillRect(drawX - 18, Math.round(actor.y) - 4, 36, 7);

        // Rogue crimson afterimage while dashing
        if (actor.heroClass === 'rogue' && (actor.state === 'dash_in' || actor.state === 'dash_back')) {
          ctx2.save();
          ctx2.globalAlpha = 0.38;
          ctx2.imageSmoothingEnabled = false;
          const ghost = getHeroSpriteCanvas('rogue', 'attack');
          ctx2.drawImage(ghost, drawX - heroSize / 2 - 18, drawY - heroSize, heroSize, heroSize);
          ctx2.restore();
        }

        // Crisp 16x16 Hero sprite
        const sprite = getHeroSpriteCanvas(actor.heroClass, isAttacking ? 'attack' : 'idle');
        ctx2.imageSmoothingEnabled = false;
        ctx2.drawImage(sprite, drawX - heroSize / 2, drawY - heroSize, heroSize, heroSize);

        // Nameplate above Hero head
        const label = actor.name.length > 10 ? `${actor.name.slice(0, 9)}..` : actor.name;
        ctx2.font = 'bold 11px ui-monospace, SFMono-Regular, Menlo, monospace';
        const textW = ctx2.measureText(label).width;
        const padX = 5;
        const boxW = Math.ceil(textW + padX * 2);
        const boxX = Math.round(drawX - boxW / 2);
        const boxY = Math.round(drawY - heroSize - 18);

        ctx2.fillStyle = actor.selectedHero ? 'rgba(2, 44, 34, 0.88)' : 'rgba(15, 23, 42, 0.82)';
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

    function drawProjectilesAndEffects(ctx2: CanvasRenderingContext2D) {
      // Beams (Mega Pixel Beam or Boss Ultimate Laser)
      for (const b of beams) {
        const alpha = Math.min(1, (b.life / b.maxLife) * 1.4);
        ctx2.save();
        ctx2.globalAlpha = alpha;
        if (b.kind === 'mega_beam') {
          const yCenter = BOSS_HOME_Y + 8;
          const beamH = 62 + Math.sin(elapsed * 40) * 8;
          // Converging hero rays
          for (const actor of actors.values()) {
            ctx2.strokeStyle = HERO_CLASS_MAP[actor.heroClass]?.accentColor || '#34D399';
            ctx2.lineWidth = 5;
            ctx2.beginPath();
            ctx2.moveTo(actor.x + 12, actor.y - 24);
            ctx2.lineTo(445, yCenter);
            ctx2.stroke();
          }
          // Colossal horizontal Mega Pixel Beam
          ctx2.fillStyle = '#059669';
          ctx2.fillRect(435, yCenter - beamH / 2 - 8, BOSS_HOME_X - 425, beamH + 16);
          ctx2.fillStyle = '#34D399';
          ctx2.fillRect(435, yCenter - beamH / 2, BOSS_HOME_X - 425, beamH);
          ctx2.fillStyle = '#FEF08A';
          ctx2.fillRect(435, yCenter - beamH * 0.25, BOSS_HOME_X - 425, beamH * 0.5);
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(435, yCenter - 7, BOSS_HOME_X - 425, 14);
        } else {
          // Boss Ultimate Blast into Castle
          const yStart = BOSS_HOME_Y + 2;
          const yEnd = CASTLE_Y - 12;
          ctx2.strokeStyle = b.color;
          ctx2.lineWidth = 54;
          ctx2.beginPath();
          ctx2.moveTo(BOSS_HOME_X - 60, yStart);
          ctx2.lineTo(CASTLE_X + 20, yEnd);
          ctx2.stroke();

          ctx2.strokeStyle = b.coreColor;
          ctx2.lineWidth = 22;
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
        const u = Math.min(1, p.progress);
        const px = p.startX + (p.targetX - p.startX) * u;
        const py = p.startY + (p.targetY - p.startY) * u - Math.sin(u * Math.PI) * p.arcHeight;

        ctx2.imageSmoothingEnabled = false;
        if (p.kind === 'heart') {
          ctx2.drawImage(getPropSpriteCanvas('heart'), Math.round(px - 12), Math.round(py - 12), 24, 24);
        } else if (p.kind === 'shield') {
          ctx2.drawImage(getPropSpriteCanvas('shield'), Math.round(px - 12), Math.round(py - 12), 24, 24);
        } else if (p.kind === 'arrow') {
          ctx2.fillStyle = p.trailColor;
          ctx2.fillRect(Math.round(px - 18), Math.round(py - 3), 26, 6);
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(Math.round(px + 2), Math.round(py - 5), 10, 10);
        } else {
          // Pixel fireball / holy orb
          ctx2.fillStyle = p.color;
          ctx2.fillRect(Math.round(px - 11), Math.round(py - 11), 22, 22);
          ctx2.fillStyle = p.trailColor;
          ctx2.fillRect(Math.round(px - 7), Math.round(py - 7), 14, 14);
          ctx2.fillStyle = '#FFFFFF';
          ctx2.fillRect(Math.round(px - 3), Math.round(py - 3), 6, 6);
        }
      }

      // Sword / Ninja Slash Arcs
      for (const s of slashEffects) {
        const alpha = Math.max(0, s.life / s.maxLife);
        ctx2.save();
        ctx2.globalAlpha = alpha;
        ctx2.translate(s.x, s.y);
        ctx2.rotate(s.angle);
        ctx2.strokeStyle = s.color;
        ctx2.lineWidth = 10;
        ctx2.beginPath();
        ctx2.arc(0, 0, s.radius, -1.1, 1.1);
        ctx2.stroke();
        ctx2.strokeStyle = '#FFFFFF';
        ctx2.lineWidth = 4;
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

      // Retro outlined floating damage / heal numbers
      for (const ft of floatingTexts) {
        const alpha = Math.max(0, Math.min(1, ft.life / (ft.maxLife * 0.45)));
        const fontSize = Math.round(20 * ft.scale);
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
    }

    function step(now: number) {
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsed += dt;

      const st = gameStateRef.current;
      syncActorsFromState(st);
      processIncomingEvents(st);

      // Tick shake, flash & hitstop in real time
      trauma = Math.max(0, trauma - dt * 1.9);
      bossFlashTimer = Math.max(0, bossFlashTimer - dt);
      castleFlashTimer = Math.max(0, castleFlashTimer - dt);
      bossAttackAnimTimer = Math.max(0, bossAttackAnimTimer - dt);
      bossRecoilX *= Math.pow(0.001, dt);

      const targetEnraged = st?.bossEnraged ? 1 : 0;
      enragedBlend += (targetEnraged - enragedBlend) * Math.min(1, dt * 3);

      let simDt = dt;
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
        simDt = 0;
      }

      if (simDt > 0) {
        // Parallax clouds
        for (const c of clouds) {
          c.x -= c.speed * simDt;
          if (c.x + c.w < -20) c.x = LOGICAL_W + 20;
        }

        // Ambient floating embers
        emberSpawnAccum += simDt;
        const emberInterval = enragedBlend > 0.5 ? 0.08 : 0.2;
        if (emberSpawnAccum >= emberInterval) {
          emberSpawnAccum = 0;
          spawnParticle(
            Math.random() * LOGICAL_W,
            GROUND_Y - 4,
            (Math.random() - 0.5) * 28,
            -38 - Math.random() * 44,
            enragedBlend > 0.5 ? '#FB923C' : '#FDE047',
            3,
            1.4 + Math.random() * 1.1,
            -8
          );
        }

        // Update Hero actor movement state machine
        for (const actor of actors.values()) {
          if (actor.state === 'dash_in') {
            actor.stateTimer += simDt;
            const u = Math.min(1, actor.stateTimer / actor.stateDuration);
            actor.x = actor.homeX + (actor.targetX - actor.homeX) * u;
            actor.y = actor.homeY + (actor.targetY - actor.homeY) * u;
            if (u >= 1) {
              actor.state = 'attack_hold';
              actor.stateTimer = 0;
              actor.stateDuration = actor.doubleHitPending ? 0.24 : 0.16;
            }
          } else if (actor.state === 'attack_hold') {
            actor.stateTimer += simDt;
            if (actor.doubleHitPending && actor.stateTimer >= 0.12) {
              actor.doubleHitPending = false;
              sound.play('slash');
              slashEffects.push({
                x: BOSS_HOME_X - 34,
                y: BOSS_HOME_Y + 4,
                color: '#FB7185',
                angle: 0.75,
                life: 0.24,
                maxLife: 0.24,
                radius: 58,
              });
              hitBossVisual(actor.secondHitDamage, actor.secondHitCrit);
            }
            if (actor.stateTimer >= actor.stateDuration) {
              actor.state = 'dash_back';
              actor.stateTimer = 0;
              actor.stateDuration = 0.22;
            }
          } else if (actor.state === 'dash_back') {
            actor.stateTimer += simDt;
            const u = Math.min(1, actor.stateTimer / actor.stateDuration);
            actor.x = actor.targetX + (actor.homeX - actor.targetX) * u;
            actor.y = actor.targetY + (actor.homeY - actor.targetY) * u - Math.sin(u * Math.PI) * 26;
            if (u >= 1) {
              actor.x = actor.homeX;
              actor.y = actor.homeY;
              actor.state = 'idle';
            }
          } else if (actor.state === 'cast') {
            actor.stateTimer += simDt;
            if (actor.stateTimer >= actor.stateDuration) {
              actor.state = 'idle';
            }
          }
        }

        // Update projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.progress += simDt / p.duration;
          const u = Math.min(1, p.progress);
          const px = p.startX + (p.targetX - p.startX) * u;
          const py = p.startY + (p.targetY - p.startY) * u - Math.sin(u * Math.PI) * p.arcHeight;
          spawnParticle(px, py, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, p.trailColor, 4, 0.22, 0);

          if (p.progress >= 1) {
            if (p.onImpactDamage) {
              hitBossVisual(p.onImpactDamage, Boolean(p.onImpactCrit));
            } else if (p.onImpactLabel) {
              spawnBurst(p.targetX, p.targetY, [p.color, p.trailColor, '#FFFFFF'], 14, 140);
              addFloatingText(p.targetX + 16, p.targetY - 30, p.onImpactLabel, p.color, 1.15);
            }
            projectiles.splice(i, 1);
          }
        }

        // Update slash effects
        for (let i = slashEffects.length - 1; i >= 0; i--) {
          slashEffects[i].life -= simDt;
          if (slashEffects[i].life <= 0) slashEffects.splice(i, 1);
        }

        // Update beams
        for (let i = beams.length - 1; i >= 0; i--) {
          beams[i].life -= simDt;
          if (beams[i].life <= 0) beams.splice(i, 1);
        }

        // Update floating texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
          const ft = floatingTexts[i];
          ft.y += ft.vy * simDt;
          ft.vy *= 0.94;
          ft.life -= simDt;
          if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        // Update pooled particles
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
      const shakeMag = trauma * trauma * 16;
      if (shakeMag > 0.2) {
        const sx = (Math.random() - 0.5) * 2 * shakeMag;
        const sy = (Math.random() - 0.5) * 2 * shakeMag;
        g.translate(Math.round(sx), Math.round(sy));
      }

      drawPixelSky(g, enragedBlend, elapsed);
      drawPixelGround(g, enragedBlend);

      const castleHpPct = st ? (st.castleHp / Math.max(1, st.castleMaxHp)) * 100 : 100;
      drawPixelCastle(g, castleHpPct, st?.castleShield || 0, castleFlashTimer > 0, elapsed);
      drawBoss(g, st, elapsed);
      drawHeroes(g, st, elapsed);
      drawProjectilesAndEffects(g);

      g.restore();

      rafId = requestAnimationFrame(step);
    }

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [hasGameState]);

  if (!gameState) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-slate-950 font-mono-num text-lg font-bold text-emerald-300">
        MEMUAT ARENA PIXEL HEROES...
      </div>
    );
  }

  const bossPct = Math.max(0, Math.min(100, (gameState.bossHp / Math.max(1, gameState.bossMaxHp)) * 100));
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
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 bg-[#09131C] px-3 py-3 text-white sm:px-5"
    >
      {/* TOP RETRO 16-BIT RPG HUD BAR */}
      <div className="pixel-panel grid grid-cols-1 gap-3 rounded-xl border-2 border-emerald-500/40 bg-[#0D1E2B] p-3 lg:grid-cols-12 lg:items-center">
        {/* LEFT: CASTLE HP & SHIELD */}
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <div className="flex items-center justify-between font-mono-num text-xs font-extrabold">
            <span className="text-emerald-300">HP BENTENG</span>
            <span className="text-white">
              {gameState.castleHp}/{gameState.castleMaxHp}
            </span>
          </div>
          <div className="relative h-4 w-full overflow-hidden border-2 border-slate-950 bg-slate-900">
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
              <Shield className="h-3.5 w-3.5" />
              PERISAI
            </span>
            <span>{gameState.castleShield}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden border border-slate-950 bg-slate-900">
            <div
              className="h-full bg-sky-400 transition-all duration-200"
              style={{ width: `${shieldPct}%` }}
            />
          </div>
        </div>

        {/* CENTER: BOSS HP BAR + COMBO FEVER METER */}
        <div className="flex flex-col gap-2 lg:col-span-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Flame
                className={`h-5 w-5 ${
                  gameState.bossEnraged ? 'text-rose-400 animate-pulse' : 'text-amber-400'
                }`}
              />
              <h1 className="font-mono-num text-base font-black tracking-wide text-amber-200 sm:text-lg">
                {gameState.bossName.toUpperCase()}
              </h1>
              {gameState.bossEnraged && (
                <span className="border border-rose-400 bg-rose-700 px-2 py-0.5 font-mono-num text-[11px] font-black text-white">
                  FASE 2: ENRAGED!
                </span>
              )}
              {gameState.bossStunned && (
                <span className="border border-emerald-300 bg-emerald-600 px-2 py-0.5 font-mono-num text-[11px] font-black text-white">
                  STUNNED {gameState.bossStunnedRemainingSec}d
                </span>
              )}
            </div>
            <span
              data-testid="boss-hp-value"
              className="font-mono-num text-sm font-black text-white sm:text-base"
            >
              {gameState.bossHp} / {gameState.bossMaxHp} HP
            </span>
          </div>

          {/* Boss HP Bar with trailing drain ghost */}
          <div className="relative h-6 w-full overflow-hidden border-2 border-amber-400/70 bg-slate-950">
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
          </div>

          {/* Combo Fever Bar */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex shrink-0 items-center gap-1 font-mono-num text-[11px] font-black text-amber-300">
              <Zap className="h-3.5 w-3.5 fill-current" />
              COMBO FEVER
            </span>
            <div className="h-3 flex-1 overflow-hidden border border-amber-400/40 bg-slate-950">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-yellow-400 transition-all duration-200"
                style={{ width: `${comboPct}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono-num text-xs font-black text-amber-200">
              {comboPct}%
            </span>
          </div>
        </div>

        {/* RIGHT: TIMER & HOST CONTROLS */}
        <div className="flex items-center justify-between gap-2 lg:col-span-3 lg:justify-end">
          <div className="flex items-center gap-2 border-2 border-emerald-500/40 bg-slate-950 px-3 py-1.5 font-mono-num">
            <Timer className="h-4 w-4 text-amber-300" />
            <div className="leading-tight">
              <p className="text-[10px] font-bold text-emerald-300">
                {isHeroSelect ? 'PILIH HERO' : 'WAKTU'}
              </p>
              <p className="text-lg font-black text-white">
                {isHeroSelect ? `${gameState.heroSelectRemainingSec}d` : `${gameState.remainingSec}d`}
              </p>
            </div>
          </div>

          {isHeroSelect ? (
            <button
              type="button"
              onClick={handleStartBattleNow}
              className="pixel-btn inline-flex items-center gap-1.5 border-2 border-emerald-300 bg-emerald-600 px-3.5 py-2 font-mono-num text-xs font-black text-white hover:bg-emerald-500 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4 fill-current" />
              <span>MULAI SEKARANG</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                sound.play('click');
                onForceEnd();
              }}
              className="pixel-btn inline-flex items-center gap-1.5 border-2 border-rose-400/70 bg-rose-700 px-3.5 py-2 font-mono-num text-xs font-black text-white hover:bg-rose-600 whitespace-nowrap shrink-0"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>AKHIRI</span>
            </button>
          )}
        </div>
      </div>

      {/* MAIN 60FPS HTML5 CANVAS 2D STAGE */}
      <div className="relative overflow-hidden rounded-xl border-4 border-emerald-900 bg-slate-950 shadow-xl">
        <canvas
          ref={canvasRef}
          data-testid="pixel-battle-canvas"
          className="pixelated block aspect-[1160/490] w-full"
        />

        {/* PHASE 1: HERO SELECT OVERLAY BANNER (Top calm strip, never hides Hero formation!) */}
        {isHeroSelect && (
          <div className="pointer-events-none absolute inset-x-4 top-3 flex justify-center">
            <div className="pixel-panel border-2 border-amber-400 bg-[#062E24]/95 px-5 py-2.5 text-center">
              <p className="font-mono-num text-sm font-black tracking-wide text-amber-300 sm:text-base">
                FASE PILIH HERO PIXEL ({gameState.heroSelectRemainingSec} DETIK)
              </p>
              <p className="mt-0.5 font-mono-num text-xs text-emerald-100">
                Siswa mengetuk kelas Hero di HP — karakter langsung berbaris di arena!
              </p>
            </div>
          </div>
        )}

        {/* BOSS ULTIMATE / BREAK WARNING BANNER */}
        {isCharging && (
          <div className="pointer-events-none absolute inset-x-4 top-3 flex justify-center">
            <div className="pixel-panel w-full max-w-2xl border-2 border-amber-300 bg-rose-900/95 px-4 py-2.5 text-center">
              <div className="flex items-center justify-center gap-2 font-mono-num text-sm font-black text-amber-200 sm:text-base">
                <AlertTriangle className="h-5 w-5 animate-bounce text-amber-300" />
                <span>⚠️ BOSS MENGISI ULTIMATE! JAWAB SOAL UNTUK BREAK!</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
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
      </div>

      {/* BOTTOM RETRO RPG BAR: LIVE BATTLE LOG + TOP MVP HEROES */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Live Battle Log */}
        <section className="pixel-panel rounded-xl border-2 border-emerald-500/35 bg-[#0D1E2B] px-4 py-2.5 lg:col-span-7">
          <p className="mb-1 font-mono-num text-[11px] font-black uppercase tracking-wider text-emerald-300">
            LIVE BATTLE LOG
          </p>
          <div className="flex flex-col gap-1 font-mono-num text-xs">
            {(gameState.battleLog || []).slice(0, 3).map((line: string, idx: number) => (
              <p
                key={`${idx}-${line}`}
                className={`truncate ${idx === 0 ? 'font-bold text-amber-200' : 'text-slate-300'}`}
              >
                &gt; {line}
              </p>
            ))}
          </div>
        </section>

        {/* Top 3 MVP Contributors */}
        <section className="pixel-panel rounded-xl border-2 border-amber-400/35 bg-[#0D1E2B] px-4 py-2.5 lg:col-span-5">
          <div className="mb-1 flex items-center justify-between font-mono-num text-[11px] font-black uppercase tracking-wider text-amber-300">
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              TOP HERO KELAS
            </span>
            <span className="text-emerald-300">
              {(gameState.heroes || []).length} HERO AKTIF
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(gameState.leaderboard || []).slice(0, 3).map((p: any, idx: number) => {
              const cls = HERO_CLASS_MAP[(p.heroClass || 'knight') as HeroClassId];
              return (
                <div
                  key={p.playerId}
                  className="truncate border border-emerald-500/30 bg-slate-950/90 px-2.5 py-1.5 font-mono-num"
                >
                  <p className="truncate text-xs font-extrabold text-white">
                    #{idx + 1} {p.name}
                  </p>
                  <p className="text-[11px] font-bold" style={{ color: cls?.accentColor || '#34D399' }}>
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
