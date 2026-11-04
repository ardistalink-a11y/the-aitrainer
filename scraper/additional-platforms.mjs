import { chromium } from 'playwright';
import countries from 'i18n-iso-countries';
import { extractCountryCodes, savePlatform, sleep } from './common.mjs';

const MICRO1_RESTRICTED = new Set([
  'AF', 'BY', 'CN', 'CU', 'CD', 'HK', 'IR', 'IQ', 'LY', 'MO', 'MM', 'KP', 'RU',
  'SO', 'SS', 'SD', 'SY', 'VE', 'UA', 'YE', 'ET',
]);
const MICRO1_COUNTRIES = Object.keys(countries.getNames('en')).filter((code) => !MICRO1_RESTRICTED.has(code));

const SOURCES = [
  { platform: 'micro1', url: 'https://www.micro1.ai/experts/opportunities', paths: /\/(opportunities|jobs?|roles?|post)\/[^/]+/i },
  { platform: 'Alignerr', url: 'https://www.alignerr.com/jobs', paths: /\/jobs?\/[^/]+/i },
  { platform: 'RemoExperts', url: 'https://www.rex.zone/open-opportunities', paths: /\/(open-opportunities|opportunities|jobs?|projects?)\/[^/]+/i },
  { platform: 'Productive Playhouse', url: 'https://productiveplayhouse.applytojob.com/apply/', paths: /\/apply\/[a-z0-9]{6,}(?:\/[^/]*)?$/i },
  { platform: 'iMerit', url: 'https://imerit.ai/careers-listing/', paths: /\/(careers|jobs?|opportunities)\/[^/]+/i },
  { platform: 'Meridial', url: 'https://www.meridial.ai/projects', paths: /\/(projects|opportunities|jobs?)\/[^/]+/i },
  { platform: 'SME Careers', url: 'https://sme.careers/jobs/', paths: /\/(jobs?|opportunities)\/[^/]+/i },
  { platform: 'CACTUS', url: 'https://jobs.cactusglobal.com/jobs', paths: /\/(jobs?|job)\/[^/]+/i, pages: 20 },
];

function isCandidate(href, title, source) {
  if (!href || !title || title.length < 4) return false;
  if (/^(apply|apply now|details|read more|learn more|view role|view job)$/i.test(title.trim())) return false;
  try {
    const url = new URL(href);
    return /^https?:$/.test(url.protocol) && source.paths.test(url.pathname);
  } catch {
    return false;
  }
}

async function collectPage(page, source) {
  const jobs = new Map();
  let stable = 0;
  for (let attempt = 0; attempt < 30 && stable < 3; attempt++) {
    const cards = await page.evaluate((pathPattern) => {
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        const linkText = (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (!href || !linkText || !new RegExp(pathPattern, 'i').test(new URL(href).pathname)) continue;
        let node = a;
        let chosen = node;
        for (let n = 0; n < 6 && node.parentElement; n++) {
          node = node.parentElement;
          const text = (node.innerText || '').trim();
          if (text.length >= 50 && text.length < 2200 && /apply|remote|location|country|salary|\$|€|£/i.test(text)) {
            chosen = node;
            break;
          }
          chosen = node;
        }
        const card = chosen.closest('article,li,[data-job-id],[class*="job-card"],[class*="job-result"],[class*="role-card"],[class*="opportunity-card"],[class*="position-card"]') || chosen;
        const text = (card.innerText || '').trim().replace(/\s+/g, ' ');
        const heading = card.querySelector('h1,h2,h3,h4,[class*="title"]');
        const title = (heading?.innerText || linkText).trim().replace(/\s+/g, ' ');
        out.push({ href, title, text });
      }
      return out;
    }, source.paths.source);
    let added = 0;
    for (const job of cards) {
      if (!isCandidate(job.href, job.title, source)) continue;
      try {
        const url = new URL(job.href);
        url.hash = '';
        url.searchParams.delete('referralCode');
        for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
        if (!jobs.has(url.href)) {
          jobs.set(url.href, { ...job, href: url.href });
          added++;
        }
      } catch {}
    }
    const button = page.getByRole('button', { name: /load more|show more|view more/i }).first();
    if (await button.count()) {
      try { await button.click({ timeout: 1000 }); await page.waitForTimeout(700); } catch {}
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(700);
    stable = added ? 0 : stable + 1;
  }
  return [...jobs.values()];
}

async function scrapeSource(page, source) {
  const all = new Map();
  const maxPages = source.pages || 1;
  for (let n = 1; n <= maxPages; n++) {
    const url = new URL(source.url);
    if (source.pages) url.searchParams.set('page', String(n));
    await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1800);
    const jobs = await collectPage(page, source);
    if (!jobs.length && n === 1) break;
    if (!jobs.length && n > 1) break;
    for (const job of jobs) all.set(job.href, job);
    if (!source.pages || jobs.length < 10) break;
  }
  return [...all.values()];
}

function toItem(job, source) {
  const detectedCodes = extractCountryCodes(job.text);
  const codes = source.platform === 'micro1' ? MICRO1_COUNTRIES : detectedCodes;
  const locations = codes.map((code) => countries.getName(code, 'en')).filter(Boolean);
  if (!locations.length && /\bremote\b/i.test(job.text)) locations.push('Remote');
  const pay = job.text.match(/(?:[$€£]\s?[\d,.]+(?:\s?[-–]\s?[$€£]?\s?[\d,.]+)?\s*(?:\/\s*(?:hr|hour|task|project))?)/i)?.[0] ?? null;
  return {
    project_name: job.title,
    task_type: null,
    country: locations.join(', ') || null,
    raw_location: locations.join(', ') || null,
    country_codes: codes,
    pay,
    source_url: job.href,
  };
}

const browser = await chromium.launch();
const page = await browser.newPage();
const failed = [];
try {
  for (const source of SOURCES) {
    try {
      const jobs = await scrapeSource(page, source);
      const items = jobs.map((job) => toItem(job, source)).filter((item) => item.project_name && item.source_url);
      if (!items.length) throw new Error('Tidak ada listing yang cocok dengan struktur halaman');
      await savePlatform(source.platform, items);
      console.log(source.platform + ': ' + items.length + ' listing ditemukan');
    } catch (error) {
      console.error(source.platform + ' GAGAL:', error.message);
      failed.push(source.platform);
    }
  }
} finally {
  await browser.close();
}
if (failed.length) throw new Error('Gagal untuk: ' + failed.join(', '));
