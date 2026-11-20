import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Gamepad2,
  Play,
  Settings2,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { GAME_REGISTRY, getGameById } from '../games/registry';
import { getSocket } from '../utils/socket';
import { sound } from '../utils/sound';
import { GameIcon } from '../components/GameIcon';
import { QuestionBankManager } from '../components/QuestionBankManager';
import { HostLobbyView } from '../components/HostLobbyView';
import { PodiumScreen } from '../components/PodiumScreen';
import { SchoolLogo, SCHOOL_NAME } from '../components/SchoolLogo';
import type { GameSettings, QuestionPack, RoomState, ServerInfo } from '../types/platform';

interface HostPageProps {
  onGoStudent: () => void;
}

export function HostPage({ onGoStudent }: HostPageProps) {
  const [muted, setMuted] = useState(() => sound.isMuted());
  const [activeTab, setActiveTab] = useState<'setup' | 'bank'>('setup');

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [packs, setPacks] = useState<QuestionPack[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(true);

  const [selectedGameId, setSelectedGameId] = useState<string>(GAME_REGISTRY[0]?.id ?? '');
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [settings, setSettings] = useState<GameSettings>({
    timePerQuestion: 15,
    gameDuration: 90,
    shuffleQuestions: true,
    questionLimit: 0,
    bossMaxHp: 1000,
  });

  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const socket = getSocket();

  const fetchPacks = useCallback(async () => {
    try {
      const res = await fetch('/api/packs');
      const data = await res.json();
      if (Array.isArray(data.packs)) {
        setPacks(data.packs);
        setSelectedPackId((prev) => {
          if (prev && data.packs.some((p: QuestionPack) => p.id === prev)) return prev;
          return data.packs[0]?.id ?? '';
        });
      }
    } catch {
      setErrorMsg('Gagal memuat bank soal dari server lokal.');
    } finally {
      setLoadingPacks(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
    fetch('/api/server-info')
      .then((r) => r.json())
      .then((d) => setServerInfo(d))
      .catch(() => {});
  }, [fetchPacks]);

  useEffect(() => {
    const onRoomState = (nextRoom: RoomState) => {
      setRoomState(nextRoom);
      if (nextRoom.gameState !== undefined) {
        setGameState(nextRoom.gameState);
      }
    };
    const onGameState = (nextGame: any) => {
      setGameState(nextGame);
    };

    socket.on('room:state', onRoomState);
    socket.on('game:state', onGameState);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('game:state', onGameState);
    };
  }, [socket]);

  const selectedGame = getGameById(selectedGameId);
  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? null;

  const handleCreateLobby = () => {
    setErrorMsg(null);
    if (!selectedGame) {
      setErrorMsg('Pilih modul game terlebih dahulu.');
      return;
    }
    if (!selectedPack || selectedPack.questions.length === 0) {
      setErrorMsg('Pilih paket soal yang memiliki minimal 1 pertanyaan.');
      return;
    }

    sound.play('click');
    socket.emit(
      'host:create_room',
      {
        gameId: selectedGame.id,
        gameName: selectedGame.name,
        packId: selectedPack.id,
        settings,
      },
      (res: { ok: boolean; error?: string; roomState?: RoomState }) => {
        if (!res?.ok || !res.roomState) {
          sound.play('wrong');
          setErrorMsg(res?.error || 'Gagal membuka ruangan lobby.');
          return;
        }
        sound.play('correct');
        setRoomState(res.roomState);
        setGameState(null);
      }
    );
  };

  const handleKickPlayer = (playerId: string) => {
    if (!roomState) return;
    socket.emit('host:kick_player', { roomCode: roomState.roomCode, playerId });
  };

  const handleStartGame = () => {
    if (!roomState) return;
    setErrorMsg(null);
    socket.emit(
      'host:start_game',
      { roomCode: roomState.roomCode },
      (res: { ok: boolean; error?: string }) => {
        if (!res?.ok) {
          sound.play('wrong');
          setErrorMsg(res?.error || 'Gagal memulai game.');
        }
      }
    );
  };

  const handleForceEnd = () => {
    if (!roomState) return;
    socket.emit('host:game_action', {
      roomCode: roomState.roomCode,
      action: { type: 'host:force_end' },
    });
  };

  const handlePlayAgain = () => {
    if (!roomState) return;
    socket.emit(
      'host:restart_lobby',
      { roomCode: roomState.roomCode },
      (res: { ok: boolean; roomState?: RoomState }) => {
        if (res?.ok && res.roomState) {
          setRoomState(res.roomState);
          setGameState(null);
        }
      }
    );
  };

  const handleCloseRoom = () => {
    if (!roomState) return;
    socket.emit('host:close_room', { roomCode: roomState.roomCode }, () => {
      setRoomState(null);
      setGameState(null);
      setErrorMsg(null);
    });
  };

  const activeRoomGame = roomState ? getGameById(roomState.gameId) : undefined;

  return (
    <div className="min-h-screen bg-[#F4F8F6] bg-emerald-subtle-grid text-slate-900">
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-emerald-900/10 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              if (!roomState) setActiveTab('setup');
            }}
            className="flex items-center gap-3 whitespace-nowrap shrink-0 text-left"
          >
            <SchoolLogo className="h-10 w-10" />
            <span className="font-display text-lg font-black tracking-tight text-emerald-950">
              EduPlay RTH
            </span>
          </button>

          {/* Zone 2: Concise Nav Links (hidden during active room to keep projector focused) */}
          {!roomState ? (
            <nav aria-label="Navigasi Guru" className="flex items-center gap-2 sm:gap-6">
              <button
                type="button"
                onClick={() => {
                  sound.play('click');
                  setActiveTab('setup');
                }}
                className={`inline-flex items-center gap-1.5 border-b-2 px-2 py-1 text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'setup'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-600 hover:text-emerald-900'
                }`}
              >
                <Gamepad2 className="h-4 w-4" />
                <span>Pilih Game</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.play('click');
                  setActiveTab('bank');
                }}
                className={`inline-flex items-center gap-1.5 border-b-2 px-2 py-1 text-sm font-bold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'bank'
                    ? 'border-emerald-600 text-emerald-800'
                    : 'border-transparent text-slate-600 hover:text-emerald-900'
                }`}
              >
                <BookOpen className="h-4 w-4" />
                <span>Bank Soal</span>
              </button>
            </nav>
          ) : (
            <div className="hidden text-sm font-semibold text-slate-500 md:block">
              Ruang{' '}
              <span className="font-mono-num font-bold text-emerald-900">{roomState.roomCode}</span>
              {' · '}
              <span>{serverInfo?.url || window.location.origin}</span>
            </div>
          )}

          {/* Zone 3: Sound & Mode Siswa Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setMuted(sound.toggleMute())}
              aria-label={muted ? 'Aktifkan efek suara' : 'Bisukan efek suara'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-900/10 bg-white text-slate-600 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            {!roomState && (
              <button
                type="button"
                onClick={() => {
                  sound.play('click');
                  onGoStudent();
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
              >
                <Smartphone className="h-4 w-4 text-emerald-700" />
                <span>Mode Siswa</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>
        {/* ACTIVE ROOM: LOBBY */}
        {roomState && roomState.status === 'lobby' && activeRoomGame && (
          <HostLobbyView
            roomState={roomState}
            game={activeRoomGame}
            serverInfo={serverInfo}
            onStartGame={handleStartGame}
            onKickPlayer={handleKickPlayer}
            onCloseRoom={handleCloseRoom}
            errorMessage={errorMsg}
          />
        )}

        {/* ACTIVE ROOM: PLAYING */}
        {roomState && roomState.status === 'playing' && activeRoomGame && (
          <activeRoomGame.HostComponent
            socket={socket}
            roomCode={roomState.roomCode}
            roomState={roomState}
            gameState={gameState}
            onForceEnd={handleForceEnd}
          />
        )}

        {/* ACTIVE ROOM: FINISHED (PODIUM) */}
        {roomState && roomState.status === 'finished' && (
          <PodiumScreen
            mode="host"
            gameName={activeRoomGame?.name || roomState.gameId}
            packTitle={roomState.packTitle}
            results={roomState.results}
            onPlayAgain={handlePlayAgain}
            onExitToDashboard={handleCloseRoom}
          />
        )}

        {/* DASHBOARD VIEW (NO ACTIVE ROOM) */}
        {!roomState && (
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
            {activeTab === 'setup' ? (
              <>
                {/* Grand Emerald School Hero Banner */}
                <section className="bg-emerald-royal flex flex-wrap items-center justify-between gap-6 rounded-3xl border border-emerald-800 px-6 py-6 text-white shadow-md sm:px-8">
                  <div className="flex items-center gap-4 sm:gap-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/95 p-2 shadow-sm sm:h-20 sm:w-20">
                      <SchoolLogo className="h-full w-full" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-amber-300 sm:text-sm">
                        {SCHOOL_NAME} · Al-Mukhlisiyyah
                      </p>
                      <h1 className="mt-0.5 font-display text-2xl font-black text-white sm:text-3xl">
                        Pilih Game &amp; Mulai Sesi Kelas
                      </h1>
                      <p className="mt-1 text-xs font-medium text-emerald-100/90 sm:text-sm">
                        Server Wi-Fi Lokal:{' '}
                        <span className="font-mono-num font-bold text-amber-200">
                          {serverInfo?.url || 'http://localhost:3000'}
                        </span>
                      </p>
                    </div>
                  </div>
                </section>

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm font-bold text-rose-800"
                  >
                    {errorMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  {/* Left: Modular Game Registry Gallery */}
                  <section className="flex flex-col gap-4 lg:col-span-7">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-lg font-extrabold text-emerald-950">
                        1. Pilih Modul Game
                      </h2>
                      <span className="text-xs font-semibold text-emerald-800/80 tabular-nums">
                        {GAME_REGISTRY.length} game tersedia
                      </span>
                    </div>

                    {GAME_REGISTRY.length === 0 ? (
                      <div className="rounded-3xl border-2 border-dashed border-emerald-300 bg-white p-10 text-center">
                        <Gamepad2 className="mx-auto h-10 w-10 text-emerald-500" />
                        <h3 className="mt-3 font-display text-lg font-bold text-slate-800">
                          Belum Ada Modul Game Terdaftar
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Platform siap ditambah game baru melalui{' '}
                          <code className="font-mono-num text-slate-700">src/games/registry.ts</code>{' '}
                          dan{' '}
                          <code className="font-mono-num text-slate-700">
                            server/games/registry.js
                          </code>
                          .
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {GAME_REGISTRY.map((game) => {
                          const active = selectedGameId === game.id;
                          return (
                            <button
                              key={game.id}
                              type="button"
                              onClick={() => {
                                sound.play('click');
                                setSelectedGameId(game.id);
                              }}
                              aria-pressed={active}
                              className={`btn-tactile flex flex-col justify-between rounded-3xl border-2 p-6 text-left transition-all ${
                                active
                                  ? 'border-emerald-600 bg-white ring-4 ring-emerald-100'
                                  : 'border-emerald-900/10 bg-white hover:border-emerald-300'
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-3">
                                  <div
                                    className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm"
                                    style={{ backgroundColor: game.themeColor }}
                                  >
                                    <GameIcon name={game.icon} className="h-6 w-6" />
                                  </div>
                                  <span className="text-xs font-bold text-slate-500">
                                    {game.category}
                                  </span>
                                </div>
                                <h3 className="mt-4 font-display text-xl font-extrabold text-emerald-950">
                                  {game.name}
                                </h3>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                                  {game.description}
                                </p>
                              </div>

                              <div
                                className={`mt-5 border-t border-slate-100 pt-3 text-xs font-bold ${
                                  active ? 'text-emerald-700' : 'text-slate-500'
                                }`}
                              >
                                {active ? 'Terpilih untuk dimainkan' : 'Klik untuk memilih'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Right: Pack Selection & Settings Panel */}
                  <section className="flex flex-col gap-5 rounded-3xl border border-emerald-900/10 bg-white p-6 shadow-sm lg:col-span-5">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
                      <Settings2 className="h-5 w-5 text-emerald-600" />
                      <h2 className="font-display text-lg font-extrabold text-emerald-950">
                        2. Paket Soal &amp; Pengaturan
                      </h2>
                    </div>

                    {/* Question Pack Select */}
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label
                          htmlFor="pack-select"
                          className="text-sm font-bold text-slate-800"
                        >
                          Pilih Paket Soal
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            sound.play('click');
                            setActiveTab('bank');
                          }}
                          className="text-xs font-bold text-emerald-700 hover:underline"
                        >
                          Kelola Bank Soal
                        </button>
                      </div>

                      {loadingPacks ? (
                        <p className="text-sm text-slate-500">Memuat paket soal...</p>
                      ) : (
                        <select
                          id="pack-select"
                          value={selectedPackId}
                          onChange={(e) => setSelectedPackId(e.target.value)}
                          className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-[#F7FAF8] px-4 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                        >
                          {packs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title} ({p.questions.length} soal)
                            </option>
                          ))}
                        </select>
                      )}
                      {selectedPack && (
                        <p className="mt-1.5 text-xs text-slate-500">
                          {selectedPack.subject} · {selectedPack.questions.length} pertanyaan siap
                          digunakan
                        </p>
                      )}
                    </div>

                    {/* Mode-Specific Settings */}
                    {selectedGame?.modeType === 'realtime-boss' ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="boss-duration"
                            className="mb-1.5 block text-xs font-bold text-slate-700"
                          >
                            Durasi Pertempuran
                          </label>
                          <select
                            id="boss-duration"
                            value={settings.gameDuration}
                            onChange={(e) =>
                              setSettings({ ...settings, gameDuration: Number(e.target.value) })
                            }
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-[#F7FAF8] px-3 text-sm font-bold text-slate-900"
                          >
                            <option value={60}>60 Detik</option>
                            <option value={90}>90 Detik</option>
                            <option value={120}>120 Detik</option>
                            <option value={180}>180 Detik</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="boss-hp"
                            className="mb-1.5 block text-xs font-bold text-slate-700"
                          >
                            HP Boss
                          </label>
                          <select
                            id="boss-hp"
                            value={settings.bossMaxHp}
                            onChange={(e) =>
                              setSettings({ ...settings, bossMaxHp: Number(e.target.value) })
                            }
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-[#F7FAF8] px-3 text-sm font-bold text-slate-900"
                          >
                            <option value={600}>600 HP (Cepat)</option>
                            <option value={1000}>1.000 HP (Normal)</option>
                            <option value={2000}>2.000 HP (Kelas Besar)</option>
                            <option value={3500}>3.500 HP (Tantangan)</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="time-per-q"
                            className="mb-1.5 block text-xs font-bold text-slate-700"
                          >
                            Waktu per Soal
                          </label>
                          <select
                            id="time-per-q"
                            value={settings.timePerQuestion}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                timePerQuestion: Number(e.target.value),
                              })
                            }
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-[#F7FAF8] px-3 text-sm font-bold text-slate-900"
                          >
                            <option value={10}>10 Detik</option>
                            <option value={15}>15 Detik</option>
                            <option value={20}>20 Detik</option>
                            <option value={30}>30 Detik</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="q-limit"
                            className="mb-1.5 block text-xs font-bold text-slate-700"
                          >
                            Jumlah Soal
                          </label>
                          <select
                            id="q-limit"
                            value={settings.questionLimit}
                            onChange={(e) =>
                              setSettings({
                                ...settings,
                                questionLimit: Number(e.target.value),
                              })
                            }
                            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-[#F7FAF8] px-3 text-sm font-bold text-slate-900"
                          >
                            <option value={0}>Semua Soal ({selectedPack?.questions.length ?? 0})</option>
                            <option value={3}>3 Soal (Kilat)</option>
                            <option value={5}>5 Soal</option>
                            <option value={10}>10 Soal</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Shuffle Toggle */}
                    <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-emerald-900/10 bg-[#F7FAF8] px-4 py-3">
                      <span className="text-sm font-bold text-slate-800">Acak Urutan Soal</span>
                      <input
                        type="checkbox"
                        checked={settings.shuffleQuestions}
                        onChange={(e) =>
                          setSettings({ ...settings, shuffleQuestions: e.target.checked })
                        }
                        className="h-5 w-5 rounded border-slate-300 accent-emerald-600"
                      />
                    </label>

                    {/* Primary CTA: Open Lobby */}
                    <button
                      type="button"
                      onClick={handleCreateLobby}
                      disabled={!selectedGame || !selectedPack || selectedPack.questions.length === 0}
                      className="btn-tactile mt-1 inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl border-b-4 border-emerald-900 bg-emerald-600 px-6 py-3.5 font-display text-lg font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500"
                    >
                      <Play className="h-5 w-5 fill-current text-amber-300" />
                      <span>Buka Ruang Lobby</span>
                    </button>
                  </section>
                </div>
              </>
            ) : (
              <>
                <section className="bg-emerald-royal flex flex-wrap items-center gap-4 rounded-3xl border border-emerald-800 px-6 py-5 text-white shadow-md sm:px-8">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/95 p-1.5 shadow-sm">
                    <SchoolLogo className="h-full w-full" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-amber-300 sm:text-sm">
                      Database Offline · Tersimpan di data/questions.json
                    </p>
                    <h1 className="mt-0.5 font-display text-2xl font-black text-white sm:text-3xl">
                      Manajemen Bank Soal
                    </h1>
                  </div>
                </section>
                <QuestionBankManager packs={packs} onRefreshPacks={fetchPacks} />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
