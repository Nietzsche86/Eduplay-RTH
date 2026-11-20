import { quizKilatHandler } from './quiz-kilat/handler.js';
import { bossRaidHandler } from './boss-raid/handler.js';

/**
 * Modular Backend Game Registry
 * Setiap game baru cukup menambahkan folder sendiri di `server/games/<game-id>/handler.js`
 * dengan antarmuka standar: { id, init, onPlayerAction, onDisconnect, cleanup }
 * lalu mendaftarkannya di array `gameHandlers` di bawah ini.
 */
export const gameHandlers = [quizKilatHandler, bossRaidHandler];

export const gameHandlerMap = new Map(gameHandlers.map((handler) => [handler.id, handler]));

export function getGameHandler(gameId) {
  return gameHandlerMap.get(gameId) || null;
}
