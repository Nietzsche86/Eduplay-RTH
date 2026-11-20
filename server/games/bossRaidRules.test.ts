import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_CLASSES,
  applyBossUltimateDamage,
  computeBreakTarget,
  computeComboFeverGain,
  computeScaledBossHp,
  formatStandardResults,
  isBossEnraged,
  isBossLastStand,
  resolveHeroSkill,
  resolveSupportAction,
} from './bossRaidRules.js';

test('all 5 hero classes exhibit their signature mechanics', () => {
  const knight = resolveHeroSkill({ heroClass: 'knight', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(knight.bonusShield > 0, 'Knight primary skill should grant bonus shield');
  assert.equal(knight.hits.length, 1);

  const mage = resolveHeroSkill({ heroClass: 'mage', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(mage.totalDamage > knight.totalDamage, 'Mage should out-damage Knight');

  assert.ok(
    HERO_CLASSES.archer.critChance >= HERO_CLASSES.knight.critChance * 2,
    'Archer crit chance should be at least 2x base'
  );
  const archerCrit = resolveHeroSkill({ heroClass: 'archer', difficulty: 'Sedang', streak: 1, rng: () => 0.3 });
  assert.equal(archerCrit.isCritical, true, 'Archer should trigger critical at roll 0.30');

  const healerHeal = resolveSupportAction({
    actionType: 'heal',
    heroClass: 'healer',
    castleHp: 200,
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

  const rogue = resolveHeroSkill({ heroClass: 'rogue', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.equal(rogue.hits.length, 2, 'Rogue should deal 2 consecutive hits');
  assert.equal(rogue.totalDamage, rogue.hits[0] + rogue.hits[1]);
});

test('auto-scale boss HP scales cleanly across 3 difficulty levels for 30-student classroom', () => {
  const santai30 = computeScaledBossHp({ playerCount: 30, raidLevel: 'santai', manualBossHp: 0 });
  const standar30 = computeScaledBossHp({ playerCount: 30, raidLevel: 'standar', manualBossHp: 0 });
  const epik30 = computeScaledBossHp({ playerCount: 30, raidLevel: 'epik', manualBossHp: 0 });

  assert.equal(santai30, 11400);
  assert.equal(standar30, 15600);
  assert.equal(epik30, 19200);
  assert.ok(santai30 < standar30 && standar30 < epik30);

  // Manual override respected when specified
  assert.equal(computeScaledBossHp({ playerCount: 30, raidLevel: 'epik', manualBossHp: 600 }), 600);
});

test('class-sync 2x boost, stone armor, minion guard, and heroic spirit comeback work correctly', () => {
  const normal = resolveHeroSkill({ heroClass: 'mage', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  const synced = resolveHeroSkill({
    heroClass: 'mage',
    difficulty: 'Sedang',
    streak: 1,
    isClassSynced: true,
    rng: () => 0.99,
  });
  const armored = resolveHeroSkill({
    heroClass: 'mage',
    difficulty: 'Sedang',
    streak: 1,
    bossHasStoneArmor: true,
    rng: () => 0.99,
  });
  assert.ok(synced.totalDamage > normal.totalDamage * 1.7);
  assert.ok(armored.totalDamage < normal.totalDamage);

  // Comeback Heroic Spirit boosts fever gain by 1.5x when Castle HP < 30%
  const healthyFever = computeComboFeverGain(20, 400, 500);
  const lowHpFever = computeComboFeverGain(20, 100, 500);
  assert.ok(lowHpFever > healthyFever, 'Heroic Spirit should boost Combo Fever when Castle HP < 30%');
});

test('boss enraged, last stand thresholds, and ultimate shield absorption', () => {
  assert.equal(isBossEnraged(500, 1000), false);
  assert.equal(isBossEnraged(499, 1000), true);
  assert.equal(isBossLastStand(150, 1000), true);
  assert.equal(isBossLastStand(160, 1000), false);

  const res = applyBossUltimateDamage({ rawDamage: 180, castleHp: 400, castleShield: 100 });
  assert.equal(res.shieldAbsorbed, 100);
  assert.equal(res.hpDamage, 80);
  assert.equal(res.nextShield, 0);
  assert.equal(res.nextHp, 320);
});

test('break target scales with player count & level and formats standard results', () => {
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
