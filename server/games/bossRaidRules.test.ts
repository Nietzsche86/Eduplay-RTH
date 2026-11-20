import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_CLASSES,
  applyBossUltimateDamage,
  computeBreakTarget,
  computeComboFeverGain,
  computeScaledBossHp,
  computeTeamComposition,
  computeWrongAnswerCounterDamage,
  formatStandardResults,
  getRecommendedSkill,
  isBossEnraged,
  isBossLastStand,
  resolveHeroSkill,
  resolveSupportAction,
} from './bossRaidRules.js';

test('all 5 hero classes exhibit distinct specialties and fair podium score parity', () => {
  const knight = resolveHeroSkill({ heroClass: 'knight', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(knight.bonusShield >= 40, 'Knight primary skill should grant bonus shield');
  assert.equal(knight.hits.length, 1);

  const mage = resolveHeroSkill({ heroClass: 'mage', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(mage.totalDamage > knight.totalDamage, 'Mage should out-damage Knight');
  assert.ok(mage.minionDamage > mage.totalDamage * 1.3, 'Mage should deal bonus cleave to Minions');

  // Mage pierces Titan Golem Stone Armor much better than non-Mage
  const mageArmored = resolveHeroSkill({
    heroClass: 'mage',
    difficulty: 'Sedang',
    streak: 1,
    bossHasStoneArmor: true,
    rng: () => 0.99,
  });
  const archerArmored = resolveHeroSkill({
    heroClass: 'archer',
    difficulty: 'Sedang',
    streak: 1,
    bossHasStoneArmor: true,
    rng: () => 0.99,
  });
  assert.equal(mageArmored.piercedArmor, true);
  assert.ok(mageArmored.totalDamage / mage.totalDamage > 0.85, 'Mage should pierce Stone Armor');
  assert.equal(archerArmored.piercedArmor, false);

  // Archer: 2x crit chance & 2x Break contribution
  assert.ok(HERO_CLASSES.archer.critChance >= HERO_CLASSES.knight.critChance * 2);
  assert.equal(HERO_CLASSES.archer.breakContribution, 2, 'Archer should count 2x toward Boss Break');
  const archerCrit = resolveHeroSkill({ heroClass: 'archer', difficulty: 'Sedang', streak: 1, rng: () => 0.3 });
  assert.equal(archerCrit.isCritical, true);

  // Healer: 2x Heal + Overheal Shield + Team Spirit Buff + fair podium points
  const healerHeal = resolveSupportAction({
    actionType: 'heal',
    heroClass: 'healer',
    castleHp: 460,
    castleMaxHp: 500,
    castleShield: 0,
  });
  const mageHeal = resolveSupportAction({
    actionType: 'heal',
    heroClass: 'mage',
    castleHp: 200,
    castleMaxHp: 500,
    castleShield: 0,
  });
  assert.equal(healerHeal.amount, mageHeal.amount * 2, 'Healer should heal 2x normal amount');
  assert.ok(healerHeal.overhealShield > 0, 'Healer excess heal should convert into Shield');
  assert.equal(healerHeal.grantsTeamSpirit, true, 'Healer heal should grant Team Spirit +15% damage buff');

  // Knight Shield grants Bastion Ward & fair points
  const knightShield = resolveSupportAction({
    actionType: 'shield',
    heroClass: 'knight',
    castleHp: 400,
    castleMaxHp: 500,
    castleShield: 50,
  });
  assert.equal(knightShield.grantsKnightWard, true);

  // Rogue: 2 consecutive hits & 1.6x Fever speed
  const rogue = resolveHeroSkill({ heroClass: 'rogue', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.equal(rogue.hits.length, 2, 'Rogue should deal 2 consecutive hits');
  assert.equal(rogue.totalDamage, rogue.hits[0] + rogue.hits[1]);
  assert.equal(HERO_CLASSES.rogue.feverMultiplier, 1.6);

  // Podium Score Parity Check: Support actions & primary attacks stay within a fair band!
  const healerPrimary = resolveHeroSkill({ heroClass: 'healer', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(
    Math.abs(healerHeal.points - mage.points) <= 35,
    `Healer support (${healerHeal.points}) should be fair vs Mage attack (${mage.points})`
  );
  assert.ok(
    Math.abs(knightShield.points - mage.points) <= 35,
    `Knight shield (${knightShield.points}) should be fair vs Mage attack (${mage.points})`
  );
  assert.ok(
    Math.abs(healerPrimary.points - knight.points) <= 25,
    `Healer primary (${healerPrimary.points}) should be fair vs Knight primary (${knight.points})`
  );
});

test('auto-scale boss HP scales with BOTH player count AND battle duration', () => {
  const standar30_60s = computeScaledBossHp({ playerCount: 30, raidLevel: 'standar', durationSec: 60 });
  const standar30_120s = computeScaledBossHp({ playerCount: 30, raidLevel: 'standar', durationSec: 120 });
  const standar30_180s = computeScaledBossHp({ playerCount: 30, raidLevel: 'standar', durationSec: 180 });

  assert.equal(standar30_60s, 15750);
  assert.equal(standar30_120s, 31500);
  assert.equal(standar30_180s, 47250);
  assert.ok(standar30_60s < standar30_120s && standar30_120s < standar30_180s);

  const santai30 = computeScaledBossHp({ playerCount: 30, raidLevel: 'santai', durationSec: 120 });
  const epik30 = computeScaledBossHp({ playerCount: 30, raidLevel: 'epik', durationSec: 120 });
  assert.ok(santai30 < standar30_120s && standar30_120s < epik30);

  // Manual override respected when specified
  assert.equal(
    computeScaledBossHp({ playerCount: 30, raidLevel: 'epik', durationSec: 180, manualBossHp: 600 }),
    600
  );
});

test('combo fever scales proportionally for 30 students and honors Rogue, Full Formation & Heroic Spirit', () => {
  // For 30 students, normal answer should add ~2.3% (so ~44 answers per Mega Beam, not 17!)
  const normal30 = computeComboFeverGain(30, 400, 500, { heroClass: 'mage' });
  const rogue30 = computeComboFeverGain(30, 400, 500, { heroClass: 'rogue' });
  const fullForm30 = computeComboFeverGain(30, 400, 500, {
    heroClass: 'mage',
    hasFullFormation: true,
  });
  const comeback30 = computeComboFeverGain(30, 100, 500, { heroClass: 'mage' });

  assert.ok(normal30 > 1.8 && normal30 < 3.0, `Expected ~2.3% fever/answer for 30 players, got ${normal30}`);
  assert.ok(rogue30 > normal30 * 1.5, 'Rogue should fill Combo Fever 1.6x faster');
  assert.ok(fullForm30 > normal30, 'Full Formation should boost Combo Fever');
  assert.ok(comeback30 > normal30 * 1.4, 'Heroic Spirit should boost Combo Fever at <30% Castle HP');
});

test('counter-attack damage scales fairly for large classrooms & Knight Ward mitigates 25%', () => {
  const soloDmg = computeWrongAnswerCounterDamage({ connectedPlayerCount: 1, isEnraged: false });
  const class30Dmg = computeWrongAnswerCounterDamage({ connectedPlayerCount: 30, isEnraged: false });
  const wardedSolo = computeWrongAnswerCounterDamage({
    connectedPlayerCount: 1,
    isEnraged: false,
    hasKnightWard: true,
  });

  assert.equal(soloDmg, 10);
  assert.ok(class30Dmg <= 5, `30-student counter dmg should be gentle per error, got ${class30Dmg}`);
  assert.ok(wardedSolo < soloDmg, 'Knight Bastion Ward should mitigate counter damage');

  const ultWarded = applyBossUltimateDamage({
    rawDamage: 200,
    castleHp: 400,
    castleShield: 50,
    hasKnightWard: true,
  });
  assert.equal(ultWarded.wardMitigated, 50);
  assert.equal(ultWarded.shieldAbsorbed, 50);
  assert.equal(ultWarded.hpDamage, 100);
});

test('team composition & smart skill recommendation guide roles without disrupting quiz focus', () => {
  const compMissing = computeTeamComposition([
    { heroClass: 'mage', selectedHero: true },
    { heroClass: 'mage', selectedHero: true },
  ]);
  assert.equal(compMissing.counts.mage, 2);
  assert.equal(compMissing.counts.healer, 0);
  assert.equal(compMissing.hasFullFormation, false);
  assert.ok(compMissing.neededRoles.includes('healer'));
  assert.ok(compMissing.neededRoles.includes('knight'));

  const compFull = computeTeamComposition([
    { heroClass: 'knight', selectedHero: true },
    { heroClass: 'mage', selectedHero: true },
    { heroClass: 'archer', selectedHero: true },
    { heroClass: 'healer', selectedHero: true },
    { heroClass: 'rogue', selectedHero: true },
  ]);
  assert.equal(compFull.hasFullFormation, true);
  assert.equal(compFull.missingRoles.length, 0);

  // Smart recommendations
  assert.equal(
    getRecommendedSkill({ heroClass: 'healer', castleHp: 300, castleMaxHp: 500 }).skill,
    'heal'
  );
  assert.equal(
    getRecommendedSkill({ heroClass: 'healer', castleHp: 500, castleMaxHp: 500 }).skill,
    'primary'
  );
  assert.equal(
    getRecommendedSkill({ heroClass: 'knight', castleHp: 500, castleShield: 40 }).skill,
    'shield'
  );
  assert.equal(
    getRecommendedSkill({ heroClass: 'knight', castleHp: 500, castleShield: 160, nextUltimateInSec: 20 }).skill,
    'primary'
  );
  assert.equal(
    getRecommendedSkill({ heroClass: 'mage', castleHp: 350, castleMaxHp: 500, hasHealerInTeam: true }).skill,
    'primary'
  );
});

test('boss enraged, last stand thresholds, break target, and standard results formatting', () => {
  assert.equal(isBossEnraged(500, 1000), false);
  assert.equal(isBossEnraged(499, 1000), true);
  assert.equal(isBossLastStand(150, 1000), true);
  assert.equal(isBossLastStand(160, 1000), false);
  assert.equal(computeBreakTarget(1, 'standar'), 2);
  assert.ok(computeBreakTarget(30, 'epik') > computeBreakTarget(30, 'santai'));

  const results = formatStandardResults([
    { playerId: 'p1', name: 'Budi', avatar: '🦊', score: 420, correctCount: 4, wrongCount: 1 },
    { playerId: 'p2', name: 'Aisyah', avatar: '🦉', score: 680, correctCount: 6, wrongCount: 0 },
  ]);
  assert.equal(results[0].playerId, 'p2');
  assert.deepEqual(Object.keys(results[0]).sort(), [
    'avatar',
    'correctCount',
    'name',
    'playerId',
    'score',
    'wrongCount',
  ]);
});
