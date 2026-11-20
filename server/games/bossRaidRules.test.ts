import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HERO_CLASSES,
  applyBossUltimateDamage,
  computeBreakTarget,
  formatStandardResults,
  isBossEnraged,
  resolveHeroSkill,
  resolveSupportAction,
} from './bossRaidRules.js';

test('all 5 hero classes exhibit their signature mechanics', () => {
  // Knight gives bonus shield on primary skill
  const knight = resolveHeroSkill({ heroClass: 'knight', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(knight.bonusShield > 0, 'Knight primary skill should grant bonus shield');
  assert.equal(knight.hits.length, 1);

  // Mage deals highest non-crit single-target damage
  const mage = resolveHeroSkill({ heroClass: 'mage', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.ok(mage.totalDamage > knight.totalDamage, 'Mage should out-damage Knight');

  // Archer has >= 2x critical chance compared to base classes
  assert.ok(
    HERO_CLASSES.archer.critChance >= HERO_CLASSES.knight.critChance * 2,
    'Archer crit chance should be at least 2x base'
  );
  const archerCrit = resolveHeroSkill({ heroClass: 'archer', difficulty: 'Sedang', streak: 1, rng: () => 0.3 });
  assert.equal(archerCrit.isCritical, true, 'Archer should trigger critical at roll 0.30');

  // Healer restores 2x Castle HP compared to other classes
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

  // Rogue hits twice consecutively
  const rogue = resolveHeroSkill({ heroClass: 'rogue', difficulty: 'Sedang', streak: 1, rng: () => 0.99 });
  assert.equal(rogue.hits.length, 2, 'Rogue should deal 2 consecutive hits');
  assert.equal(rogue.totalDamage, rogue.hits[0] + rogue.hits[1]);
});

test('boss enraged threshold activates strictly below 50% HP while alive', () => {
  assert.equal(isBossEnraged(500, 1000), false);
  assert.equal(isBossEnraged(499, 1000), true);
  assert.equal(isBossEnraged(0, 1000), false);
});

test('boss ultimate damage absorbs into shield before reducing castle HP', () => {
  const res = applyBossUltimateDamage({ rawDamage: 180, castleHp: 400, castleShield: 100 });
  assert.equal(res.shieldAbsorbed, 100);
  assert.equal(res.hpDamage, 80);
  assert.equal(res.nextShield, 0);
  assert.equal(res.nextHp, 320);

  const lethal = applyBossUltimateDamage({ rawDamage: 500, castleHp: 120, castleShield: 30 });
  assert.equal(lethal.nextHp, 0);
  assert.equal(lethal.nextShield, 0);
});

test('break target scales proportionally with player count and formats standard results', () => {
  assert.equal(computeBreakTarget(1), 2);
  assert.ok(computeBreakTarget(10) > computeBreakTarget(3));

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
