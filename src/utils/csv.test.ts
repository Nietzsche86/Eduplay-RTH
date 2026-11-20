import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultsCsv, calculateAccuracy, escapeCsvCell } from './csv';

test('calculateAccuracy computes rounded percentages and handles zero total', () => {
  assert.equal(calculateAccuracy(0, 0), 0);
  assert.equal(calculateAccuracy(8, 2), 80);
  assert.equal(calculateAccuracy(2, 1), 67);
  assert.equal(calculateAccuracy(10, 0), 100);
});

test('escapeCsvCell properly escapes commas and quotes', () => {
  assert.equal(escapeCsvCell('Budi'), 'Budi');
  assert.equal(escapeCsvCell('Budi, S.Pd'), '"Budi, S.Pd"');
  assert.equal(escapeCsvCell('Siti "Juara"'), '"Siti ""Juara"""');
});

test('buildResultsCsv outputs UTF-8 BOM, headers, and sorted rankings', () => {
  const csv = buildResultsCsv([
    { playerId: 'p2', name: 'Ani', avatar: '🐱', score: 1200, correctCount: 2, wrongCount: 1 },
    { playerId: 'p1', name: 'Budi, Jr', avatar: '🦊', score: 2500, correctCount: 3, wrongCount: 0 },
  ]);
  assert.ok(csv.startsWith('\uFEFF'), 'CSV should start with UTF-8 BOM for Excel compatibility');
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], 'Peringkat,Nama Siswa,Total Skor,Jumlah Benar,Jumlah Salah,Akurasi (%)');
  assert.equal(lines[1], '1,"Budi, Jr",2500,3,0,100%');
  assert.equal(lines[2], '2,Ani,1200,2,1,67%');
});
