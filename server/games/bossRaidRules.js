/**
 * Pure decoupled rules & balance calculations for "Boss Raid: Pixel Heroes".
 * Shared between server/games/bossRaid.js and unit tests.
 */

export const HERO_CLASSES = {
  knight: {
    id: 'knight',
    name: 'Ksatria',
    englishName: 'Knight',
    skillName: 'Tebasan Perisai',
    roleHint: 'Tebasan Pedang + Bonus Perisai Benteng',
    skillDamageMult: 1.0,
    hits: 1,
    critChance: 0.16,
    critMultiplier: 1.65,
    bonusShieldOnSkill: 35,
    bonusHealOnSkill: 0,
    healActionPower: 60,
    shieldActionPower: 95,
  },
  mage: {
    id: 'mage',
    name: 'Penyihir',
    englishName: 'Mage',
    skillName: 'Bola Api Sihir',
    roleHint: 'Damage Sihir Tertinggi (Bola Api / Petir)',
    skillDamageMult: 1.48,
    hits: 1,
    critChance: 0.18,
    critMultiplier: 1.7,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 0,
    healActionPower: 60,
    shieldActionPower: 45,
  },
  archer: {
    id: 'archer',
    name: 'Pemanah',
    englishName: 'Archer',
    skillName: 'Panah Cahaya',
    roleHint: 'Peluang Critical 2x Lebih Tinggi',
    skillDamageMult: 1.05,
    hits: 1,
    critChance: 0.48,
    critMultiplier: 1.85,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 0,
    healActionPower: 60,
    shieldActionPower: 45,
  },
  healer: {
    id: 'healer',
    name: 'Tabib',
    englishName: 'Healer',
    skillName: 'Gelombang Cahaya',
    roleHint: 'Heal Benteng 2x Lipat + Bonus Heal',
    skillDamageMult: 0.85,
    hits: 1,
    critChance: 0.14,
    critMultiplier: 1.5,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 30,
    healActionPower: 120,
    shieldActionPower: 50,
  },
  rogue: {
    id: 'rogue',
    name: 'Ninja',
    englishName: 'Rogue',
    skillName: 'Tebasan Bayangan 2x',
    roleHint: 'Dash Cepat Menebas 2x Beruntun',
    skillDamageMult: 0.64,
    hits: 2,
    critChance: 0.26,
    critMultiplier: 1.65,
    bonusShieldOnSkill: 0,
    bonusHealOnSkill: 0,
    healActionPower: 60,
    shieldActionPower: 45,
  },
};

export const HERO_CLASS_IDS = Object.keys(HERO_CLASSES);

export const BOSS_CONFIGS = {
  'inferno-dragon': {
    id: 'inferno-dragon',
    name: 'Naga Api',
    subtitle: 'Inferno Dragon',
    ultimateName: 'Semburan Api Neraka',
    accentColor: '#EF4444',
  },
  'titan-golem': {
    id: 'titan-golem',
    name: 'Titan Golem',
    subtitle: 'Ancient Stone Colossus',
    ultimateName: 'Hantaman Gempa Kristal',
    accentColor: '#F59E0B',
  },
  'dark-overlord': {
    id: 'dark-overlord',
    name: 'Raja Kegelapan',
    subtitle: 'Dark Overlord',
    ultimateName: 'Laser Gerhana Kegelapan',
    accentColor: '#A855F7',
  },
};

export function normalizeHeroClass(heroClass) {
  return HERO_CLASSES[heroClass] ? heroClass : 'knight';
}

export function normalizeBossType(bossType) {
  return BOSS_CONFIGS[bossType] ? bossType : 'inferno-dragon';
}

export function isBossEnraged(bossHp, bossMaxHp) {
  if (bossMaxHp <= 0) return false;
  return bossHp > 0 && bossHp < bossMaxHp * 0.5;
}

export function computeBreakTarget(connectedPlayerCount) {
  const count = Math.max(1, Number(connectedPlayerCount) || 1);
  if (count === 1) return 2;
  return Math.max(2, Math.ceil(count * 1.25));
}

export function computeComboFeverGain(connectedPlayerCount) {
  const count = Math.max(1, Number(connectedPlayerCount) || 1);
  // Scales smoothly so solo/small test fills in ~5-6 correct answers, larger class in ~10-16
  return Math.max(7, Math.min(20, Math.round(28 / Math.sqrt(count))));
}

export function resolveHeroSkill({
  heroClass,
  difficulty = 'Sedang',
  streak = 1,
  isBossStunned = false,
  rng = Math.random,
}) {
  const cfg = HERO_CLASSES[normalizeHeroClass(heroClass)];
  const baseDamage = difficulty === 'Sulit' ? 115 : difficulty === 'Sedang' ? 92 : 76;
  const streakMult = 1 + Math.min(Math.max(streak, 1) - 1, 6) * 0.08;
  const stunMult = isBossStunned ? 1.35 : 1.0;

  const hits = [];
  let anyCritical = false;

  for (let i = 0; i < cfg.hits; i++) {
    const isCrit = rng() < cfg.critChance;
    if (isCrit) anyCritical = true;
    const hitDmg = Math.max(
      12,
      Math.round(
        baseDamage * cfg.skillDamageMult * streakMult * stunMult * (isCrit ? cfg.critMultiplier : 1)
      )
    );
    hits.push(hitDmg);
  }

  const totalDamage = hits.reduce((sum, val) => sum + val, 0);
  const points = Math.round(totalDamage * 1.8 + cfg.bonusShieldOnSkill * 1.2 + cfg.bonusHealOnSkill * 1.2);

  return {
    heroClass: cfg.id,
    skillName: cfg.skillName,
    hits,
    totalDamage,
    isCritical: anyCritical,
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
}) {
  const cfg = HERO_CLASSES[normalizeHeroClass(heroClass)];
  if (actionType === 'heal') {
    const rawHeal = cfg.healActionPower;
    const nextHp = Math.min(castleMaxHp, castleHp + rawHeal);
    const effectiveHeal = Math.max(0, nextHp - castleHp);
    return {
      actionType: 'heal',
      amount: rawHeal,
      effectiveAmount: effectiveHeal,
      nextHp,
      nextShield: castleShield,
      points: Math.round(rawHeal * 1.5),
      isBoosted: cfg.id === 'healer',
    };
  }

  const rawShield = cfg.shieldActionPower;
  const nextShield = Math.min(castleMaxShield, castleShield + rawShield);
  const effectiveShield = Math.max(0, nextShield - castleShield);
  return {
    actionType: 'shield',
    amount: rawShield,
    effectiveAmount: effectiveShield,
    nextHp: castleHp,
    nextShield,
    points: Math.round(rawShield * 1.6),
    isBoosted: cfg.id === 'knight',
  };
}

export function applyBossUltimateDamage({ rawDamage, castleHp, castleShield }) {
  const damage = Math.max(0, Math.round(rawDamage));
  const shieldAbsorbed = Math.min(castleShield, damage);
  const remainingDamage = Math.max(0, damage - shieldAbsorbed);
  const nextShield = Math.max(0, castleShield - shieldAbsorbed);
  const nextHp = Math.max(0, castleHp - remainingDamage);
  return {
    shieldAbsorbed,
    hpDamage: remainingDamage,
    nextShield,
    nextHp,
  };
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
