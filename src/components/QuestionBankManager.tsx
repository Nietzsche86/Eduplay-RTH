import { useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Difficulty, Question, QuestionPack } from '../types/platform';
import { sound } from '../utils/sound';

interface QuestionBankManagerProps {
  packs: QuestionPack[];
  onRefreshPacks: () => Promise<void>;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;
const DIFFICULTIES: Difficulty[] = ['Mudah', 'Sedang', 'Sulit'];

function emptyQuestionDraft(): Omit<Question, 'id'> & { id?: string } {
  return {
    text: '',
    options: ['', '', '', ''],
    correctIndex: 0,
    difficulty: 'Mudah',
  };
}

export function QuestionBankManager({ packs, onRefreshPacks }: QuestionBankManagerProps) {
  const [selectedPackId, setSelectedPackId] = useState<string>(packs[0]?.id ?? '');
  const [isCreatingPack, setIsCreatingPack] = useState(false);
  const [newPackForm, setNewPackForm] = useState({ title: '', subject: 'Umum', description: '' });

  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({ title: '', subject: '', description: '' });

  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [questionDraft, setQuestionDraft] = useState<Omit<Question, 'id'> & { id?: string }>(
    emptyQuestionDraft()
  );

  const [confirmDeletePack, setConfirmDeletePack] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedPack = packs.find((p) => p.id === selectedPackId) ?? packs[0] ?? null;

  const showNotice = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
  };

  const handleCreatePack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPackForm.title.trim()) {
      showNotice('err', 'Judul paket soal wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPackForm.title.trim(),
          subject: newPackForm.subject.trim() || 'Umum',
          description: newPackForm.description.trim(),
          questions: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal membuat paket soal.');
      sound.play('correct');
      await onRefreshPacks();
      setSelectedPackId(data.pack.id);
      setIsCreatingPack(false);
      setNewPackForm({ title: '', subject: 'Umum', description: '' });
      showNotice('ok', `Paket "${data.pack.title}" berhasil dibuat.`);
    } catch (err: any) {
      sound.play('wrong');
      showNotice('err', err.message || 'Gagal membuat paket soal.');
    } finally {
      setBusy(false);
    }
  };

  const savePackUpdate = async (updatedPack: QuestionPack, successMessage: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/packs/${updatedPack.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPack),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan perubahan.');
      sound.play('correct');
      await onRefreshPacks();
      showNotice('ok', successMessage);
      return true;
    } catch (err: any) {
      sound.play('wrong');
      showNotice('err', err.message || 'Gagal menyimpan perubahan.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPack) return;
    const ok = await savePackUpdate(
      {
        ...selectedPack,
        title: metaForm.title.trim(),
        subject: metaForm.subject.trim() || 'Umum',
        description: metaForm.description.trim(),
      },
      'Informasi paket soal diperbarui.'
    );
    if (ok) setEditingMeta(false);
  };

  const handleDeletePack = async () => {
    if (!selectedPack) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/packs/${selectedPack.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus paket.');
      sound.play('click');
      setConfirmDeletePack(false);
      await onRefreshPacks();
      const remaining = packs.filter((p) => p.id !== selectedPack.id);
      setSelectedPackId(remaining[0]?.id ?? '');
      showNotice('ok', `Paket "${selectedPack.title}" telah dihapus.`);
    } catch (err: any) {
      sound.play('wrong');
      showNotice('err', err.message || 'Gagal menghapus paket.');
    } finally {
      setBusy(false);
    }
  };

  const openAddQuestion = () => {
    sound.play('click');
    setEditingQuestionIndex(null);
    setQuestionDraft(emptyQuestionDraft());
    setQuestionModalOpen(true);
  };

  const openEditQuestion = (q: Question, idx: number) => {
    sound.play('click');
    setEditingQuestionIndex(idx);
    setQuestionDraft({
      id: q.id,
      text: q.text,
      options: [...q.options] as [string, string, string, string],
      correctIndex: q.correctIndex,
      difficulty: q.difficulty,
    });
    setQuestionModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPack) return;
    if (!questionDraft.text.trim()) {
      showNotice('err', 'Teks pertanyaan tidak boleh kosong.');
      return;
    }
    if (questionDraft.options.some((o) => !o.trim())) {
      showNotice('err', 'Semua pilihan A, B, C, dan D wajib diisi.');
      return;
    }

    const nextQuestions = [...selectedPack.questions];
    const cleanQ: Question = {
      id: questionDraft.id || `q-${Date.now().toString(36)}`,
      text: questionDraft.text.trim(),
      options: questionDraft.options.map((o) => o.trim()) as [string, string, string, string],
      correctIndex: questionDraft.correctIndex,
      difficulty: questionDraft.difficulty,
    };

    if (editingQuestionIndex !== null) {
      nextQuestions[editingQuestionIndex] = cleanQ;
    } else {
      nextQuestions.push(cleanQ);
    }

    const ok = await savePackUpdate(
      { ...selectedPack, questions: nextQuestions },
      editingQuestionIndex !== null ? 'Soal berhasil diperbarui.' : 'Soal baru berhasil ditambahkan.'
    );
    if (ok) {
      setQuestionModalOpen(false);
    }
  };

  const handleDeleteQuestion = async (idx: number) => {
    if (!selectedPack) return;
    const nextQuestions = selectedPack.questions.filter((_, i) => i !== idx);
    await savePackUpdate({ ...selectedPack, questions: nextQuestions }, 'Soal telah dihapus.');
  };

  const handleExportPackJson = () => {
    if (!selectedPack) return;
    sound.play('click');
    const json = JSON.stringify(selectedPack, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = selectedPack.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.href = url;
    a.download = `paket-soal-${slug || 'eduplay-rth'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotice('ok', `Paket "${selectedPack.title}" berhasil diexport ke JSON.`);
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch('/api/packs/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Format JSON tidak valid.');
      sound.play('correct');
      await onRefreshPacks();
      if (data.packs?.[0]?.id) {
        setSelectedPackId(data.packs[0].id);
      }
      showNotice('ok', `Berhasil mengimpor ${data.packs.length} paket soal dari file JSON.`);
    } catch (err: any) {
      sound.play('wrong');
      showNotice('err', err.message || 'Gagal membaca file JSON paket soal.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {feedback && (
        <div
          role="status"
          className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Tutup notifikasi"
            className="rounded-lg p-1 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Sidebar: Daftar Paket Soal */}
        <aside className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Paket Soal</h2>
              <p className="text-xs text-slate-500 tabular-nums">
                {packs.length} paket tersimpan offline
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJsonFile}
                className="hidden"
                aria-label="Pilih file JSON paket soal untuk diimpor"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="btn-tactile inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Import</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.play('click');
                  setIsCreatingPack((v) => !v);
                }}
                className="btn-tactile inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Baru</span>
              </button>
            </div>
          </div>

          {isCreatingPack && (
            <form
              onSubmit={handleCreatePack}
              className="flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
            >
              <p className="text-xs font-bold text-emerald-950">Buat Paket Soal Baru</p>
              <div>
                <label htmlFor="new-pack-title" className="mb-1 block text-xs font-semibold text-slate-700">
                  Judul Paket
                </label>
                <input
                  id="new-pack-title"
                  type="text"
                  required
                  value={newPackForm.title}
                  onChange={(e) => setNewPackForm({ ...newPackForm, title: e.target.value })}
                  placeholder="Contoh: Matematika Pecahan Kelas 5"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-pack-subject" className="mb-1 block text-xs font-semibold text-slate-700">
                  Mata Pelajaran
                </label>
                <input
                  id="new-pack-subject"
                  type="text"
                  value={newPackForm.subject}
                  onChange={(e) => setNewPackForm({ ...newPackForm, subject: e.target.value })}
                  placeholder="Matematika, IPA, IPS..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="new-pack-desc" className="mb-1 block text-xs font-semibold text-slate-700">
                  Deskripsi Singkat
                </label>
                <input
                  id="new-pack-desc"
                  type="text"
                  value={newPackForm.description}
                  onChange={(e) => setNewPackForm({ ...newPackForm, description: e.target.value })}
                  placeholder="Catatan opsional untuk guru"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                >
                  Simpan Paket
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingPack(false)}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
              </div>
            </form>
          )}

          <div className="flex flex-col gap-2">
            {packs.map((pack) => {
              const active = selectedPack?.id === pack.id;
              return (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => {
                    sound.play('click');
                    setSelectedPackId(pack.id);
                    setEditingMeta(false);
                    setConfirmDeletePack(false);
                  }}
                  className={`flex w-full flex-col rounded-2xl border p-4 text-left transition-colors ${
                    active
                      ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-800 hover:bg-emerald-50/30'
                  }`}
                >
                  <span className="font-display text-sm font-bold leading-snug text-slate-900">
                    {pack.title}
                  </span>
                  <span className="mt-1 text-xs text-slate-500 tabular-nums">
                    {pack.subject} · {pack.questions.length} soal
                  </span>
                </button>
              );
            })}

            {packs.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Belum ada paket soal. Klik &ldquo;Baru&rdquo; atau &ldquo;Import&rdquo; untuk memulai.
              </div>
            )}
          </div>
        </aside>

        {/* Right Detail Panel: Questions inside Selected Pack */}
        <section className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-8">
          {selectedPack ? (
            <>
              {/* Pack Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                {editingMeta ? (
                  <form onSubmit={handleSaveMeta} className="flex w-full flex-col gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        required
                        aria-label="Judul Paket Soal"
                        value={metaForm.title}
                        onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                      />
                      <input
                        type="text"
                        aria-label="Mata Pelajaran"
                        value={metaForm.subject}
                        onChange={(e) => setMetaForm({ ...metaForm, subject: e.target.value })}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      />
                    </div>
                    <input
                      type="text"
                      aria-label="Deskripsi Paket"
                      value={metaForm.description}
                      onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })}
                      placeholder="Deskripsi singkat paket soal"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <Save className="h-3.5 w-3.5" />
                        <span>Simpan Info</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMeta(false)}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700"
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <BookOpen className="h-4 w-4 text-emerald-600" />
                        <span>{selectedPack.subject}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{selectedPack.questions.length} Soal</span>
                      </div>
                      <h3 className="mt-1 font-display text-2xl font-extrabold text-emerald-950">
                        {selectedPack.title}
                      </h3>
                      {selectedPack.description && (
                        <p className="mt-1 text-sm text-slate-600">{selectedPack.description}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMetaForm({
                            title: selectedPack.title,
                            subject: selectedPack.subject,
                            description: selectedPack.description,
                          });
                          setEditingMeta(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit Info</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleExportPackJson}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export JSON</span>
                      </button>
                      {confirmDeletePack ? (
                        <div className="flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-1.5">
                          <span className="text-xs font-bold text-rose-800">Yakin hapus?</span>
                          <button
                            type="button"
                            onClick={handleDeletePack}
                            className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-rose-700"
                          >
                            Ya, Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePack(false)}
                            className="rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-700"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeletePack(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Hapus Paket</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Add Question Trigger or Inline Editor */}
              <div className="flex items-center justify-between gap-4">
                <h4 className="font-display text-base font-bold text-emerald-950">
                  Daftar Pertanyaan
                </h4>
                <button
                  type="button"
                  onClick={openAddQuestion}
                  className="btn-tactile inline-flex items-center gap-2 rounded-xl border-b-4 border-emerald-900 bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4 text-amber-300" />
                  <span>Tambah Soal</span>
                </button>
              </div>

              {/* Question Editor Form */}
              {questionModalOpen && (
                <form
                  onSubmit={handleSaveQuestion}
                  className="flex flex-col gap-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-5"
                >
                  <div className="flex items-center justify-between">
                    <h5 className="font-display text-base font-extrabold text-slate-900">
                      {editingQuestionIndex !== null
                        ? `Edit Soal #${editingQuestionIndex + 1}`
                        : 'Tambah Soal Pilihan Ganda'}
                    </h5>
                    <button
                      type="button"
                      onClick={() => setQuestionModalOpen(false)}
                      aria-label="Tutup form soal"
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/70"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div>
                    <label htmlFor="q-text" className="mb-1.5 block text-xs font-bold text-slate-700">
                      Pertanyaan
                    </label>
                    <textarea
                      id="q-text"
                      rows={2}
                      required
                      value={questionDraft.text}
                      onChange={(e) => setQuestionDraft({ ...questionDraft, text: e.target.value })}
                      placeholder="Tulis pertanyaan yang jelas dan singkat..."
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-bold text-slate-700">
                      Pilihan Jawaban (Klik huruf A/B/C/D untuk menentukan Kunci Jawaban)
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {OPTION_LETTERS.map((letter, idx) => {
                        const isKey = questionDraft.correctIndex === idx;
                        return (
                          <div key={letter} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setQuestionDraft({
                                  ...questionDraft,
                                  correctIndex: idx as 0 | 1 | 2 | 3,
                                })
                              }
                              aria-label={`Jadikan pilihan ${letter} sebagai kunci jawaban`}
                              aria-pressed={isKey}
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black transition-colors ${
                                isKey
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {isKey ? <Check className="h-5 w-5" /> : letter}
                            </button>
                            <input
                              type="text"
                              required
                              aria-label={`Pilihan ${letter}`}
                              value={questionDraft.options[idx]}
                              onChange={(e) => {
                                const nextOpts = [...questionDraft.options] as [
                                  string,
                                  string,
                                  string,
                                  string,
                                ];
                                nextOpts[idx] = e.target.value;
                                setQuestionDraft({ ...questionDraft, options: nextOpts });
                              }}
                              placeholder={`Jawaban ${letter}`}
                              className={`w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none ${
                                isKey
                                  ? 'border-emerald-500 ring-2 ring-emerald-100'
                                  : 'border-slate-300 focus:border-blue-500'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">Kesulitan:</span>
                      <div className="inline-flex rounded-xl bg-slate-200/80 p-1">
                        {DIFFICULTIES.map((diff) => (
                          <button
                            key={diff}
                            type="button"
                            onClick={() => setQuestionDraft({ ...questionDraft, difficulty: diff })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                              questionDraft.difficulty === diff
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {diff}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuestionModalOpen(false)}
                        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                      >
                        <Save className="h-4 w-4" />
                        <span>Simpan Soal</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Question List */}
              <div className="flex flex-col divide-y divide-slate-100">
                {selectedPack.questions.map((q, idx) => (
                  <article key={q.id} className="flex flex-col gap-3 py-4 first:pt-1">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-500">
                          Soal {idx + 1} · {q.difficulty} · Kunci:{' '}
                          <strong className="text-emerald-700">
                            {OPTION_LETTERS[q.correctIndex]}
                          </strong>
                        </p>
                        <h5 className="mt-1 text-base font-bold text-slate-900">{q.text}</h5>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditQuestion(q, idx)}
                          aria-label={`Edit soal ${idx + 1}`}
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(idx)}
                          aria-label={`Hapus soal ${idx + 1}`}
                          className="rounded-lg border border-slate-200 p-2 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, optIdx) => {
                        const isCorrect = q.correctIndex === optIdx;
                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                              isCorrect
                                ? 'bg-emerald-50 font-bold text-emerald-900'
                                : 'bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span className="font-mono-num text-xs font-extrabold">
                              {OPTION_LETTERS[optIdx]}.
                            </span>
                            <span className="truncate">{opt}</span>
                            {isCorrect && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}

                {selectedPack.questions.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                    <p className="text-sm font-semibold text-slate-600">
                      Paket ini belum memiliki pertanyaan. Klik tombol &ldquo;Tambah Soal&rdquo; di atas.
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[300px] items-center justify-center text-sm text-slate-500">
              Pilih atau buat paket soal terlebih dahulu.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
