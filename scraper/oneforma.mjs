// OneForma: halaman /projects/ dirender di server, ada tombol Next.
import * as cheerio from 'cheerio';
import { getHtml, textParts, clean, sleep, savePlatform } from './common.mjs';

const START = 'https://www.oneforma.com/projects/';
const MAX_PAGES = 20;

const COUNTRIES = [
  'Australia', 'Austria', 'Azerbaijan', 'Belgium', 'Brazil', 'Bulgaria', 'Canada', 'Chile', 'China',
  'Colombia', 'Croatia', 'Czech Republic', 'Denmark', 'Egypt', 'Finland', 'France', 'Germany', 'Greece',
  'Hong Kong', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Lebanon',
  'Malaysia', 'Mexico', 'Morocco', 'Netherlands', 'New Zealand', 'Norway', 'Palestine', 'Poland',
  'Portugal', 'Remote', 'Romania', 'Russia', 'Saudi Arabia', 'Serbia', 'Singapore', 'Slovakia',
  'Slovenia', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland', 'Syria', 'Taiwan',
  'Thailand', 'Turkey', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uzbekistan', 'Vietnam',
];
const ALT = [...COUNTRIES]
  .sort((a, b) => b.length - a.length)
  .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const COUNTRY_RE = new RegExp(`(?<![A-Za-z])(${ALT})(?![A-Za-z])`, 'g');

function parsePage(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('h3 a[href*="/projects/"]').each((_, a) => {
    const href = $(a).attr('href') || '';
    if (/\/projects\/page\//.test(href) || /\/projects\/?$/.test(href)) return;
    const title = clean($(a).text());
    if (!title) return;

    // naik dari judul sampai pembungkus kartu (yang hanya berisi satu judul)
    let card = $(a).closest('h3');
    for (let i = 0; i < 5; i++) {
      const parent = card.parent();
      if (!parent.length || parent.find('h3').length !== 1) break;
      if (/\bFilters\b/.test(clean(parent.text()).slice(0, 200))) break;
      card = parent;
    }

    const parts = textParts(card.get(0));
    let ti = parts.findIndex((p) => p === title);
    if (ti < 0) ti = parts.findIndex((p) => p.includes(title.slice(0, 20)));
    if (ti < 0) ti = 0;

    const labels = [...new Set(parts.slice(0, ti))];
    const after = parts.slice(ti + 2); // lewati judul dan deskripsi
    const ai = after.lastIndexOf('Apply');
    const pay = ai > 0 ? after[ai - 1] : null;
    const found = [...new Set([...after.join(' ').matchAll(COUNTRY_RE)].map((m) => m[1]))];
    const loc = found.join(', ') || null;

    items.push({
      project_name: title,
      task_type: labels.join(' / ') || null,
      pay,
      country: loc,
      raw_location: loc,
      source_url: new URL(href, START).href,
    });
  });

  let next = null;
  $('a').each((_, el) => {
    if (/next/i.test(clean($(el).text()))) next = new URL($(el).attr('href'), START).href;
  });
  return { items, next };
}

const all = new Map();
let url = START;
for (let n = 1; url && n <= MAX_PAGES; n++) {
  const { items, next } = parsePage(await getHtml(url));
  items.forEach((i) => all.set(i.source_url, i));
  console.log(`OneForma halaman ${n}: ${items.length} proyek`);
  url = next && next !== url ? next : null;
  if (url) await sleep(1000);
}

if (all.size === 0) throw new Error('OneForma: tidak ada proyek terbaca (halaman berubah atau diblokir)');
const list = [...all.values()];
console.log('OneForma contoh:', JSON.stringify(list[0]).slice(0, 600));
await savePlatform('OneForma', list);
