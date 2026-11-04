import { getNames } from 'i18n-iso-countries';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi');

export const db = createClient(url, key);


const COUNTRY_NAMES = Object.entries(getNames('en')).sort((a, b) => b[1].length - a[1].length);
const COUNTRY_ALIASES = { USA: 'US', 'U.S.': 'US', 'UNITED STATES': 'US', UK: 'GB', 'U.K.': 'GB', UAE: 'AE' };

export function extractCountryCodes(raw) {
  const text = String(raw || '');
  const upper = text.toUpperCase();
  const found = new Set();
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
    if (new RegExp('(^|[^A-Z])' + alias.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\export const UA =') + '([^A-Z]|$)', 'i').test(text)) found.add(code);
  }
  for (const [code, name] of COUNTRY_NAMES) {
    const escaped = name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\export const UA =');
    if (new RegExp('(^|[^\\p{L}])' + escaped + '([^\\p{L}]|$)', 'iu').test(text)) found.add(code);
  }
  return [...found];
}

export const UA = 'Mozilla/5.0 (compatible; TheAITrainerBot/1.0; +https://theaitrainer.vercel.app)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

// Ambil HTML satu halaman
export async function getHtml(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${pageUrl}`);
  return res.text();
}

// Kumpulkan potongan teks dari sebuah elemen, urut sesuai halaman
export function textParts(node, out = []) {
  if (!node) return out;
  if (node.type === 'text') {
    const t = clean(node.data);
    if (t) out.push(t);
  } else if (node.type !== 'script' && node.type !== 'style' && node.children) {
    for (const c of node.children) textParts(c, out);
  }
  return out;
}

// Menebak apakah proyek terbuka untuk Indonesia dari teks lokasi.
// indonesia | worldwide | excluded | unknown
export function classifyIndonesia(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return 'unknown';
  if (/\bindonesia\b/.test(t)) return 'indonesia';
  if (/(worldwide|global|anywhere|all countries)/.test(t)) return 'worldwide';
  if (/\+\s*\d+\s*more/.test(t)) return 'unknown'; // daftar terpotong
  if (t.split(/[\/;|]/).some((s) => s.trim() === 'remote')) return 'unknown';
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
      country_codes: i.country_codes ?? extractCountryCodes(raw),
      platform,
      status: 'open',
      last_seen: runStart,
    };
  });

  for (let i = 0; i < rows.length; i += 200) {
    const up = await db
      .from('projects')
      .upsert(rows.slice(i, i + 200), { onConflict: 'source_url' });
    if (up.error) throw up.error;
  }

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
