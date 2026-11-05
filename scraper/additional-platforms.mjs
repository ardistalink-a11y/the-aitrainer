import { chromium } from 'playwright';
import countries from 'i18n-iso-countries';
import { clean, extractCountryCodes, savePlatform, sleep } from './common.mjs';

const SOURCES = [
  { platform: 'Alignerr', url: 'https://www.alignerr.com/jobs', paths: /\/jobs?\/[^/]+/i },
  { platform: 'Productive Playhouse', url: 'https://productiveplayhouse.applytojob.com/apply/', paths: /\/apply\/[a-z0-9]{6,}(?:\/[^/]*)?$/i },
];

function isCandidate(href, title, source) {
  if (!href || !title || title.length < 4) return false;
  if (/^(apply|apply now|details|read more|learn more|view role|view job)$/i.test(title.trim())) return false;
  try {
    const url = new URL(href);
    return /^https?:$/.test(url.protocol) && source.paths.test(url.pathname) && (!source.queryParam || url.searchParams.has(source.queryParam));
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
  const codes = detectedCodes;
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

async function scrapeImerit(page) {
  const url = 'https://imerit.ai/careers-listing/';
  const items = [];
  let buttonCount = 0;
  let failedButtons = 0;
  for (let index = 0; index < 100; index++) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1200);
    const buttons = page.getByText(/view role/i);
    buttonCount = await buttons.count();
    if (index >= buttonCount) break;
    const button = buttons.nth(index);
    const card = await button.evaluate((element) => {
      let current = element;
      let best = element;
      let bestTitle = '';
      let bestText = '';
      let href = element.closest('a')?.href || '';
      let id = '';
      for (let level = 0; level < 9 && current; level++, current = current.parentElement) {
        const heading = current.querySelector('h1,h2,h3,h4');
        const text = (current.innerText || '').trim();
        if (!bestTitle && heading && text.length > 30 && text.length < 6000) {
          best = current;
          bestTitle = (heading.innerText || '').trim();
          bestText = text;
        }
        if (!href) href = current.querySelector('a[href]')?.href || '';
        const attrs = [current.id, current.getAttribute('data-job-id'), current.getAttribute('data-id'), current.getAttribute('data-job')].filter(Boolean).join(' ');
        const code = attrs.match(/\b[A-Z]{2,8}-\d{2,8}\b/i) || text.match(/\b[A-Z]{2,8}-\d{2,8}\b/i);
        if (!id && code) id = code[0];
      }
      return { title: bestTitle, text: bestText || (best.innerText || '').trim(), href, id };
    });
    const before = page.url();
    try {
      await button.click({ timeout: 5000 });
      await page.waitForTimeout(500);
    } catch {
      failedButtons++;
      continue;
    }
    const currentUrl = new URL(page.url());
    let sourceUrl = currentUrl.searchParams.has('job') ? currentUrl.href : '';
    if (!sourceUrl && card.href) {
      const candidate = new URL(card.href, url);
      if (candidate.searchParams.has('job')) sourceUrl = candidate.href;
    }
    if (!sourceUrl && card.id) sourceUrl = url + '?job=' + encodeURIComponent(card.id);
    const detailText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    const detailTitle = await page.locator('h1,h2').first().innerText().catch(() => '');
    const projectName = [card.title, detailTitle]
      .map(clean)
      .find((title) => title.length > 5 && !/join our global team|careers?|open roles|featured role/i.test(title)) || '';
    const location = detailText.match(/📍\s*([^⏱📅💰🌐]{2,100})/u)?.[1]
      || detailText.match(/Location\s*[:：]\s*([^\n]{2,100})/i)?.[1]
      || card.text.match(/📍\s*([^⏱📅💰🌐]{2,100})/u)?.[1];
    const rawLocation = clean(location) || (/\bremote\b/i.test(detailText + ' ' + card.text) ? 'Remote' : null);
    const pay = detailText.match(/(?:USD|EUR|GBP|INR|BDT)?\s*\$?\s*[\d,.]+\s*(?:[-–]\s*(?:USD|EUR|GBP|INR|BDT)?\s*\$?\s*[\d,.]+)?\s*\/\s*(?:hour|hr|month|task)/i)?.[0] || null;
    const jobId = currentUrl.searchParams.get('job');
    if (sourceUrl && projectName && jobId && page.url() !== before) {
      const codes = extractCountryCodes(rawLocation);
      items.push({
        project_name: projectName,
        task_type: null,
        country: rawLocation,
        raw_location: rawLocation,
        country_codes: codes,
        pay: clean(pay) || null,
        source_url: sourceUrl,
      });
    } else {
      failedButtons++;
    }
  }
  if (failedButtons) {
    throw new Error(failedButtons + ' dari ' + buttonCount + ' kartu gagal dibaca; data iMerit lama dipertahankan');
  }
  if (!items.length) throw new Error('Klik View role tidak menghasilkan URL detail dengan parameter job');
  await savePlatform('iMerit', items);
  console.log('iMerit: ' + items.length + ' listing disimpan dari ' + buttonCount + ' kartu');
}

const browser = await chromium.launch();
const page = await browser.newPage();
const failed = [];
try {
  try {
    await scrapeImerit(page);
  } catch (error) {
    console.error('iMerit GAGAL:', error.message);
    failed.push('iMerit');
  }
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
if (failed.length) {
  const message = 'Source tidak diperbarui (data lama dipertahankan): ' + failed.join(', ');
  console.warn('PERINGATAN:', message);
  if (process.env.GITHUB_ACTIONS) console.log('::warning title=Partial source refresh::' + message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, '\n## Additional source warnings\n\n' + failed.map((name) => '- ' + name).join('\n') + '\n\nFailed sources were left untouched; old records were not closed.\n');
  }
}
