import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  GraduationCap,
  LogOut,
  Radio,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getSocket } from '../utils/socket';
import { sound } from '../utils/sound';
import { getGameById } from '../games/registry';
import { PodiumScreen } from '../components/PodiumScreen';
import { SchoolLogo, SCHOOL_NAME } from '../components/SchoolLogo';
import type { Player, RoomState, RoomSummary } from '../types/platform';

const AVATAR_CHOICES = [
  '🦊',
  '🐼',
  '🦁',
  '🐸',
  '🐨',
  '🐯',
  '🐰',
  '🐙',
  '🦄',
  '🦖',
  '🦉',
  '🐝',
];

const SESSION_STORAGE_KEY = 'eduplay_rth_student_session_v1';

interface SavedStudentSession {
  roomCode: string;
  playerId: string;
  name: string;
  avatar: string;
}

function loadSavedSession(): SavedStudentSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.roomCode && parsed?.playerId && parsed?.name) {
      return {
        roomCode: String(parsed.roomCode).toUpperCase(),
        playerId: String(parsed.playerId),
        name: String(parsed.name),
        avatar: String(parsed.avatar || AVATAR_CHOICES[0]),
      };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function saveStudentSession(session: SavedStudentSession) {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

function clearStudentSession() {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

interface StudentPageProps {
  canAccessHost: boolean;
  onGoHost: () => void;
}

export function StudentPage({ canAccessHost, onGoHost }: StudentPageProps) {
  const initialSession = loadSavedSession();
  const [muted, setMuted] = useState(() => sound.isMuted());
  const [name, setName] = useState(() => initialSession?.name || '');
  const [avatar, setAvatar] = useState(() => initialSession?.avatar || AVATAR_CHOICES[0]);
  const [roomCodeInput, setRoomCodeInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || initialSession?.roomCode || '').toUpperCase().slice(0, 6);
  });

  const [activeRooms, setActiveRooms] = useState<RoomSummary[]>([]);
  const [player, setPlayer] = useState<Player | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [reconnecting, setReconnecting] = useState(() => Boolean(initialSession));

  const socket = getSocket();

  useEffect(() => {
    fetch('/api/rooms/active')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.rooms)) setActiveRooms(d.rooms);
      })
      .catch(() => {});

    const attemptAutoResume = () => {
      const saved = loadSavedSession();
      if (!saved) {
        setReconnecting(false);
        return;
      }
      setReconnecting(true);
      socket.emit(
        'player:join_room',
        {
          roomCode: saved.roomCode,
          playerId: saved.playerId,
          name: saved.name,
          avatar: saved.avatar,
        },
        (res: { ok: boolean; error?: string; player?: Player; roomState?: RoomState }) => {
          setReconnecting(false);
          if (res?.ok && res.player && res.roomState) {
            saveStudentSession({
              roomCode: res.roomState.roomCode,
              playerId: res.player.playerId,
              name: res.player.name,
              avatar: res.player.avatar,
            });
            setPlayer(res.player);
            setRoomState(res.roomState);
            setGameState(res.roomState.gameState || null);
            setErrorMsg(null);
          } else {
            clearStudentSession();
          }
        }
      );
    };

    if (socket.connected) {
      attemptAutoResume();
    }

    const onConnect = () => {
      attemptAutoResume();
    };

    const onActiveList = (list: RoomSummary[]) => {
      setActiveRooms(list || []);
    };

    const onRoomState = (nextRoom: RoomState) => {
      setRoomState(nextRoom);
      if (nextRoom.gameState !== undefined) {
        setGameState(nextRoom.gameState);
      }
    };

    const onGameState = (nextGame: any) => {
      setGameState(nextGame);
    };

    const onKicked = ({ reason }: { reason: string }) => {
      sound.play('wrong');
      clearStudentSession();
      setRoomState(null);
      setPlayer(null);
      setGameState(null);
      setNoticeMsg(reason || 'Kamu dikeluarkan dari ruangan.');
    };

    const onClosed = ({ reason }: { reason: string }) => {
      clearStudentSession();
      setRoomState(null);
      setPlayer(null);
      setGameState(null);
      setNoticeMsg(reason || 'Ruangan telah ditutup oleh guru.');
    };

    socket.on('connect', onConnect);
    socket.on('rooms:active_list', onActiveList);
    socket.on('room:state', onRoomState);
    socket.on('game:state', onGameState);
    socket.on('player:kicked', onKicked);
    socket.on('room:closed', onClosed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('rooms:active_list', onActiveList);
      socket.off('room:state', onRoomState);
      socket.off('game:state', onGameState);
      socket.off('player:kicked', onKicked);
      socket.off('room:closed', onClosed);
    };
  }, [socket]);

  const handleToggleMute = () => {
    setMuted(sound.toggleMute());
  };

  const joinRoomWithCode = (targetCode: string) => {
    const cleanName = name.trim();
    const cleanCode = targetCode.trim().toUpperCase();

    if (!cleanName) {
      sound.play('wrong');
      setErrorMsg('Tulis nama panggilan kamu dulu ya!');
      return;
    }
    if (!cleanCode) {
      sound.play('wrong');
      setErrorMsg('Masukkan kode ruangan 4 huruf dari layar guru.');
      return;
    }

    setErrorMsg(null);
    setNoticeMsg(null);
    setJoining(true);
    sound.play('click');

    const saved = loadSavedSession();
    const reusablePlayerId =
      saved && saved.roomCode === cleanCode && saved.name.toLowerCase() === cleanName.toLowerCase()
        ? saved.playerId
        : undefined;

    socket.emit(
      'player:join_room',
      {
        roomCode: cleanCode,
        name: cleanName,
        avatar,
        playerId: reusablePlayerId,
      },
      (res: { ok: boolean; error?: string; player?: Player; roomState?: RoomState }) => {
        setJoining(false);
        if (!res?.ok || !res.player || !res.roomState) {
          sound.play('wrong');
          setErrorMsg(res?.error || 'Tidak bisa bergabung ke ruangan.');
          return;
        }
        sound.play('correct');
        saveStudentSession({
          roomCode: res.roomState.roomCode,
          playerId: res.player.playerId,
          name: res.player.name,
          avatar: res.player.avatar,
        });
        setPlayer(res.player);
        setRoomState(res.roomState);
        setGameState(res.roomState.gameState || null);
      }
    );
  };

  const handleSubmitJoin = (e: React.FormEvent) => {
    e.preventDefault();
    joinRoomWithCode(roomCodeInput);
  };

  const handleLeaveRoom = () => {
    sound.play('click');
    clearStudentSession();
    if (roomState && player) {
      socket.emit('player:leave_room', {
        roomCode: roomState.roomCode,
        playerId: player.playerId,
      });
    }
    setRoomState(null);
    setPlayer(null);
    setGameState(null);
  };

  const currentGame = roomState ? getGameById(roomState.gameId) : undefined;

  return (
    <div className="min-h-screen bg-[#F4F8F6] bg-emerald-subtle-grid text-slate-900">
      {/* Compact Top Bar */}
      <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <SchoolLogo className="h-9 w-9" />
            <span className="font-display text-lg font-black tracking-tight text-emerald-950">
              EduPlay RTH
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={muted ? 'Aktifkan suara' : 'Bisukan suara'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {!roomState && canAccessHost && (
              <button
                type="button"
                onClick={() => {
                  sound.play('click');
                  onGoHost();
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <GraduationCap className="h-4 w-4 text-emerald-700" />
                <span>Mode Guru</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* 1. ACTIVE GAMEPLAY */}
        {roomState && player && roomState.status === 'playing' && currentGame && (
          <currentGame.PlayerComponent
            socket={socket}
            roomCode={roomState.roomCode}
            player={player}
            roomState={roomState}
            gameState={gameState}
          />
        )}

        {/* 2. FINAL PODIUM RESULTS */}
        {roomState && player && roomState.status === 'finished' && (
          <PodiumScreen
            mode="player"
            gameName={currentGame?.name || roomState.gameId}
            packTitle={roomState.packTitle}
            results={roomState.results}
            currentPlayerId={player.playerId}
            onLeaveRoom={handleLeaveRoom}
          />
        )}

        {/* 3. STUDENT WAITING LOBBY */}
        {roomState && player && roomState.status === 'lobby' && (
          <div className="mx-auto flex min-h-[calc(100vh-56px)] max-w-lg flex-col justify-between gap-6 px-4 py-8">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-3xl border border-emerald-900/15 bg-white text-center shadow-sm"
            >
              <div className="bg-emerald-royal px-6 py-6 text-white">
                <span className="inline-block text-6xl drop-shadow-sm" aria-hidden="true">
                  {player.avatar}
                </span>
                <h1 className="mt-2 font-display text-2xl font-black text-white">
                  Halo, {player.name}!
                </h1>
                <p className="mt-1 text-sm font-semibold text-emerald-100">
                  Kamu masuk ke ruangan{' '}
                  <span className="font-mono-num font-black text-amber-300">
                    {roomState.roomCode}
                  </span>
                </p>
              </div>

              <div className="p-6">
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 text-left">
                  <p className="text-xs font-semibold text-emerald-800">Permainan</p>
                  <p className="mt-0.5 font-display text-base font-extrabold text-slate-900">
                    {currentGame?.name || roomState.gameId}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{roomState.packTitle}</p>
                </div>

                <div className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-slate-700 tabular-nums">
                  <Users className="h-4 w-4 text-emerald-600" />
                  <span>
                    {roomState.players.filter((p) => p.connected).length} siswa siap bermain
                  </span>
                </div>

                <p className="mt-4 text-sm text-slate-500">
                  Perhatikan layar guru. Permainan akan dimulai secara otomatis!
                </p>
              </div>
            </motion.div>

            <button
              type="button"
              onClick={handleLeaveRoom}
              className="btn-tactile inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span>Keluar Ruangan</span>
            </button>
          </div>
        )}

        {/* 4. AUTO-RECONNECTING STATE AFTER REFRESH */}
        {!roomState && reconnecting && (
          <div className="mx-auto flex min-h-[65vh] max-w-md items-center justify-center px-4">
            <div className="w-full rounded-3xl border border-emerald-900/15 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 p-2">
                <SchoolLogo className="h-full w-full" />
              </div>
              <p className="font-display text-lg font-black text-emerald-950">
                Melanjutkan Permainan...
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Menyambungkan kembali ke ruangan kamu secara otomatis.
              </p>
            </div>
          </div>
        )}

        {/* 5. STUDENT JOIN SCREEN (DEFAULT LANDING) */}
        {!roomState && !reconnecting && (
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 items-start gap-4 px-4 py-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:py-10">
            {/* Left Majestic School Crest Hero & Active LAN Rooms */}
            <section className="flex flex-col gap-4 lg:col-span-5">
              {/* Compact Mobile Hero / Grand Desktop Royal Crest Panel */}
              <div className="bg-emerald-royal overflow-hidden rounded-3xl border border-emerald-800 p-4 text-white shadow-md sm:p-6 lg:p-7">
                <div className="flex items-center gap-3.5 lg:flex-col lg:items-start lg:gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/95 p-1.5 shadow-sm lg:h-20 lg:w-20 lg:p-2">
                    <SchoolLogo className="h-full w-full" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-300">
                      {SCHOOL_NAME} · Wi-Fi Kelas Offline
                    </p>
                    <h1 className="mt-0.5 font-display text-xl font-black leading-tight text-white sm:text-2xl lg:mt-1.5 lg:text-3xl">
                      Belajar Sambil Main Bareng Satu Kelas
                    </h1>
                  </div>
                </div>
                <p className="mt-3 hidden text-sm leading-relaxed text-emerald-100/90 lg:block">
                  Pilih avatar favoritmu, tulis nama panggilan, lalu gabung ke ruangan kuis yang
                  dibuka guru di layar proyektor.
                </p>
              </div>

              {/* Active LAN Rooms Quick Detection */}
              <div
                className={`rounded-3xl border border-emerald-900/10 bg-white p-4 shadow-sm sm:p-5 ${
                  activeRooms.length === 0 ? 'hidden lg:block' : 'block'
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Radio className="h-4 w-4 text-emerald-600" />
                    <span>Ruangan Aktif di Jaringan Ini</span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800 tabular-nums">
                    {activeRooms.length} aktif
                  </span>
                </div>

                {activeRooms.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    {activeRooms.map((rm) => (
                      <button
                        key={rm.roomCode}
                        type="button"
                        onClick={() => {
                          sound.play('click');
                          setRoomCodeInput(rm.roomCode);
                          if (name.trim()) {
                            joinRoomWithCode(rm.roomCode);
                          }
                        }}
                        className="btn-tactile flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 text-left hover:bg-emerald-100/80"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-display text-sm font-extrabold text-emerald-950">
                            {rm.gameName}
                          </p>
                          <p className="truncate text-xs text-slate-600 tabular-nums">
                            {rm.packTitle} · {rm.playerCount} siswa
                          </p>
                        </div>
                        <span className="shrink-0 rounded-xl bg-emerald-700 px-3 py-1.5 font-mono-num text-sm font-black text-amber-300">
                          {rm.roomCode}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Belum ada ruangan terbuka. Tunggu guru membuka lobby atau ketik kode ruangan
                    secara manual.
                  </p>
                )}
              </div>
            </section>

            {/* Right Primary Student Join Form */}
            <section className="rounded-3xl border border-emerald-900/10 bg-white p-5 shadow-sm sm:p-7 lg:col-span-7">
              <form onSubmit={handleSubmitJoin} className="flex flex-col gap-4 sm:gap-5">
                {noticeMsg && (
                  <div
                    role="status"
                    className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
                  >
                    {noticeMsg}
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800"
                  >
                    {errorMsg}
                  </div>
                )}

                {/* 1. Student Name */}
                <div>
                  <label
                    htmlFor="student-name"
                    className="mb-1.5 block font-display text-sm font-bold text-slate-800"
                  >
                    Nama Kamu
                  </label>
                  <input
                    id="student-name"
                    type="text"
                    maxLength={24}
                    autoComplete="nickname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Budi, Siti, Dimas..."
                    className="min-h-[50px] w-full rounded-2xl border-2 border-slate-200 bg-[#F7FAF8] px-4 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                </div>

                {/* 2. Emoji Avatar Grid */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-display text-sm font-bold text-slate-800">
                      Pilih Avatar Favorit
                    </span>
                    <span className="text-sm font-semibold text-emerald-800">
                      Terpilih: <span className="text-xl">{avatar}</span>
                    </span>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label="Pilih Avatar Emoji"
                    className="grid grid-cols-6 gap-2 sm:gap-2.5"
                  >
                    {AVATAR_CHOICES.map((em) => {
                      const selected = avatar === em;
                      return (
                        <button
                          key={em}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={`Avatar ${em}`}
                          onClick={() => {
                            sound.play('click');
                            setAvatar(em);
                          }}
                          className={`btn-tactile flex min-h-[50px] items-center justify-center rounded-2xl border-2 text-2xl transition-colors sm:min-h-[56px] sm:text-3xl ${
                            selected
                              ? 'border-emerald-600 bg-emerald-50 ring-2 ring-amber-300/70'
                              : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40'
                          }`}
                        >
                          {em}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Room Code */}
                <div>
                  <label
                    htmlFor="room-code"
                    className="mb-1.5 block font-display text-sm font-bold text-slate-800"
                  >
                    Kode Ruangan
                  </label>
                  <input
                    id="room-code"
                    type="text"
                    maxLength={6}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    placeholder="Contoh: ABCD"
                    className="min-h-[54px] w-full rounded-2xl border-2 border-slate-200 bg-[#F7FAF8] px-4 text-center font-mono-num text-2xl font-black tracking-[0.25em] text-emerald-950 uppercase placeholder:text-base placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Primary Join Button */}
                <button
                  type="submit"
                  disabled={joining}
                  className="btn-tactile inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-b-4 border-emerald-900 bg-emerald-600 px-6 py-3.5 font-display text-lg font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
                >
                  <span>{joining ? 'Menghubungkan...' : 'Gabung Ruangan'}</span>
                  <ArrowRight className="h-5 w-5 text-amber-300" />
                </button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
