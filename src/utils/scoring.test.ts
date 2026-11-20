import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBossDamage, calculateQuizPoints, sortStandardResults } from './scoring';

test('calculateQuizPoints rewards speed, streak, and difficulty', () => {
  assert.equal(
    calculateQuizPoints({
      isCorrect: false,
      remainingMs: 10000,
      totalMs: 15000,
      streak: 3,
      difficulty: 'Sulit',
    }),
    0
  );

  const easySlow = calculateQuizPoints({
    isCorrect: true,
    remainingMs: 0,
    totalMs: 15000,
    streak: 0,
    difficulty: 'Mudah',
  });
  const hardFastStreak = calculateQuizPoints({
    isCorrect: true,
    remainingMs: 15000,
    totalMs: 15000,
    streak: 3,
    difficulty: 'Sulit',
  });

  assert.equal(easySlow, 500);
  assert.ok(hardFastStreak > easySlow);
  assert.equal(hardFastStreak, Math.round((500 + 500 + 300) * 1.5));
});

test('calculateBossDamage triggers critical hits at combo >= 3', () => {
  const miss = calculateBossDamage({ isCorrect: false, combo: 4, difficulty: 'Sedang' });
  assert.equal(miss.damage, 0);
  assert.equal(miss.isCritical, false);

  const normalHit = calculateBossDamage({ isCorrect: true, combo: 1, difficulty: 'Mudah' });
  const critHit = calculateBossDamage({ isCorrect: true, combo: 3, difficulty: 'Mudah' });
  assert.equal(normalHit.isCritical, false);
  assert.equal(critHit.isCritical, true);
  assert.ok(critHit.damage > normalHit.damage);
  assert.equal(critHit.points, critHit.damage * 2);
});

test('sortStandardResults breaks ties by correctCount then wrongCount', () => {
  const sorted = sortStandardResults([
    { playerId: '1', name: 'Cici', avatar: '🐼', score: 1000, correctCount: 2, wrongCount: 2 },
    { playerId: '2', name: 'Budi', avatar: '🦊', score: 1000, correctCount: 3, wrongCount: 1 },
    { playerId: '3', name: 'Andi', avatar: '🦁', score: 1500, correctCount: 3, wrongCount: 0 },
  ]);
  assert.deepEqual(
    sorted.map((r) => r.name),
    ['Andi', 'Budi', 'Cici']
  );
});
