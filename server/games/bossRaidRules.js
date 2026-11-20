/**
 * Pure decoupled rules & balance calculations for "Boss Raid: Pixel Heroes v3".
 * Features:
 * - Balanced 5-Hero ecosystem with equalized Podium score parity (~245-255 pts/action)
 * - 5 distinct automatic class specialties (Tank Ward, Overheal+Team Buff, Armor Pierce, 2x Break, 1.6x Fever)
 * - Boss Max HP scaled by BOTH Player Count AND Battle Duration (climax at ~80-90% timer)
 * - Proportional Combo Fever (prevents 30-student Mega Beam spam) & fair counter-attack scaling
 * - Zero-distraction Team Composition & Smart Action Recommendation helpers
 */

export const HERO_CLASSES = {
  knight: {
    id: 'knight',
    name: 'Ksatria',
    englishName: 'Knight',
    skillName: 'Tebasan Perisai',
    roleHint: 'Pelindung: Perisai 2x + Benteng Kebal 25%',
    skillDamageMult: 1.0,
    hits: 1,
    critChance: 0.16,
    critMultiplier: 1.6,
    bonusShieldOnSkill: 40,
    bonusHealOnSkill: 0,
    healActionPower: 70,
    shieldActionPower: 110,
    breakContribution: 1,
    feverMultiplier: 1.0,
    armorPierce: false,
    minionDamageMult: 1.15,
    passiveScoreBonus: 0,
    bonusShieldPointMult: 1.75,
    bonusHealPointMult: 2.5,
  },
  mage: {
    id: 'mage',
    name: 'Penyihir',
    englishName: 'Mage',
    skillName: 'Bola Api Sihir',
    roleHint: 'Tembus Armor Batu & Damage Minion +35%',
    skillDamageMult: 1.38,
    hits: 1,
    critChance: 0.16,
    critMultiplier: 1.65,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 0,
    healActionPower: 70,
    shieldActionPower: 50,
    breakContribution: 1,
    feverMultiplier: 1.0,
    armorPierce: true,
    minionDamageMult: 1.45,
    passiveScoreBonus: 0,
    bonusShieldPointMult: 1.75,
    bonusHealPointMult: 2.5,
  },
  archer: {
    id: 'archer',
    name: 'Pemanah',
    englishName: 'Archer',
    skillName: 'Panah Cahaya',
    roleHint: 'Crit 2x + Spesialis BREAK 2x Lebih Cepat',
    skillDamageMult: 1.04,
    hits: 1,
    critChance: 0.48,
    critMultiplier: 1.75,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 0,
    healActionPower: 70,
    shieldActionPower: 50,
    breakContribution: 2,
    feverMultiplier: 1.0,
    armorPierce: false,
    minionDamageMult: 1.15,
    passiveScoreBonus: 18,
    bonusShieldPointMult: 1.75,
    bonusHealPointMult: 2.5,
  },
  healer: {
    id: 'healer',
    name: 'Tabib',
    englishName: 'Healer',
    skillName: 'Gelombang Cahaya',
    roleHint: 'Heal 2x + Overheal Perisai & Buff Tim +15%',
    skillDamageMult: 0.85,
    hits: 1,
    critChance: 0.14,
    critMultiplier: 1.5,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 40,
    healActionPower: 140,
    shieldActionPower: 55,
    breakContribution: 1,
    feverMultiplier: 1.0,
    armorPierce: false,
    minionDamageMult: 1.1,
    passiveScoreBonus: 0,
    bonusShieldPointMult: 1.75,
    bonusHealPointMult: 2.5,
  },
  rogue: {
    id: 'rogue',
    name: 'Ninja',
    englishName: 'Rogue',
    skillName: 'Tebasan Bayangan 2x',
    roleHint: 'Tebas 2x + Isi Combo Mega Beam 1,6x Cepat',
    skillDamageMult: 0.63,
    hits: 2,
    critChance: 0.24,
    critMultiplier: 1.6,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 0,
    healActionPower: 70,
    shieldActionPower: 50,
    breakContribution: 1,
    feverMultiplier: 1.6,
    armorPierce: false,
    minionDamageMult: 1.25,
    passiveScoreBonus: 14,
    bonusShieldPointMult: 1.75,
    bonusHealPointMult: 2.5,
  },
};

export const HERO_CLASS_IDS = Object.keys(HERO_CLASSES);

export const BOSS_CONFIGS = {
  'inferno-dragon': {
    id: 'inferno-dragon',
    name: 'Naga Api',
    subtitle: 'Inferno Dragon',
    ultimateName: 'Semburan Api Neraka',
    traitName: 'Bara Api (Burn)',
    traitDesc: 'Membakar Benteng perlahan; padamkan dengan jurus Heal!',
    minionName: 'Slime Api',
    accentColor: '#EF4444',
  },
  'titan-golem': {
    id: 'titan-golem',
    name: 'Titan Golem',
    subtitle: 'Ancient Stone Colossus',
    ultimateName: 'Hantaman Gempa Kristal',
    traitName: 'Armor Batu',
    traitDesc: 'Mengaktifkan perisai batu (40% kebal); Penyihir mampu menembusnya!',
    minionName: 'Golem Mini',
    accentColor: '#F59E0B',
  },
  'dark-overlord': {
    id: 'dark-overlord',
    name: 'Raja Kegelapan',
    subtitle: 'Dark Overlord',
    ultimateName: 'Laser Gerhana Kegelapan',
    traitName: 'Soul Drain',
    traitDesc: 'Menyerap energi dari jawaban salah (dibatasi aman agar adil).',
    minionName: 'Tengkorak Bayangan',
    accentColor: '#A855F7',
  },
};

/**
 * hpPerPlayer is calibrated for a standard 120-second (2-minute) battle
 * so the Boss falls dramatically around 80%-90% of the chosen duration.
 */
export const RAID_LEVELS = {
  santai: {
    id: 'santai',
    label: 'Lv. 1 — Santai (Pemula)',
    hpPerPlayer: 720,
    minHp: 700,
    breakRatio: 0.42,
    ultDamageRatio: 0.24,
    enragedUltRatio: 0.3,
    enablePhaseGate: false,
    enableBossTrait: false,
    enableMinions: false,
    enableClassSync: false,
    enableLastStand: false,
    wrongFeverPenalty: 0,
  },
  standar: {
    id: 'standar',
    label: 'Lv. 2 — Standar (Rekomendasi Kelas)',
    hpPerPlayer: 1050,
    minHp: 950,
    breakRatio: 0.5,
    ultDamageRatio: 0.3,
    enragedUltRatio: 0.38,
    enablePhaseGate: true,
    enableBossTrait: true,
    enableMinions: false,
    enableClassSync: false,
    enableLastStand: false,
    wrongFeverPenalty: 3,
  },
  epik: {
    id: 'epik',
    label: 'Lv. 3 — Epik (Boss Mythic)',
    hpPerPlayer: 1300,
    minHp: 1200,
    breakRatio: 0.58,
    ultDamageRatio: 0.34,
    enragedUltRatio: 0.42,
    enablePhaseGate: true,
    enableBossTrait: true,
    enableMinions: true,
    enableClassSync: true,
    enableLastStand: true,
    wrongFeverPenalty: 5,
  },
};

export function normalizeHeroClass(heroClass) {
  return HERO_CLASSES[heroClass] ? heroClass : 'knight';
}

export function normalizeBossType(bossType) {
  return BOSS_CONFIGS[bossType] ? bossType : 'inferno-dragon';
}

export function normalizeRaidLevel(level) {
  return RAID_LEVELS[level] ? level : 'standar';
}

/**
 * Computes balanced Boss Max HP scaled by BOTH student count AND battle duration.
 * Calibrated around 120s so a 60s battle has ~0.5x HP and a 180s battle has ~1.5x HP,
 * ensuring the Boss does NOT die too early before the teacher's configured timer.
 */
export function computeScaledBossHp({
  playerCount,
  raidLevel = 'standar',
  durationSec = 120,
  manualBossHp = 0,
}) {
  const manual = Number(manualBossHp) || 0;
  if (manual >= 300) {
    return Math.round(manual);
  }
  const cfg = RAID_LEVELS[normalizeRaidLevel(raidLevel)];
  const count = Math.max(1, Number(playerCount) || 1);
  const clampedDuration = Math.max(30, Math.min(300, Number(durationSec) || 120));
  const durationFactor = clampedDuration / 120;
  const scaledMinHp = Math.max(450, Math.round(cfg.minHp * Math.max(0.5, durationFactor)));
  const scaledHp = Math.round(count * cfg.hpPerPlayer * durationFactor);
  // Round neatly to nearest 50 HP for crisp retro RPG numbers
  return Math.max(scaledMinHp, Math.round(scaledHp / 50) * 50);
}

export function isBossEnraged(bossHp, bossMaxHp) {
  if (bossMaxHp <= 0) return false;
  return bossHp > 0 && bossHp < bossMaxHp * 0.5;
}

export function isBossLastStand(bossHp, bossMaxHp) {
  if (bossMaxHp <= 0) return false;
  return bossHp > 0 && bossHp <= bossMaxHp * 0.15;
}

export function computeBreakTarget(connectedPlayerCount, raidLevel = 'standar') {
  const count = Math.max(1, Number(connectedPlayerCount) || 1);
  const cfg = RAID_LEVELS[normalizeRaidLevel(raidLevel)];
  if (count === 1) return 2;
  if (count === 2) return 3;
  return Math.max(3, Math.ceil(count * cfg.breakRatio));
}

/**
 * Proportional Combo Fever gain (0..100 scale):
 * Scales linearly with classroom size (~1.45 answers per student) so a 30-student class
 * triggers 2-3 epic MEGA PIXEL BEAMS in a 2-minute fight instead of spamming every 12s.
 * - Rogue (Ninja) fills Combo Fever 1.6x faster.
 * - Full Team Formation grants +10% Fever speed.
 * - Heroic Spirit Comeback (<30% Castle HP) grants 1.5x Fever speed.
 */
export function computeComboFeverGain(
  connectedPlayerCount,
  castleHp = 500,
  castleMaxHp = 500,
  options = {}
) {
  const count = Math.max(1, Number(connectedPlayerCount) || 1);
  const heroCfg = options.heroClass ? HERO_CLASSES[normalizeHeroClass(options.heroClass)] : null;
  const heroMult = heroCfg ? heroCfg.feverMultiplier : 1.0;
  const formationMult = options.hasFullFormation ? 1.1 : 1.0;

  // Target correct answers needed to reach 100% Fever: min 6 for tiny groups, ~1.45*count for full classes
  const targetAnswers = Math.max(6, count * 1.45);
  const baseGain = 100 / targetAnswers;
  const isComeback = castleMaxHp > 0 && castleHp / castleMaxHp < 0.3;
  const comebackMult = isComeback ? 1.5 : 1.0;

  return Math.max(1.5, Number((baseGain * heroMult * formationMult * comebackMult).toFixed(2)));
}

/**
 * Scales Boss counter-attack damage from wrong answers gently by class size,
 * so a single tricky question in a 30-student classroom doesn't unfairly nuke the Castle.
 * Knight's Bastion Ward reduces incoming damage by 25%.
 */
export function computeWrongAnswerCounterDamage({
  connectedPlayerCount = 1,
  isEnraged = false,
  hasKnightWard = false,
}) {
  const count = Math.max(1, Number(connectedPlayerCount) || 1);
  const base = isEnraged ? 15 : 10;
  // Smooth scaling: 1-3 students = 10/15, 10 students = 6/9, 30 students = 4/6
  const scale = count <= 3 ? 1 : Math.max(0.38, 1.35 / Math.sqrt(count));
  const wardMult = hasKnightWard ? 0.75 : 1.0;
  return Math.max(2, Math.round(base * scale * wardMult));
}

export function resolveHeroSkill({
  heroClass,
  difficulty = 'Sedang',
  streak = 1,
  isBossStunned = false,
  isClassSynced = false,
  bossHasStoneArmor = false,
  hasActiveMinions = false,
  hasTeamSpiritBuff = false,
  rng = Math.random,
}) {
  const cfg = HERO_CLASSES[normalizeHeroClass(heroClass)];
  const baseDamage = difficulty === 'Sulit' ? 115 : difficulty === 'Sedang' ? 92 : 76;
  const streakMult = 1 + Math.min(Math.max(streak, 1) - 1, 6) * 0.08;
  const stunMult = isBossStunned ? 1.35 : 1.0;
  const syncMult = isClassSynced ? 1.85 : 1.0;
  // Mage pierces Titan Golem's Stone Armor (only 10% reduction instead of 40%)
  const armorMult = bossHasStoneArmor ? (cfg.armorPierce ? 0.9 : 0.6) : 1.0;
  const minionGuardMult = hasActiveMinions ? 0.62 : 1.0;
  const spiritMult = hasTeamSpiritBuff ? 1.15 : 1.0;

  const hits = [];
  let anyCritical = false;

  for (let i = 0; i < cfg.hits; i++) {
    const isCrit = rng() < cfg.critChance;
    if (isCrit) anyCritical = true;
    const hitDmg = Math.max(
      12,
      Math.round(
        baseDamage *
          cfg.skillDamageMult *
          streakMult *
          stunMult *
          syncMult *
          armorMult *
          minionGuardMult *
          spiritMult *
          (isCrit ? cfg.critMultiplier : 1)
      )
    );
    hits.push(hitDmg);
  }

  const totalDamage = hits.reduce((sum, val) => sum + val, 0);
  const minionDamage = Math.round(totalDamage * cfg.minionDamageMult);
  // Equalized podium scoring across all 5 Hero roles
  const points = Math.round(
    totalDamage * 1.8 +
      cfg.bonusShieldOnSkill * cfg.bonusShieldPointMult +
      cfg.bonusHealOnSkill * cfg.bonusHealPointMult +
      cfg.passiveScoreBonus * streakMult
  );

  return {
    heroClass: cfg.id,
    skillName: cfg.skillName,
    hits,
    totalDamage,
    minionDamage,
    isCritical: anyCritical,
    isClassSynced,
    piercedArmor: Boolean(bossHasStoneArmor && cfg.armorPierce),
    bonusShield: cfg.bonusShieldOnSkill,
    bonusHeal: cfg.bonusHealOnSkill,
    points,
  };
}

export function resolveSupportAction({
  actionType,
  heroClass,
  castleHp,
  castleMaxHp,
  castleShield,
  castleMaxShield = 300,
  streak = 1,
}) {
  const cfg = HERO_CLASSES[normalizeHeroClass(heroClass)];
  const streakMult = 1 + Math.min(Math.max(streak, 1) - 1, 6) * 0.08;

  if (actionType === 'heal') {
    const rawHeal = cfg.healActionPower;
    const nextHp = Math.min(castleMaxHp, castleHp + rawHeal);
    const effectiveHeal = Math.max(0, nextHp - castleHp);
    const overflow = Math.max(0, rawHeal - effectiveHeal);
    // Healer converts excess overheal into protective Shield (50% ratio) & grants Team Spirit +15% Buff!
    const overhealShield =
      cfg.id === 'healer' && overflow > 0 ? Math.round(overflow * 0.5) : 0;
    const nextShield = Math.min(castleMaxShield, castleShield + overhealShield);
    const basePoints = cfg.id === 'healer' ? 245 : 195;

    return {
      actionType: 'heal',
      amount: rawHeal,
      effectiveAmount: effectiveHeal,
      overhealShield,
      nextHp,
      nextShield,
      points: Math.round(basePoints * streakMult),
      isBoosted: cfg.id === 'healer',
      cleansesBurn: true,
      grantsTeamSpirit: cfg.id === 'healer',
    };
  }

  const rawShield = cfg.shieldActionPower;
  const nextShield = Math.min(castleMaxShield, castleShield + rawShield);
  const effectiveShield = Math.max(0, nextShield - castleShield);
  const basePoints = cfg.id === 'knight' ? 245 : 195;

  return {
    actionType: 'shield',
    amount: rawShield,
    effectiveAmount: effectiveShield,
    overhealShield: 0,
    nextHp: castleHp,
    nextShield,
    points: Math.round(basePoints * streakMult),
    isBoosted: cfg.id === 'knight',
    cleansesBurn: false,
    grantsKnightWard: cfg.id === 'knight',
  };
}

export function applyBossUltimateDamage({
  rawDamage,
  castleHp,
  castleShield,
  hasKnightWard = false,
}) {
  const wardMult = hasKnightWard ? 0.75 : 1.0;
  const damage = Math.max(0, Math.round(rawDamage * wardMult));
  const shieldAbsorbed = Math.min(castleShield, damage);
  const remainingDamage = Math.max(0, damage - shieldAbsorbed);
  const nextShield = Math.max(0, castleShield - shieldAbsorbed);
  const nextHp = Math.max(0, castleHp - remainingDamage);
  return {
    shieldAbsorbed,
    hpDamage: remainingDamage,
    nextShield,
    nextHp,
    wardMitigated: hasKnightWard ? Math.max(0, Math.round(rawDamage) - damage) : 0,
  };
}

/**
 * Computes real-time classroom role distribution for the Hero Select screen.
 * Encourages natural role balance in the first 15s without teacher micromanagement.
 */
export function computeTeamComposition(heroesIterable) {
  const counts = {
    knight: 0,
    mage: 0,
    archer: 0,
    healer: 0,
    rogue: 0,
  };
  let totalSelected = 0;

  for (const h of heroesIterable || []) {
    const id = normalizeHeroClass(h.heroClass);
    if (h.selectedHero !== false) {
      counts[id] += 1;
      totalSelected += 1;
    }
  }

  const representedClasses = HERO_CLASS_IDS.filter((id) => counts[id] > 0);
  const missingRoles = HERO_CLASS_IDS.filter((id) => counts[id] === 0);

  // Full formation triggers when all 5 roles exist (or >=3 distinct roles in small groups of 3-4)
  const hasFullFormation =
    representedClasses.length === HERO_CLASS_IDS.length ||
    (totalSelected >= 3 && totalSelected < 5 && representedClasses.length >= 3);

  // Suggest needed roles: prioritize missing Support (healer/knight), then any 0-count role
  const neededRoles = [];
  if (counts.healer === 0) neededRoles.push('healer');
  if (counts.knight === 0) neededRoles.push('knight');
  for (const id of ['mage', 'archer', 'rogue']) {
    if (counts[id] === 0) neededRoles.push(id);
  }

  return {
    counts,
    totalSelected,
    missingRoles,
    neededRoles,
    hasFullFormation,
  };
}

/**
 * Zero-distraction Smart Highlight recommendation for the 3 student skill buttons.
 * Lets students tap reflexively without having to pause and analyze the projector.
 */
export function getRecommendedSkill({
  heroClass,
  castleHp,
  castleMaxHp = 500,
  castleShield = 0,
  castleBurning = false,
  ultimateStatus = 'idle',
  nextUltimateInSec = 25,
  hasHealerInTeam = true,
}) {
  const id = normalizeHeroClass(heroClass);
  const hpRatio = castleMaxHp > 0 ? castleHp / castleMaxHp : 1;

  if (id === 'healer') {
    if (castleBurning) {
      return { skill: 'heal', badge: 'DARURAT! PADAMKAN API!' };
    }
    if (hpRatio < 0.78) {
      return { skill: 'heal', badge: 'DISARANKAN: HEAL TIM!' };
    }
    return { skill: 'primary', badge: 'BENTENG AMAN · SERANG!' };
  }

  if (id === 'knight') {
    if (ultimateStatus === 'charging' || nextUltimateInSec <= 7) {
      return { skill: 'shield', badge: 'ULTIMATE! PASANG PERISAI!' };
    }
    if (castleShield < 95) {
      return { skill: 'shield', badge: 'DISARANKAN: PERISAI 2X!' };
    }
    return { skill: 'primary', badge: 'PERISAI TEBAL · SERANG!' };
  }

  // DPS roles (Mage, Archer, Rogue): default to 1-tap primary attack unless extreme emergency
  if (castleBurning && !hasHealerInTeam) {
    return { skill: 'heal', badge: 'DARURAT! PADAMKAN API!' };
  }
  if (hpRatio < 0.28 && !hasHealerInTeam) {
    return { skill: 'heal', badge: 'DARURAT! BENTENG KRITIS!' };
  }
  return { skill: 'primary', badge: 'JURUS ANDALAN!' };
}

export function formatStandardResults(playerStatsIterable) {
  return Array.from(playerStatsIterable)
    .map((s) => ({
      playerId: s.playerId,
      name: s.name,
      avatar: s.avatar,
      score: Math.round(s.score || 0),
      correctCount: s.correctCount || 0,
      wrongCount: s.wrongCount || 0,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correctCount - a.correctCount ||
        a.wrongCount - b.wrongCount
    );
}
