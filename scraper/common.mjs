import countries from 'i18n-iso-countries';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi');

export const db = createClient(url, key);

const COUNTRY_NAMES = Object.entries(countries.getNames('en'));
const COUNTRY_ALIASES = [
  [/\bUSA\b/i, 'US'],
  [/U\.S\./i, 'US'],
  [/\bUnited States\b/i, 'US'],
  [/\bUK\b/i, 'GB'],
  [/\bUnited Kingdom\b/i, 'GB'],
  [/\bUAE\b/i, 'AE'],
];

const normalizeCountryText = (value) =>
  value.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function extractCountryCodes(raw) {
  const text = String(raw || '');
  const normalized = ' ' + normalizeCountryText(text) + ' ';
  const found = new Set();
  for (const [pattern, code] of COUNTRY_ALIASES) {
    if (pattern.test(text)) found.add(code);
  }
  for (const [code, name] of COUNTRY_NAMES) {
    if (normalized.includes(' ' + normalizeCountryText(name) + ' ')) found.add(code);
  }
  return [...found];
}

export const UA = 'Mozilla/5.0 (compatible; TheAITrainerBot/1.0; +https://theaitrainer.vercel.app)';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

export async function getHtml(pageUrl) {
  const res = await fetch(pageUrl, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' untuk ' + pageUrl);
  return res.text();
}

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

export function classifyIndonesia(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return 'unknown';
  if (/\bindonesia\b/.test(t)) return 'indonesia';
  if (/(worldwide|global|anywhere|all countries)/.test(t)) return 'worldwide';
  if (/\+\s*\d+\s*more/.test(t)) return 'unknown';
  if (t.split(/[\/;|]/).some((s) => s.trim() === 'remote')) return 'unknown';
  if (t === 'remote') return 'unknown';
  return 'excluded';
}

export async function savePlatform(platform, items) {
  if (items.length === 0) {
    throw new Error(platform + ': 0 proyek terbaca, data lama tidak diubah');
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

  console.log(platform + ': ' + rows.length + ' proyek disimpan, ' + closed.data.length + ' ditandai closed');
}
