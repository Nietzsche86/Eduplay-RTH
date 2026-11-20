import express from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Server as SocketIOServer } from 'socket.io';
import { questionStore } from './server/storage.js';
import { getGameHandler } from './server/games/registry.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const IS_PROD = process.env.NODE_ENV === 'production';

function detectLanInfo() {
  const nets = os.networkInterfaces();
  const candidates: Array<{ name: string; address: string; priority: number }> = [];

  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const net of addrs) {
      const isIPv4 = net.family === 'IPv4' || (net.family as unknown) === 4;
      if (!isIPv4 || net.internal) continue;
      let priority = 3;
      if (net.address.startsWith('192.168.')) priority = 1;
      else if (net.address.startsWith('10.')) priority = 2;
      else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)) priority = 2;
      else if (net.address.startsWith('169.254.')) priority = 4;
      candidates.push({ name, address: net.address, priority });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority);
  const ip = candidates[0]?.address || '127.0.0.1';
  return {
    ip,
    port: PORT,
    url: `http://${ip}:${PORT}`,
    interfaces: candidates.map(({ name, address }) => ({ name, address })),
  };
}

function generateRoomCode(existingCodes: Set<string>): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

interface RoomPlayer {
  playerId: string;
  socketId: string;
  name: string;
  avatar: string;
  connected: boolean;
  joinedAt: number;
}

interface RoomRecord {
  roomCode: string;
  hostSocketId: string;
  gameId: string;
  gameName: string;
  packId: string;
  packTitle: string;
  status: 'lobby' | 'playing' | 'finished';
  settings: {
    timePerQuestion: number;
    gameDuration: number;
    shuffleQuestions: boolean;
    questionLimit: number;
    bossMaxHp: number;
    bossType: 'inferno-dragon' | 'titan-golem' | 'dark-overlord';
  };
  players: RoomPlayer[];
  results: Array<{
    playerId: string;
    name: string;
    avatar: string;
    score: number;
    correctCount: number;
    wrongCount: number;
  }>;
  gameState: unknown;
  _gameInternal?: unknown;
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });

  app.use(express.json({ limit: '5mb' }));

  const rooms = new Map<string, RoomRecord>();

  function serializeRoom(room: RoomRecord) {
    return {
      roomCode: room.roomCode,
      gameId: room.gameId,
      packId: room.packId,
      packTitle: room.packTitle,
      status: room.status,
      settings: room.settings,
      players: room.players,
      results: room.results,
      gameState: room.gameState,
    };
  }

  function getActiveRoomSummaries() {
    const list = [];
    for (const room of rooms.values()) {
      if (room.status === 'lobby') {
        list.push({
          roomCode: room.roomCode,
          gameId: room.gameId,
          gameName: room.gameName,
          packId: room.packId,
          packTitle: room.packTitle,
          status: room.status,
          playerCount: room.players.filter((p) => p.connected).length,
        });
      }
    }
    return list;
  }

  function broadcastActiveRooms() {
    io.emit('rooms:active_list', getActiveRoomSummaries());
  }

  function createGameContext(room: RoomRecord, questions: unknown[]) {
    return {
      io,
      room,
      questions,
      settings: room.settings,
      broadcastGameState(nextGameState: unknown) {
        room.gameState = nextGameState;
        io.to(room.roomCode).emit('game:state', nextGameState);
      },
      finishGame(rawResults: unknown[]) {
        const normalized = Array.isArray(rawResults)
          ? rawResults.map((entry: any) => ({
              playerId: String(entry.playerId ?? ''),
              name: String(entry.name ?? 'Siswa'),
              avatar: String(entry.avatar ?? '🎓'),
              score: Math.max(0, Math.round(Number(entry.score) || 0)),
              correctCount: Math.max(0, Math.round(Number(entry.correctCount) || 0)),
              wrongCount: Math.max(0, Math.round(Number(entry.wrongCount) || 0)),
            }))
          : [];
        normalized.sort(
          (a, b) =>
            b.score - a.score ||
            b.correctCount - a.correctCount ||
            a.wrongCount - b.wrongCount
        );
        room.status = 'finished';
        room.results = normalized;
        io.to(room.roomCode).emit('room:state', serializeRoom(room));
        io.to(room.roomCode).emit('game:finished', normalized);
        broadcastActiveRooms();
      },
    };
  }

  function cleanupRoom(room: RoomRecord) {
    const handler = getGameHandler(room.gameId);
    if (handler && typeof handler.cleanup === 'function') {
      handler.cleanup({ io, room });
    }
  }

  // ==================== REST API ====================

  app.get('/api/server-info', (_req, res) => {
    res.json(detectLanInfo());
  });

  app.get('/api/rooms/active', (_req, res) => {
    res.json({ rooms: getActiveRoomSummaries() });
  });

  app.get('/api/packs', (_req, res) => {
    try {
      const packs = questionStore.readPacks();
      res.json({ packs });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Gagal membaca bank soal.' });
    }
  });

  app.post('/api/packs', (req, res) => {
    try {
      const pack = questionStore.createPack(req.body);
      res.status(201).json({ pack });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Gagal membuat paket soal.' });
    }
  });

  app.put('/api/packs/:id', (req, res) => {
    try {
      const pack = questionStore.updatePack(req.params.id, req.body);
      res.json({ pack });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Gagal memperbarui paket soal.' });
    }
  });

  app.delete('/api/packs/:id', (req, res) => {
    try {
      const removed = questionStore.deletePack(req.params.id);
      res.json({ deleted: removed });
    } catch (err: any) {
      res.status(404).json({ error: err?.message || 'Paket soal tidak ditemukan.' });
    }
  });

  app.post('/api/packs/import', (req, res) => {
    try {
      const imported = questionStore.importPack(req.body);
      res.status(201).json({ packs: imported });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Format JSON paket soal tidak valid.' });
    }
  });

  // ==================== SOCKET.IO ====================

  io.on('connection', (socket) => {
    // Send currently active rooms immediately for one-tap student join
    socket.emit('rooms:active_list', getActiveRoomSummaries());

    socket.on('host:create_room', (payload, cb) => {
      try {
        const gameId = String(payload?.gameId || '').trim();
        const gameName = String(payload?.gameName || gameId).trim();
        const packId = String(payload?.packId || '').trim();

        const handler = getGameHandler(gameId);
        if (!handler) {
          cb?.({ ok: false, error: `Modul game "${gameId}" belum terdaftar di server.` });
          return;
        }

        const pack = questionStore.getPackById(packId);
        if (!pack) {
          cb?.({ ok: false, error: 'Paket soal tidak ditemukan.' });
          return;
        }
        if (!pack.questions || pack.questions.length === 0) {
          cb?.({ ok: false, error: 'Paket soal masih kosong. Tambahkan minimal 1 soal.' });
          return;
        }

        // Clean up any existing room owned by this host socket
        for (const [code, existing] of rooms.entries()) {
          if (existing.hostSocketId === socket.id) {
            cleanupRoom(existing);
            io.to(code).emit('room:closed', { reason: 'Guru membuka ruangan baru.' });
            rooms.delete(code);
          }
        }

        const roomCode = generateRoomCode(new Set(rooms.keys()));
        const rawSettings = payload?.settings || {};
        const room: RoomRecord = {
          roomCode,
          hostSocketId: socket.id,
          gameId,
          gameName,
          packId: pack.id,
          packTitle: pack.title,
          status: 'lobby',
          settings: {
            timePerQuestion: Math.max(5, Math.min(120, Number(rawSettings.timePerQuestion) || 15)),
            gameDuration: Math.max(20, Math.min(300, Number(rawSettings.gameDuration) || 90)),
            shuffleQuestions: Boolean(rawSettings.shuffleQuestions ?? true),
            questionLimit: Math.max(0, Number(rawSettings.questionLimit) || 0),
            bossMaxHp: Math.max(300, Number(rawSettings.bossMaxHp) || 1000),
            bossType: ['inferno-dragon', 'titan-golem', 'dark-overlord'].includes(rawSettings.bossType)
              ? rawSettings.bossType
              : 'inferno-dragon',
          },
          players: [],
          results: [],
          gameState: null,
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        broadcastActiveRooms();

        cb?.({ ok: true, roomState: serializeRoom(room) });
      } catch (err: any) {
        cb?.({ ok: false, error: err?.message || 'Gagal membuka ruangan.' });
      }
    });

    socket.on('host:kick_player', ({ roomCode, playerId }, cb) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) {
        cb?.({ ok: false, error: 'Ruangan tidak ditemukan.' });
        return;
      }

      const idx = room.players.findIndex((p) => p.playerId === playerId);
      if (idx === -1) {
        cb?.({ ok: false, error: 'Siswa tidak ditemukan.' });
        return;
      }

      const [kicked] = room.players.splice(idx, 1);
      const targetSocket = io.sockets.sockets.get(kicked.socketId);
      if (targetSocket) {
        targetSocket.emit('player:kicked', { reason: 'Kamu dikeluarkan oleh guru dari ruangan.' });
        targetSocket.leave(code);
      }

      io.to(code).emit('room:state', serializeRoom(room));
      broadcastActiveRooms();
      cb?.({ ok: true });
    });

    socket.on('host:start_game', ({ roomCode }, cb) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) {
        cb?.({ ok: false, error: 'Ruangan tidak ditemukan.' });
        return;
      }

      if (room.players.filter((p) => p.connected).length === 0) {
        cb?.({ ok: false, error: 'Minimal 1 siswa harus bergabung sebelum memulai game.' });
        return;
      }

      const pack = questionStore.getPackById(room.packId);
      if (!pack || pack.questions.length === 0) {
        cb?.({ ok: false, error: 'Paket soal kosong atau telah dihapus.' });
        return;
      }

      const handler = getGameHandler(room.gameId);
      if (!handler) {
        cb?.({ ok: false, error: 'Modul game tidak ditemukan.' });
        return;
      }

      cleanupRoom(room);
      room.status = 'playing';
      room.results = [];
      room.gameState = null;

      io.to(code).emit('room:state', serializeRoom(room));
      broadcastActiveRooms();

      const ctx = createGameContext(room, pack.questions);
      handler.init(ctx);
      cb?.({ ok: true });
    });

    socket.on('host:game_action', ({ roomCode, action }) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id || room.status !== 'playing') return;

      const handler = getGameHandler(room.gameId);
      if (!handler || typeof handler.onPlayerAction !== 'function') return;

      const pack = questionStore.getPackById(room.packId);
      const ctx = createGameContext(room, pack?.questions || []);
      handler.onPlayerAction(ctx, null, action);
    });

    socket.on('host:restart_lobby', ({ roomCode }, cb) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) {
        cb?.({ ok: false, error: 'Ruangan tidak ditemukan.' });
        return;
      }

      cleanupRoom(room);
      room.status = 'lobby';
      room.results = [];
      room.gameState = null;
      // Keep only connected players in lobby
      room.players = room.players.filter((p) => p.connected);

      io.to(code).emit('room:state', serializeRoom(room));
      broadcastActiveRooms();
      cb?.({ ok: true, roomState: serializeRoom(room) });
    });

    socket.on('host:close_room', ({ roomCode }, cb) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.hostSocketId !== socket.id) {
        cb?.({ ok: true });
        return;
      }

      cleanupRoom(room);
      io.to(code).emit('room:closed', { reason: 'Ruangan telah ditutup oleh guru.' });
      rooms.delete(code);
      broadcastActiveRooms();
      cb?.({ ok: true });
    });

    socket.on('player:join_room', (payload, cb) => {
      const code = String(payload?.roomCode || '').toUpperCase().trim();
      const name = String(payload?.name || '').trim().slice(0, 24);
      const avatar = String(payload?.avatar || '🦊').trim() || '🦊';
      const incomingPlayerId = payload?.playerId ? String(payload.playerId) : null;

      if (!name) {
        cb?.({ ok: false, error: 'Masukkan nama kamu terlebih dahulu.' });
        return;
      }
      if (!code) {
        cb?.({ ok: false, error: 'Masukkan kode ruangan.' });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        cb?.({ ok: false, error: `Ruangan "${code}" tidak ditemukan. Cek kembali kode dari guru.` });
        return;
      }

      // Check reconnection for existing playerId
      let existing = incomingPlayerId
        ? room.players.find((p) => p.playerId === incomingPlayerId)
        : undefined;

      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;
        existing.name = name;
        existing.avatar = avatar;
      } else {
        if (room.status !== 'lobby') {
          cb?.({ ok: false, error: 'Game sudah dimulai. Tunggu ronde berikutnya ya!' });
          return;
        }
        // Prevent duplicate exact name in same room
        const nameTaken = room.players.some(
          (p) => p.connected && p.name.toLowerCase() === name.toLowerCase()
        );
        if (nameTaken) {
          cb?.({ ok: false, error: `Nama "${name}" sudah dipakai siswa lain di ruangan ini.` });
          return;
        }

        existing = {
          playerId: `p-${crypto.randomUUID().slice(0, 8)}`,
          socketId: socket.id,
          name,
          avatar,
          connected: true,
          joinedAt: Date.now(),
        };
        room.players.push(existing);
      }

      socket.join(code);
      io.to(code).emit('room:state', serializeRoom(room));
      broadcastActiveRooms();

      cb?.({
        ok: true,
        player: existing,
        roomState: serializeRoom(room),
      });
    });

    socket.on('player:leave_room', ({ roomCode, playerId }) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return;
      const idx = room.players.findIndex((p) => p.playerId === playerId || p.socketId === socket.id);
      if (idx !== -1) {
        const player = room.players[idx];
        if (room.status === 'lobby') {
          room.players.splice(idx, 1);
        } else {
          player.connected = false;
        }
        socket.leave(code);
        io.to(code).emit('room:state', serializeRoom(room));
        broadcastActiveRooms();
      }
    });

    socket.on('player:game_action', ({ roomCode, action }) => {
      const code = String(roomCode || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room || room.status !== 'playing') return;

      const player = room.players.find((p) => p.socketId === socket.id);
      if (!player) return;

      const handler = getGameHandler(room.gameId);
      if (!handler || typeof handler.onPlayerAction !== 'function') return;

      const pack = questionStore.getPackById(room.packId);
      const ctx = createGameContext(room, pack?.questions || []);
      handler.onPlayerAction(ctx, player, action);
    });

    socket.on('disconnect', () => {
      for (const [code, room] of rooms.entries()) {
        if (room.hostSocketId === socket.id) {
          cleanupRoom(room);
          io.to(code).emit('room:closed', { reason: 'Koneksi guru terputus. Ruangan ditutup.' });
          rooms.delete(code);
          broadcastActiveRooms();
          continue;
        }

        const pIdx = room.players.findIndex((p) => p.socketId === socket.id);
        if (pIdx !== -1) {
          const player = room.players[pIdx];
          if (room.status === 'lobby') {
            room.players.splice(pIdx, 1);
          } else {
            player.connected = false;
            const handler = getGameHandler(room.gameId);
            if (handler && typeof handler.onDisconnect === 'function') {
              const pack = questionStore.getPackById(room.packId);
              const ctx = createGameContext(room, pack?.questions || []);
              handler.onDisconnect(ctx, player);
            }
          }
          io.to(code).emit('room:state', serializeRoom(room));
          broadcastActiveRooms();
        }
      }
    });
  });

  // ==================== FRONTEND SERVING ====================

  const distPath = path.resolve(process.cwd(), 'dist');

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build belum tersedia. Jalankan npm run build terlebih dahulu.');
      }
    });
  }

  httpServer.listen(PORT, HOST, () => {
    const lan = detectLanInfo();
    console.log(`EduPlay RTH Server aktif di http://localhost:${PORT} dan ${lan.url}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal menjalankan server EduPlay RTH:', err);
  process.exit(1);
});
