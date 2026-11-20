import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createQuestionStore, sanitizePackInput } from './storage.js';

test('questionStore seeds default 10-question pack and supports full CRUD + JSON import', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduplay-test-'));
  const filePath = path.join(tmpDir, 'questions.json');

  try {
    const store = createQuestionStore(filePath);
    const initial = store.readPacks();
    assert.equal(initial.length, 1);
    assert.equal(initial[0].questions.length, 10);

    const created = store.createPack({
      title: 'IPA Kelas 5',
      subject: 'IPA',
      description: 'Latihan ekosistem',
      questions: [
        {
          text: 'Hewan pemakan tumbuhan disebut?',
          options: ['Karnivora', 'Herbivora', 'Omnivora', 'Insektivora'],
          correctIndex: 1,
          difficulty: 'Mudah',
        },
      ],
    });
    assert.equal(store.readPacks().length, 2);
    assert.equal(created.questions[0].correctIndex, 1);

    const updated = store.updatePack(created.id, {
      ...created,
      title: 'IPA Kelas 5 Revisi',
    });
    assert.equal(updated.title, 'IPA Kelas 5 Revisi');

    const imported = store.importPack({
      title: 'Paket Impor Matematika',
      subject: 'Matematika',
      questions: [
        {
          text: '7 × 7 = ?',
          options: ['42', '48', '49', '56'],
          correctIndex: 2,
          difficulty: 'Mudah',
        },
      ],
    });
    assert.equal(imported.length, 1);
    assert.equal(store.readPacks().length, 3);

    store.deletePack(created.id);
    assert.equal(store.readPacks().length, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('sanitizePackInput rejects empty titles or invalid options', () => {
  assert.throws(() => sanitizePackInput({ title: '', questions: [] }), /Judul paket soal/);
  assert.throws(
    () =>
      sanitizePackInput({
        title: 'Uji',
        questions: [{ text: 'Q1', options: ['A', 'B'], correctIndex: 0, difficulty: 'Mudah' }],
      }),
    /4 pilihan/
  );
});
