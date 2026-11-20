import { useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Copy, Play, UserMinus, Users, Wifi, X } from 'lucide-react';
import type { GameModule, RoomState, ServerInfo } from '../types/platform';
import { sound } from '../utils/sound';
import { GameIcon } from './GameIcon';
import { SchoolLogo, SCHOOL_NAME } from './SchoolLogo';

interface HostLobbyViewProps {
  roomState: RoomState;
  game: GameModule;
  serverInfo: ServerInfo | null;
  onStartGame: () => void;
  onKickPlayer: (playerId: string) => void;
  onCloseRoom: () => void;
  errorMessage: string | null;
}

export function HostLobbyView({
  roomState,
  game,
  serverInfo,
  onStartGame,
  onKickPlayer,
  onCloseRoom,
  errorMessage,
}: HostLobbyViewProps) {
  const [copied, setCopied] = useState(false);

  const lanUrl = serverInfo?.url || window.location.origin;
  const joinUrlWithRoom = `${lanUrl}/?room=${roomState.roomCode}`;
  const connectedPlayers = roomState.players.filter((p) => p.connected);

  const handleCopyUrl = () => {
    sound.play('click');
    if (navigator.clipboard) {
      navigator.clipboard.writeText(joinUrlWithRoom).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Lobby Projector Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-emerald-900/10 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm"
            style={{ backgroundColor: game.themeColor }}
          >
            <GameIcon name={game.icon} className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-800">
              Ruang Lobby Proyektor · {game.category} · {SCHOOL_NAME}
            </p>
            <h1 className="font-display text-xl font-black text-emerald-950 sm:text-2xl">
              {game.name} — {roomState.packTitle}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              sound.play('click');
              onCloseRoom();
            }}
            className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <X className="h-4 w-4" />
            <span>Tutup Ruang</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.play('click');
              onStartGame();
            }}
            disabled={connectedPlayers.length === 0}
            className="btn-tactile inline-flex items-center gap-2 rounded-xl border-b-4 border-emerald-900 bg-emerald-600 px-6 py-2.5 text-base font-extrabold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 disabled:text-slate-500 whitespace-nowrap shrink-0"
          >
            <Play className="h-5 w-5 fill-current text-amber-300" />
            <span>Mulai Game ({connectedPlayers.length})</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-800">
          {errorMessage}
        </div>
      )}

      {/* Main 2-Column Projector Layout: Royal Emerald QR & Connection Card + Real-time Student List */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Majestic Royal Emerald QR Code & LAN IP Showcase */}
        <section className="bg-emerald-royal flex flex-col items-center justify-between gap-5 rounded-3xl border border-emerald-800 p-6 text-center text-white shadow-md sm:p-8 lg:col-span-5">
          <div className="w-full">
            <div className="flex items-center justify-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 p-1 shadow-sm">
                <SchoolLogo className="h-full w-full" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-amber-300">Scan QR atau Buka Alamat Wi-Fi</p>
                <p className="font-display text-sm font-extrabold text-white">{SCHOOL_NAME}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3">
              <Wifi className="h-4 w-4 shrink-0 text-amber-300" />
              <span className="truncate font-mono-num text-base font-extrabold text-white sm:text-lg">
                {lanUrl}
              </span>
              <button
                type="button"
                onClick={handleCopyUrl}
                aria-label="Salin link ruangan"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white hover:bg-white/20"
              >
                {copied ? <Check className="h-4 w-4 text-amber-300" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Large Crisp QR Code */}
          <div className="rounded-3xl border-4 border-amber-400/80 bg-white p-4 shadow-lg">
            <QRCodeSVG
              value={joinUrlWithRoom}
              size={232}
              level="M"
              bgColor="#FFFFFF"
              fgColor="#022C22"
              includeMargin={false}
            />
          </div>

          <div className="w-full rounded-2xl border border-amber-400/35 bg-black/25 px-6 py-4">
            <p className="text-xs font-bold text-emerald-100">Kode Ruangan</p>
            <p
              data-testid="lobby-room-code"
              className="mt-1 font-mono-num text-5xl font-black tracking-[0.22em] text-amber-300"
            >
              {roomState.roomCode}
            </p>
          </div>
        </section>

        {/* Right: Joined Students Grid */}
        <section className="flex flex-col rounded-3xl border border-emerald-900/10 bg-white p-6 shadow-sm sm:p-8 lg:col-span-7">
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="font-display text-xl font-extrabold text-emerald-950">
                Siswa Bergabung
              </h2>
            </div>
            <span
              data-testid="lobby-player-count"
              className="font-mono-num text-lg font-extrabold text-emerald-700"
            >
              {connectedPlayers.length} Siswa
            </span>
          </div>

          {connectedPlayers.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 p-10 text-center">
              <span className="text-5xl" aria-hidden="true">
                📱
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-emerald-950">
                Menunggu Siswa Masuk ke Ruangan...
              </h3>
              <p className="mt-1 max-w-md text-sm text-slate-600">
                Minta siswa menghubungkan HP ke Wi-Fi yang sama, lalu scan QR Code di sebelah kiri
                atau ketik alamat <strong className="font-mono-num text-emerald-900">{lanUrl}</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {connectedPlayers.map((p) => (
                <motion.div
                  key={p.playerId}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="text-3xl leading-none" aria-hidden="true">
                      {p.avatar}
                    </span>
                    <span className="truncate font-display text-base font-bold text-emerald-950">
                      {p.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sound.play('click');
                      onKickPlayer(p.playerId);
                    }}
                    aria-label={`Tendang ${p.name}`}
                    title={`Tendang ${p.name}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-100 hover:text-rose-700"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
