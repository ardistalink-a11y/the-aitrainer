import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi');

export const db = createClient(url, key);

// Menebak apakah proyek terbuka untuk Indonesia dari teks lokasi.
// indonesia | worldwide | excluded | unknown
export function classifyIndonesia(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return 'unknown';
  if (/\bindonesia\b/.test(t)) return 'indonesia';
  if (/(worldwide|global|anywhere|all countries)/.test(t)) return 'worldwide';
  if (/\+\s*\d+\s*more/.test(t)) return 'unknown'; // daftar terpotong
  if (t === 'remote') return 'unknown';
  return 'excluded';
}

// Simpan hasil satu platform: tambah/update yang ada, tutup yang sudah hilang.
export async function savePlatform(platform, items) {
  if (items.length === 0) {
    throw new Error(`${platform}: 0 proyek terbaca, data lama tidak diubah`);
  }
  const runStart = new Date().toISOString();
  const unique = new Map(items.map((i) => [i.source_url, i]));
  const rows = [...unique.values()].map((i) => {
    const raw = i.raw_location ?? i.country ?? null;
    return {
      ...i,
      raw_location: raw,
      indonesia_status: i.indonesia_status ?? classifyIndonesia(raw),
      platform,
      status: 'open',
      last_seen: runStart,
    };
  });

  const up = await db.from('projects').upsert(rows, { onConflict: 'source_url' });
  if (up.error) throw up.error;

  const closed = await db
    .from('projects')
    .update({ status: 'closed' })
    .eq('platform', platform)
    .eq('status', 'open')
    .lt('last_seen', runStart)
    .select('id');
  if (closed.error) throw closed.error;

  console.log(`${platform}: ${rows.length} proyek disimpan, ${closed.data.length} ditandai closed`);
}
