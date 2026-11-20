import type { Difficulty, GameResultEntry } from '../types/platform';

export function getDifficultyMultiplier(difficulty: Difficulty): number {
  switch (difficulty) {
    case 'Sulit':
      return 1.5;
    case 'Sedang':
      return 1.2;
    case 'Mudah':
    default:
      return 1.0;
  }
}

export function calculateQuizPoints(params: {
  isCorrect: boolean;
  remainingMs: number;
  totalMs: number;
  streak: number;
  difficulty: Difficulty;
}): number {
  if (!params.isCorrect) return 0;
  const ratio = Math.max(0, Math.min(1, params.totalMs > 0 ? params.remainingMs / params.totalMs : 0));
  const basePoints = 500;
  const speedBonus = Math.round(500 * ratio);
  const streakBonus = Math.min(params.streak, 5) * 100;
  const mult = getDifficultyMultiplier(params.difficulty);
  return Math.round((basePoints + speedBonus + streakBonus) * mult);
}

export function calculateBossDamage(params: {
  isCorrect: boolean;
  combo: number;
  difficulty: Difficulty;
}): { damage: number; points: number; isCritical: boolean } {
  if (!params.isCorrect) {
    return { damage: 0, points: 0, isCritical: false };
  }
  const baseDamage = params.difficulty === 'Sulit' ? 140 : params.difficulty === 'Sedang' ? 110 : 85;
  const comboFactor = 1 + Math.min(params.combo, 6) * 0.15;
  const isCritical = params.combo >= 3;
  const damage = Math.round(baseDamage * comboFactor * (isCritical ? 1.2 : 1));
  return {
    damage,
    points: damage * 2,
    isCritical,
  };
}

export function sortStandardResults(results: GameResultEntry[]): GameResultEntry[] {
  return [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    if (a.wrongCount !== b.wrongCount) return a.wrongCount - b.wrongCount;
    return a.name.localeCompare(b.name);
  });
}
