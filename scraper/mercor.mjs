// Mercor: halaman daftar proyek sudah berisi link di HTML.
import * as cheerio from 'cheerio';
import { getHtml, textParts, clean, sleep, savePlatform } from './common.mjs';

const BASE = 'https://work.mercor.com';
const MAX_PAGES = 30;
const PAY_RE = /\$[\d,.]+(?:\s*-\s*\$?[\d,.]+)?\s*\/\s*[A-Za-z]+/;

function readPage(html) {
  const $ = cheerio.load(html);
  const out = [];
  $('a[href*="/jobs/list_"]').each((_, a) => {
    const u = new URL($(a).attr('href'), BASE);
    u.search = '';
    const parts = textParts(a);
    const text = clean(parts.join(' '));
    const title = clean(text.split(/\s+Apply\b/)[0]) || parts[0];
    if (!title) return;
    out.push({ title, pay: text.match(PAY_RE)?.[0] ?? null, url: u.href });
  });
  return out;
}

const seen = new Map();
for (let n = 1; n <= MAX_PAGES; n++) {
  const html = await getHtml(n === 1 ? `${BASE}/explore` : `${BASE}/explore?page=${n}`);
  const list = readPage(html);
  let added = 0;
  for (const j of list) {
    if (!seen.has(j.url)) {
      seen.set(j.url, j);
      added++;
    }
  }
  console.log(`Mercor halaman ${n}: ${list.length} proyek, ${added} baru`);
  if (added === 0) break; // halaman berikutnya tidak memberi data baru
  await sleep(1000);
}

if (seen.size === 0) throw new Error('Mercor: tidak ada proyek terbaca (halaman berubah atau diblokir)');

// Mercor hanya menulis "Remote" tanpa negara. Dianggap worldwide,
// kecuali judulnya menyebut AS secara eksplisit.
const US_RE = /\b(US|U\.S\.|USA|United States)\b/;
const items = [...seen.values()].map((j) => ({
  project_name: j.title,
  pay: j.pay,
  country: 'Remote',
  raw_location: 'Remote',
  work_mode: 'Remote',
  indonesia_status: US_RE.test(j.title) ? 'excluded' : 'worldwide',
  source_url: j.url,
}));
console.log('Mercor contoh:', JSON.stringify(items[0]));
await savePlatform('Mercor', items);
