import type { GameModule } from '../types/platform';
import { QuizKilatHost } from './quiz-kilat/HostView';
import { QuizKilatPlayer } from './quiz-kilat/PlayerView';
import { BossRaidHost } from './boss-raid/HostView';
import { BossRaidPlayer } from './boss-raid/PlayerView';

/**
 * Modular Frontend Game Registry
 * Untuk menambahkan game baru di masa depan:
 * 1. Buat folder `src/games/<game-id>/` berisi HostView & PlayerView.
 * 2. Buat handler backend `server/games/<game-id>/handler.js` dan daftarkan di `server/games/registry.js`.
 * 3. Tambahkan objek konfigurasi game ke array `GAME_REGISTRY` di bawah ini.
 */
export const GAME_REGISTRY: GameModule[] = [
  {
    id: 'quiz-kilat',
    name: 'Quiz Kilat Arena',
    description:
      'Adu kecepatan dan ketepatan menjawab soal serentak satu kelas dengan bonus streak dan grafik jawaban langsung.',
    icon: 'zap',
    category: 'Kuis Cepat',
    themeColor: '#059669',
    modeType: 'turn-quiz',
    HostComponent: QuizKilatHost,
    PlayerComponent: QuizKilatPlayer,
  },
  {
    id: 'boss-raid',
    name: 'Serbuan Boss Edukasi',
    description:
      'Kolaborasi satu kelas melawan Dr. Golem Logika! Setiap jawaban benar melancarkan serangan kritis demi jadi MVP.',
    icon: 'swords',
    category: 'Aksi Co-op',
    themeColor: '#D97706',
    modeType: 'realtime-boss',
    HostComponent: BossRaidHost,
    PlayerComponent: BossRaidPlayer,
  },
];

export function getGameById(gameId: string): GameModule | undefined {
  return GAME_REGISTRY.find((g) => g.id === gameId);
}
