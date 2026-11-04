import { chromium } from 'playwright';
import countries from 'i18n-iso-countries';
import { extractCountryCodes, savePlatform, sleep } from './common.mjs';

const SOURCES = [
  { platform: 'micro1', url: 'https://www.micro1.ai/experts/opportunities', paths: /\/(opportunities|jobs?|roles?)\/[^/]+/i },
  { platform: 'Alignerr', url: 'https://www.alignerr.com/jobs', paths: /\/jobs?\/[^/]+/i },
  { platform: 'RemoExperts', url: 'https://www.rex.zone/open-opportunities', paths: /\/(open-opportunities|opportunities|jobs?|projects?)\/[^/]+/i },
  { platform: 'Productive Playhouse', url: 'https://productiveplayhouse.applytojob.com/apply/', paths: /\/apply\/[a-z0-9]{6,}(?:\/[^/]*)?$/i },
  { platform: 'iMerit', url: 'https://imerit.ai/careers-listing/', paths: /\/(careers|jobs?|opportunities)\/[^/]+/i },
  { platform: 'Meridial', url: 'https://www.meridial.ai/projects', paths: /\/(projects|opportunities|jobs?)\/[^/]+/i },
  { platform: 'SME Careers', url: 'https://sme.careers/jobs/', paths: /\/(jobs?|opportunities)\/[^/]+/i },
  { platform: 'CACTUS', url: 'https://jobs.cactusglobal.com/jobs?locations=,,Indonesia&page=1', paths: /\/(jobs?|job)\/[^/]+/i },
];

function candidate(link, source) {
  if (!link.href || !link.title || link.title.length < 4) return false;
  if (/^(apply|apply now|details|read more|learn more|view role|view job)$/i.test(link.title.trim())) return false;
  let url;
  try { url = new URL(link.href); } catch { return false; }
  if (!/^https?:$/.test(url.protocol)) return false;
  return source.paths.test(url.pathname);
}

async function readCards(page, source) {
  return page.evaluate((patterns) => {
    const out = [];
    const links = [...document.querySelectorAll('a[href]')];
    for (const a of links) {
      const title = (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      const href = a.href;
      if (!href || !title) continue;
      let card = a;
      for (let n = 0; n < 6 && card.parentElement; n++) {
        const parent = card.parentElement;
        const text = (parent.innerText || '').trim();
        if (text.length > 60 && text.length < 2500 && /apply|remote|location|country|salary|\$|€|£/i.test(text)) {
          card = parent;
          break;
        }
        card = parent;
      }
      const container = card.closest('article,li,[class*="job"],[class*="role"],[class*="card"]') || card;
      const text = (container.innerText || '').trim().replace(/\s+/g, ' ');
      if (patterns.some((pattern) => new RegExp(pattern, 'i').test(new URL(href).pathname))) {
        const heading = container.querySelector('h1,h2,h3,h4,[class*="title"]');
        out.push({ title: (heading?.innerText || title).trim().replace(/\s+/g, ' '), href, text });
      }
    }
    return out;
  }, [source.paths.source]);
}

async function scrapeSource(page, source) {
  await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const jobs = new Map();
  let stable = 0;
  for (let attempt = 0; attempt < 30 && stable < 3; attempt++) {
    const cards = await page.evaluate((pattern) => {
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href;
        const title = (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
        if (!href || !title || title.length < 4 || !new RegExp(pattern, 'i').test(new URL(href).pathname)) continue;
        if (/^(apply|apply now|details|read more|learn more|view role|view job)$/i.test(title)) continue;
        let node = a;
        for (let n = 0; n < 5 && node.parentElement; n++) {
          node = node.parentElement;
          const text = (node.innerText || '').trim();
          if (text.length >= 60 && text.length < 2500 && /apply|remote|location|country|salary|\$|€|£/i.test(text)) break;
        }
        const container = node.closest('article,li,[class*="job"],[class*="role"],[class*="card"]') || node;
        const text = (container.innerText || '').trim().replace(/\s+/g, ' ');
        const heading = container.querySelector('h1,h2,h3,h4,[class*="title"]');
        out.push({ title: (heading?.innerText || title).trim().replace(/\s+/g, ' '), href, text });
      }
      return out;
    }, source.paths.source);
    let added = 0;
    for (const job of cards) {
      try {
        const url = new URL(job.href);
        if (!candidate({ href: url.href, title: job.title }, source)) continue;
        url.hash = '';
        if (!jobs.has(url.href)) { jobs.set(url.href, { ...job, href: url.href }); added++; }
      } catch {}
    }
    const loadMore = page.getByRole('button', { name: /load more|show more|view more/i }).first();
    if (await loadMore.count()) {
      try { await loadMore.click({ timeout: 1000 }); await page.waitForTimeout(800); } catch {}
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(800);
    stable = added ? 0 : stable + 1;
  }
  return [...jobs.values()];
}

function toItem(job) {
  const codes = extractCountryCodes(job.text);
  const location = codes.map((code) => countries.getName(code, 'en')).filter(Boolean);
  if (!location.length && /\bremote\b/i.test(job.text)) location.push('Remote');
  const pay = job.text.match(/(?:[$€£]\s?[\d,.]+(?:\s?[-–]\s?[$€£]?\s?[\d,.]+)?\s*(?:\/\s*(?:hr|hour|task|project))?)/i)?.[0] ?? null;
  return {
    project_name: job.title,
    task_type: null,
    country: location.join(', ') || null,
    raw_location: location.join(', ') || null,
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
      const items = jobs.map(toItem).filter((item) => item.project_name && item.source_url);
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
