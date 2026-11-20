import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_FILE_PATH = path.join(DEFAULT_DATA_DIR, 'questions.json');

const VALID_DIFFICULTIES = new Set(['Mudah', 'Sedang', 'Sulit']);

export const DEFAULT_SEED_PACKS = [
  {
    id: 'pack-default-umum-matematika',
    title: 'Pengetahuan Umum & Matematika Dasar',
    subject: 'Campuran',
    description:
      'Paket soal bawaan berisi 10 soal pilihan ganda seputar sains, geografi Indonesia, dan berhitung cepat.',
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-01-10T08:00:00.000Z',
    questions: [
      {
        id: 'q-default-1',
        text: 'Berapakah hasil dari 12 × 8 + 14?',
        options: ['98', '110', '108', '112'],
        correctIndex: 1,
        difficulty: 'Mudah',
      },
      {
        id: 'q-default-2',
        text: 'Planet manakah yang dikenal sebagai Planet Merah di Tata Surya kita?',
        options: ['Venus', 'Jupiter', 'Mars', 'Saturnus'],
        correctIndex: 2,
        difficulty: 'Mudah',
      },
      {
        id: 'q-default-3',
        text: 'Gunung tertinggi di Indonesia yang terletak di Papua adalah...',
        options: ['Gunung Semeru', 'Gunung Rinjani', 'Gunung Kerinci', 'Puncak Jaya (Carstensz)'],
        correctIndex: 3,
        difficulty: 'Mudah',
      },
      {
        id: 'q-default-4',
        text: 'Jika sebuah persegi panjang memiliki panjang 15 cm dan lebar 6 cm, berapakah kelilingnya?',
        options: ['42 cm', '90 cm', '21 cm', '36 cm'],
        correctIndex: 0,
        difficulty: 'Sedang',
      },
      {
        id: 'q-default-5',
        text: 'Proses pembuatan makanan oleh tumbuhan hijau dengan bantuan cahaya matahari disebut...',
        options: ['Respirasi', 'Fotosintesis', 'Metamorfosis', 'Evaporasi'],
        correctIndex: 1,
        difficulty: 'Mudah',
      },
      {
        id: 'q-default-6',
        text: 'Berapakah nilai dari √144 + 5²?',
        options: ['35', '37', '39', '41'],
        correctIndex: 1,
        difficulty: 'Sedang',
      },
      {
        id: 'q-default-7',
        text: 'Siapakah proklamator kemerdekaan Indonesia yang membacakan teks Proklamasi pada 17 Agustus 1945?',
        options: ['Ir. Soekarno', 'Mohammad Hatta', 'Jenderal Soedirman', 'Ki Hajar Dewantara'],
        correctIndex: 0,
        difficulty: 'Mudah',
      },
      {
        id: 'q-default-8',
        text: "Unsur kimia dengan lambang 'O' yang sangat dibutuhkan manusia untuk bernapas adalah...",
        options: ['Osmium', 'Oksigen', 'Ozon', 'Oganeson'],
        correctIndex: 1,
        difficulty: 'Mudah',
      },
      {
        id: 'q-default-9',
        text: 'Sebuah kereta melaju dengan kecepatan rata-rata 80 km/jam. Berapa jarak yang ditempuh dalam 2,5 jam?',
        options: ['160 km', '180 km', '200 km', '220 km'],
        correctIndex: 2,
        difficulty: 'Sedang',
      },
      {
        id: 'q-default-10',
        text: 'Jika 3x - 7 = 20, maka nilai dari 2x + 5 adalah...',
        options: ['19', '21', '23', '25'],
        correctIndex: 2,
        difficulty: 'Sulit',
      },
    ],
  },
];

export function sanitizeQuestion(raw, fallbackIndex = 0) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Soal #${fallbackIndex + 1} tidak valid.`);
  }
  const text = String(raw.text ?? '').trim();
  if (!text) {
    throw new Error(`Teks pertanyaan soal #${fallbackIndex + 1} tidak boleh kosong.`);
  }
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  if (rawOptions.length !== 4) {
    throw new Error(`Soal #${fallbackIndex + 1} wajib memiliki tepat 4 pilihan jawaban (A, B, C, D).`);
  }
  const options = rawOptions.map((opt, i) => {
    const val = String(opt ?? '').trim();
    if (!val) {
      throw new Error(`Pilihan ${['A', 'B', 'C', 'D'][i]} pada soal #${fallbackIndex + 1} tidak boleh kosong.`);
    }
    return val;
  });
  const correctIndex = Number(raw.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    throw new Error(`Kunci jawaban soal #${fallbackIndex + 1} harus antara 0 (A) sampai 3 (D).`);
  }
  const difficulty = VALID_DIFFICULTIES.has(raw.difficulty) ? raw.difficulty : 'Sedang';
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `q-${crypto.randomUUID().slice(0, 8)}`,
    text,
    options,
    correctIndex,
    difficulty,
  };
}

export function sanitizePackInput(raw, existingPack = null) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Data paket soal tidak valid.');
  }
  const title = String(raw.title ?? '').trim();
  if (!title) {
    throw new Error('Judul paket soal wajib diisi.');
  }
  const subject = String(raw.subject ?? 'Umum').trim() || 'Umum';
  const description = String(raw.description ?? '').trim();
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  const questions = rawQuestions.map((q, idx) => sanitizeQuestion(q, idx));
  const now = new Date().toISOString();

  return {
    id:
      existingPack?.id ||
      (typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `pack-${crypto.randomUUID().slice(0, 8)}`),
    title,
    subject,
    description,
    createdAt: existingPack?.createdAt || raw.createdAt || now,
    updatedAt: now,
    questions,
  };
}

export function createQuestionStore(filePath = DEFAULT_FILE_PATH) {
  function ensureFile() {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(DEFAULT_SEED_PACKS, null, 2), 'utf-8');
    }
  }

  function readPacks() {
    ensureFile();
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return DEFAULT_SEED_PACKS;
    } catch {
      return DEFAULT_SEED_PACKS;
    }
  }

  function writePacks(packs) {
    ensureFile();
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(packs, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return packs;
  }

  function getPackById(packId) {
    const packs = readPacks();
    return packs.find((p) => p.id === packId) || null;
  }

  function createPack(rawInput) {
    const packs = readPacks();
    const pack = sanitizePackInput({
      ...rawInput,
      id: `pack-${crypto.randomUUID().slice(0, 8)}`,
    });
    packs.push(pack);
    writePacks(packs);
    return pack;
  }

  function updatePack(packId, rawInput) {
    const packs = readPacks();
    const idx = packs.findIndex((p) => p.id === packId);
    if (idx === -1) {
      throw new Error('Paket soal tidak ditemukan.');
    }
    const updated = sanitizePackInput(rawInput, packs[idx]);
    packs[idx] = updated;
    writePacks(packs);
    return updated;
  }

  function deletePack(packId) {
    const packs = readPacks();
    const idx = packs.findIndex((p) => p.id === packId);
    if (idx === -1) {
      throw new Error('Paket soal tidak ditemukan.');
    }
    const [removed] = packs.splice(idx, 1);
    writePacks(packs);
    return removed;
  }

  function importPack(rawPayload) {
    // Supports either a single pack object or an array of packs
    const items = Array.isArray(rawPayload) ? rawPayload : [rawPayload];
    if (items.length === 0) {
      throw new Error('File JSON tidak berisi paket soal.');
    }
    const packs = readPacks();
    const imported = [];
    for (const item of items) {
      const sanitized = sanitizePackInput({
        ...item,
        id: `pack-${crypto.randomUUID().slice(0, 8)}`,
      });
      packs.push(sanitized);
      imported.push(sanitized);
    }
    writePacks(packs);
    return imported;
  }

  return {
    readPacks,
    writePacks,
    getPackById,
    createPack,
    updatePack,
    deletePack,
    importPack,
  };
}

export const questionStore = createQuestionStore();
