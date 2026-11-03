// Mengambil lowongan dari Lever lewat API publik resminya (Postings API).
import { savePlatform } from './common.mjs';

const SITES = [
  { site: 'weloglobal', platform: 'Welo' },
  { site: 'appen', platform: 'Appen' },
  { site: 'rws', platform: 'RWS' },
  { site: 'tsmg', platform: 'TSMG' },
];

function salary(r) {
  if (!r || (!r.min && !r.max)) return null;
  const nums = [r.min, r.max].filter(Boolean).map((n) => n.toLocaleString('en-US')).join(' - ');
  const per = r.interval ? ' / ' + r.interval.replace(/^per-/, '').replace(/-(salary|wage)$/, '') : '';
  return `${r.currency || ''} ${nums}${per}`.trim();
}

function mapPosting(p) {
  const c = p.categories || {};
  const locs =
    Array.isArray(c.allLocations) && c.allLocations.length
      ? c.allLocations
      : c.location
        ? [c.location]
        : [];
  return {
    project_name: (p.text || '').trim(),
    task_type: c.team || c.department || null,
    country: locs.join(', ') || null,
    raw_location: locs.join(' / ') || null,
    work_mode: p.workplaceType || null,
    pay: salary(p.salaryRange),
    source_url: p.hostedUrl,
  };
}

const failed = [];

for (const { site, platform } of SITES) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${site}?mode=json`, {
      headers: { 'User-Agent': 'digestai.job job-board aggregator' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    if (!Array.isArray(list)) throw new Error('Format respons tidak dikenali');
    const items = list.map(mapPosting).filter((i) => i.project_name && i.source_url);
    if (list[0]) console.log(`${platform} contoh:`, JSON.stringify(items[0]).slice(0, 500));
    await savePlatform(platform, items);
  } catch (e) {
    console.error(`${platform} GAGAL:`, e.message);
    failed.push(platform);
  }
}

if (failed.length) throw new Error('Gagal untuk: ' + failed.join(', '));
