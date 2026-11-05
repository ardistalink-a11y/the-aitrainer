import { appendFile } from 'node:fs/promises';
import countries from 'i18n-iso-countries';
import { extractCountryCodes, savePlatform } from './common.mjs';

const MICRO1_RESTRICTED = new Set([
  'AF', 'BY', 'CN', 'CU', 'CD', 'HK', 'IR', 'IQ', 'LY', 'MO', 'MM', 'KP', 'RU',
  'SO', 'SS', 'SD', 'SY', 'VE', 'UA', 'YE', 'ET',
]);
const MICRO1_COUNTRIES = Object.keys(countries.getNames('en')).filter((code) => !MICRO1_RESTRICTED.has(code));

const decodeHtml = (value) => String(value || '')
  .replace(/\\u003c/gi, '<')
  .replace(/\\u003e/gi, '>')
  .replace(/\\u0026/gi, '&')
  .replace(/\\u0027/gi, "'")
  .replace(/\\u0022/gi, '"')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&#x27;/gi, "'")
  .replace(/&nbsp;/gi, ' ');

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

async function getText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0 TheAITrainer/1.0' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
  return response.text();
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 TheAITrainer/1.0' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + url);
  return response.json();
}

function reportFailure(platform, error) {
  const message = clean(error?.message || error);
  console.error(platform + ' GAGAL:', message);
  if (process.env.GITHUB_ACTIONS) {
    console.log('::warning title=' + platform + ' scraper::' + message);
  }
}

async function scrapeMicro1() {
  const sitemap = await getText('https://jobs.micro1.ai/sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return parsed.hostname === 'jobs.micro1.ai' && /^\/post\/[a-z0-9-]+$/i.test(parsed.pathname);
      } catch {
        return false;
      }
    });
  if (!urls.length) throw new Error('Sitemap tidak berisi URL lowongan');

  const items = [];
  for (let index = 0; index < urls.length; index += 12) {
    const batch = await Promise.all(urls.slice(index, index + 12).map(async (sourceUrl) => {
      try {
        const html = await getText(sourceUrl);
        const decoded = decodeHtml(html);
        const titleMatch = decoded.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = clean(titleMatch?.[1]).replace(/\s*\|\s*Apply on Job.*$/i, '');
        const text = decoded
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/(?:p|li|h[1-6])>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\\n/g, '\n');
        if (!title || /not found|no longer available|no longer accepting applications|position has been filled/i.test(text)) return null;
        const location = text.match(/(?:Role Location|Location):\s*([^\n<]{1,160})/i)?.[1];
        const rawLocation = clean(location) || null;
        const pay = clean(text.match(/(?:Pay|Pay rate|Compensation):\s*([^\n<]{1,100})/i)?.[1]) || null;
        return {
          project_name: title,
          task_type: null,
          country: rawLocation,
          raw_location: rawLocation,
          country_codes: !rawLocation
            ? []
            : (/remote|worldwide|global|anywhere/i.test(rawLocation)
              ? MICRO1_COUNTRIES
              : extractCountryCodes(rawLocation)),
          pay,
          source_url: sourceUrl,
        };
      } catch (error) {
        console.warn('micro1 detail skipped:', sourceUrl, error.message);
        return null;
      }
    }));
    items.push(...batch.filter(Boolean));
  }
  if (!items.length) throw new Error('Tidak ada detail lowongan aktif yang terbaca dari sitemap');
  await savePlatform('micro1', items);
  console.log('micro1: ' + items.length + ' listing disimpan dari sitemap (' + urls.length + ' URL)');
}

async function scrapeSme() {
  const base = 'https://api.sme.careers/v1/jobs/paginated/open';
  const query = new URLSearchParams({ page: '1', size: '25', include: 'applicants-count', countryPayrates: 'true' });
  const first = await getJson(base + '?' + query.toString());
  const totalPages = Math.max(1, Number(first.page?.totalPages) || 1);
  const jobs = [...(first.data || [])];
  for (let page = 2; page <= totalPages; page++) {
    query.set('page', String(page));
    const response = await getJson(base + '?' + query.toString());
    jobs.push(...(response.data || []));
  }
  const items = jobs.map((job) => {
    const countriesList = Array.isArray(job.countries) ? job.countries : [];
    const codes = [...new Set(countriesList.map((entry) => String(entry.countryCode || '').toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))];
    const names = countriesList.map((entry) => entry.name).filter(Boolean);
    const isWorldwide = countriesList.some((entry) => String(entry.countryCode).toUpperCase() === 'WW');
    const countryCodes = isWorldwide ? Object.keys(countries.getNames('en')) : codes;
    const rawLocation = names.join(' / ') || (isWorldwide ? 'Worldwide' : clean(job.workLocation) || 'Remote');
    const minimum = job.hourlyRateMin ?? job.rateMin;
    const maximum = job.hourlyRateMax ?? job.rateMax;
    const currency = job.currencyCode || 'USD';
    const unit = job.payUnit || 'hour';
    const pay = minimum != null && maximum != null
      ? currency + ' ' + minimum + '–' + maximum + ' / ' + unit
      : minimum != null ? currency + ' ' + minimum + ' / ' + unit : null;
    return {
      project_name: job.title,
      task_type: null,
      country: rawLocation,
      raw_location: rawLocation,
      country_codes: countryCodes.length ? countryCodes : extractCountryCodes(rawLocation),
      indonesia_status: isWorldwide ? 'worldwide' : undefined,
      pay,
      source_url: 'https://sme.careers/jobs/?jobPostingId=' + encodeURIComponent(job.jobPostingId),
    };
  }).filter((item) => item.project_name && item.source_url);
  if (!items.length) throw new Error('API mengembalikan 0 lowongan');
  await savePlatform('SME Careers', items);
  console.log('SME Careers: ' + items.length + ' listing disimpan (' + totalPages + ' halaman API)');
}

async function scrapeCactus() {
  const base = 'https://jobs.cactusglobal.com/api/jobs';
  let page = 1;
  let totalPages = 1;
  const jobs = [];
  while (page <= totalPages) {
    const response = await getJson(base + '?page=' + page);
    const records = Array.isArray(response.jobs) ? response.jobs : [];
    jobs.push(...records.map((entry) => entry.data || entry).filter(Boolean));
    const pageSize = Number(response.filter?.displayLimit) || records.length || 10;
    const total = Number(response.totalCount ?? response.count) || records.length;
    totalPages = Math.max(totalPages, Math.ceil(total / pageSize));
    if (!records.length) break;
    page++;
  }
  const items = jobs.filter((job) => job.searchable !== false).map((job) => {
    const rawLocation = job.full_location || job.short_location || job.location_name || null;
    const code = String(job.country_code || '').toUpperCase();
    const sourceUrl = job.meta_data?.canonical_url || ('https://jobs.cactusglobal.com/jobs/' + encodeURIComponent(job.slug) + '?lang=' + encodeURIComponent(job.language || 'en-us'));
    const pay = job.salary_value || (job.salary_min_value || job.salary_max_value
      ? [job.salary_min_value, job.salary_max_value].filter(Boolean).join('–')
      : null);
    return {
      project_name: job.title,
      task_type: job.department || (Array.isArray(job.category) ? job.category.join(', ') : job.category) || null,
      country: rawLocation,
      raw_location: rawLocation,
      country_codes: /^[A-Z]{2}$/.test(code) ? [code] : extractCountryCodes(rawLocation),
      pay,
      source_url: sourceUrl,
    };
  }).filter((item) => item.project_name && item.source_url);
  if (!items.length) throw new Error('API mengembalikan 0 lowongan');
  await savePlatform('CACTUS', items);
  console.log('CACTUS: ' + items.length + ' listing disimpan');
}

async function scrapeMeridial() {
  const payload = await getJson('https://boards-api.greenhouse.io/v1/boards/agency/jobs?content=true');
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  if (!jobs.length) throw new Error('Greenhouse API mengembalikan 0 lowongan');

  const items = jobs.map((job) => {
    const rawLocation = clean(job.location?.name || (job.offices || []).map((office) => office.location || office.name).filter(Boolean).join(', ')) || null;
    const content = clean(decodeHtml(job.content || '').replace(/<[^>]+>/g, ' '));
    const pay = content.match(/(?:[$]|\bUSD\b)\s*\d[\d,.]*(?:\s*(?:-?\s*to\s*-?|to|[-–])\s*(?:[$]|\bUSD\b)?\s*\d[\d,.]*)?\s*(?:per|\/)\s*(?:hour|hr|month|task)/i)?.[0] || null;
    const departments = Array.isArray(job.departments) ? job.departments.map((department) => department.name).filter(Boolean) : [];
    const sourceUrl = 'https://job-boards.eu.greenhouse.io/agency/jobs/' + encodeURIComponent(job.id);
    return {
      project_name: clean(job.title),
      task_type: departments.join(', ') || null,
      language: clean(job.language) || null,
      country: rawLocation,
      raw_location: rawLocation,
      country_codes: extractCountryCodes(rawLocation),
      pay,
      source_url: sourceUrl,
    };
  }).filter((item) => item.project_name && item.source_url);

  if (!items.length) throw new Error('Greenhouse API tidak menghasilkan listing Meridial');
  await savePlatform('Meridial', items);
  console.log('Meridial: ' + items.length + ' listing disimpan dari Greenhouse Job Board API');
}

async function scrapeRex() {
  const payload = await getJson('https://www.rex.zone/open-opportunities/_payload.json');
  const cache = new Map();
  const at = (index) => {
    if (typeof index !== 'number') return index;
    if (index < 0) return undefined;
    if (cache.has(index)) return cache.get(index);
    const node = payload[index];
    if (Array.isArray(node)) {
      if (['ShallowReactive', 'Reactive', 'Ref', 'ShallowRef', 'Computed', 'Readonly'].includes(node[0])) {
        const value = at(node[1]);
        cache.set(index, value);
        return value;
      }
      const value = [];
      cache.set(index, value);
      for (const reference of node) value.push(at(reference));
      return value;
    }
    if (node && typeof node === 'object') {
      const value = {};
      cache.set(index, value);
      for (const [key, reference] of Object.entries(node)) value[key] = at(reference);
      return value;
    }
    return node;
  };

  const state = at(0)?.data;
  const jobs = state?.['open-opportunities'];
  if (!Array.isArray(jobs) || !jobs.length) throw new Error('Payload tidak berisi peluang aktif');
  const allCountryCodes = Object.keys(countries.getNames('en'));
  const items = jobs.map((job) => {
    const eligibleCountries = Array.isArray(job.countries) ? job.countries.map(clean).filter(Boolean) : [];
    const worldwide = eligibleCountries.some((country) => country.toUpperCase() === 'ALL');
    const countryNames = eligibleCountries.filter((country) => country.toUpperCase() !== 'ALL');
    const rawLocation = worldwide ? 'Worldwide' : countryNames.join(' / ') || (/\bremote\b/i.test(job.jobDescription || '') ? 'Remote' : null);
    const countryCodes = worldwide
      ? allCountryCodes
      : [...new Set(countryNames.flatMap((country) => extractCountryCodes(country)))];
    return {
      project_name: clean(job.jobTitle),
      task_type: Array.isArray(job.jobCategory) ? job.jobCategory.join(', ') : clean(job.jobCategory) || null,
      country: rawLocation,
      raw_location: rawLocation,
      country_codes: countryCodes,
      indonesia_status: worldwide ? 'worldwide' : undefined,
      pay: clean(job.compensation) || null,
      source_url: 'https://www.rex.zone/open-opportunities/detail?jobId=' + encodeURIComponent(job.jobId),
    };
  }).filter((item) => item.project_name && item.source_url);
  if (!items.length) throw new Error('Payload REX tidak menghasilkan listing');
  await savePlatform('RemoExperts', items);
  console.log('RemoExperts: ' + items.length + ' listing disimpan dari payload publik');
}

async function run(platform, scrape) {
  try {
    await scrape();
  } catch (error) {
    reportFailure(platform, error);
  }
}

await run('micro1', scrapeMicro1);
await run('RemoExperts', scrapeRex);
await run('Meridial', scrapeMeridial);
await run('SME Careers', scrapeSme);
await run('CACTUS', scrapeCactus);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, '## Public job feeds\n\nMicro1 and REX are fetched from public sitemaps or page payloads; SME Careers and CACTUS are fetched from public JSON job endpoints. Check this step’s warnings for any source that did not refresh.\n');
}
