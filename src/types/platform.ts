import type { ComponentType } from 'react';
import type { Socket } from 'socket.io-client';

export type Difficulty = 'Mudah' | 'Sedang' | 'Sulit';

export interface Question {
  id: string;
  text: string;
  options: [string, string, string, string]; // A, B, C, D
  correctIndex: 0 | 1 | 2 | 3;
  difficulty: Difficulty;
}

export interface QuestionPack {
  id: string;
  title: string;
  subject: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  questions: Question[];
}

export interface Player {
  playerId: string;
  socketId: string;
  name: string;
  avatar: string;
  connected: boolean;
  joinedAt: number;
}

export interface GameResultEntry {
  playerId: string;
  name: string;
  avatar: string;
  score: number;
  correctCount: number;
  wrongCount: number;
}

export type BossType = 'inferno-dragon' | 'titan-golem' | 'dark-overlord';
export type RaidLevel = 'santai' | 'standar' | 'epik';

export interface GameSettings {
  timePerQuestion: number; // seconds (for Quiz Kilat)
  gameDuration: number; // seconds (for Boss Raid)
  shuffleQuestions: boolean;
  questionLimit: number; // 0 = all questions in pack
  bossMaxHp: number; // 0 = Auto-Scale Kelas
  bossType?: BossType;
  raidLevel?: RaidLevel;
}

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface RoomSummary {
  roomCode: string;
  gameId: string;
  gameName: string;
  packId: string;
  packTitle: string;
  status: RoomStatus;
  playerCount: number;
}

export interface RoomState {
  roomCode: string;
  gameId: string;
  packId: string;
  packTitle: string;
  status: RoomStatus;
  settings: GameSettings;
  players: Player[];
  results: GameResultEntry[];
  gameState: unknown;
}

export interface ServerInfo {
  ip: string;
  port: number;
  url: string;
  interfaces: Array<{ name: string; address: string }>;
  canAccessHost?: boolean;
}

export interface HostGameProps {
  socket: Socket;
  roomCode: string;
  roomState: RoomState;
  gameState: any;
  onForceEnd: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export interface PlayerGameProps {
  socket: Socket;
  roomCode: string;
  player: Player;
  roomState: RoomState;
  gameState: any;
}

export interface GameModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  themeColor: string;
  modeType: 'turn-quiz' | 'realtime-boss';
  HostComponent: ComponentType<HostGameProps>;
  PlayerComponent: ComponentType<PlayerGameProps>;
}
