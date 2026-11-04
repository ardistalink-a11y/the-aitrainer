// Lowongan dari Ashby lewat API publik resminya (Job Postings API).
import { savePlatform, UA } from './common.mjs';

const BOARDS = [{ board: 'lilt-production', platform: 'Lilt' }];

function mapJob(j) {
  if (j.isListed === false) return null;
  const parts = [j.location, ...(j.secondaryLocations || []).map((s) => s?.location ?? s)]
    .filter((x) => typeof x === 'string' && x.trim());
  const country = j.address?.postalAddress?.addressCountry;
  if (country && !parts.some((p) => p.toLowerCase().includes(String(country).toLowerCase()))) {
    parts.push(country);
  }
  const loc = parts.join(' / ') || (j.isRemote ? 'Remote' : null);
  const comp = j.compensation?.compensationTierSummary || j.compensation?.scrapeableCompensationSalarySummary || null;
  return {
    project_name: (j.title || '').trim(),
    task_type: j.team || j.department || null,
    country: loc,
    raw_location: loc,
    work_mode: j.workplaceType || (j.isRemote ? 'Remote' : null),
    pay: comp,
    source_url: j.jobUrl,
  };
}

const failed = [];
for (const { board, platform } of BOARDS) {
  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
      { headers: { 'User-Agent': UA } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const items = jobs.map(mapJob).filter((i) => i && i.project_name && i.source_url);
    if (items[0]) console.log(`${platform} contoh:`, JSON.stringify(items[0]).slice(0, 500));
    await savePlatform(platform, items);
  } catch (e) {
    console.error(`${platform} GAGAL:`, e.message);
    failed.push(platform);
  }
}
if (failed.length) throw new Error('Gagal untuk: ' + failed.join(', '));
