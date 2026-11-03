import { chromium } from 'playwright';
import { savePlatform } from './common.mjs';

const PAGE = 'https://app.outlier.ai/opportunities';
const PLATFORM = 'Outlier';

const text = (v) => {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const a = v.map(text).filter(Boolean);
    return a.length ? a.join(', ') : null;
  }
  if (typeof v === 'object') return text(v.name ?? v.title ?? v.label);
  const s = String(v).trim();
  return s || null;
};
const pick = (o, keys) => {
  for (const k of keys) {
    const t = text(o[k]);
    if (t) return t;
  }
  return null;
};
function findList(x, depth = 0) {
  if (Array.isArray(x)) return x.length && typeof x[0] === 'object' ? x : null;
  if (x && typeof x === 'object' && depth < 3) {
    for (const v of Object.values(x)) {
      const l = findList(v, depth + 1);
      if (l) return l;
    }
  }
  return null;
}

const browser = await chromium.launch();
const page = await browser.newPage();
let list = null;
const seen = [];

page.on('response', async (res) => {
  const type = res.request().resourceType();
  if (type === 'fetch' || type === 'xhr') seen.push(res.url());
  if (!res.url().includes('/job-board/jobs')) return;
  try {
    const l = findList(await res.json());
    if (l && (!list || l.length > list.length)) list = l;
  } catch {}
});

await page.goto(PAGE, { waitUntil: 'networkidle', timeout: 60000 });
for (let i = 0; i < 20 && !list; i++) await page.waitForTimeout(1000);
await browser.close();

if (!list) {
  console.log('Request fetch/xhr yang terlihat:', seen.slice(0, 30));
  throw new Error('Data proyek tidak tertangkap (halaman berubah atau diblokir)');
}

console.log('Contoh item:', JSON.stringify(list[0]).slice(0, 800));

const items = [];
for (const j of list) {
  const name = pick(j, ['title', 'name', 'jobName', 'job_title']);
  if (!name) continue;
  const id = pick(j, ['id', '_id', 'slug', 'jobId', 'uuid']);
  items.push({
    project_name: name,
    task_type: pick(j, ['category', 'type', 'domain', 'jobType']),
    language: pick(j, ['language', 'languages']),
    country: pick(j, ['countries', 'locations', 'location', 'country']),
    pay: pick(j, ['pay', 'payRate', 'payRange', 'compensation', 'rate']),
    source_url: `${PAGE}#${id ?? encodeURIComponent(name)}`,
  });
}

if (items.length === 0) {
  throw new Error('Nama proyek tidak dikenali. Kunci item: ' + Object.keys(list[0]).join(', '));
}

await savePlatform(PLATFORM, items);
