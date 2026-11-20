import type { GameResultEntry } from '../types/platform';

export function calculateAccuracy(correctCount: number, wrongCount: number): number {
  const total = correctCount + wrongCount;
  if (total <= 0) return 0;
  return Math.round((correctCount / total) * 100);
}

export function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildResultsCsv(results: GameResultEntry[]): string {
  const sorted = [...results].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return a.wrongCount - b.wrongCount;
  });

  const headers = [
    'Peringkat',
    'Nama Siswa',
    'Total Skor',
    'Jumlah Benar',
    'Jumlah Salah',
    'Akurasi (%)',
  ];

  const rows = sorted.map((entry, idx) => {
    const accuracy = calculateAccuracy(entry.correctCount, entry.wrongCount);
    return [
      idx + 1,
      entry.name,
      entry.score,
      entry.correctCount,
      entry.wrongCount,
      `${accuracy}%`,
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  // Prepend UTF-8 BOM so Microsoft Excel reads Indonesian characters cleanly
  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

export function downloadResultsCsv(results: GameResultEntry[], filenamePrefix = 'eduplay-rth-hasil'): void {
  const csv = buildResultsCsv(results);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.setAttribute('download', `${filenamePrefix}-${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
