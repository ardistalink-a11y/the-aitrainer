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

const CITY_COUNTRY = new Map();
for (const [code, names] of Object.entries({
  DE: 'Aalen|Augsburg|Baden-Baden|Bamberg|Bayreuth|Berlin|Erfurt|Frankfurt|Freiburg|Freiburg im Breisgau|Hamburg|Heidelberg|Kaiserslautern|Karlsruhe|Kassel|Koblenz|Landshut|Mainz|Marburg|Munich|München|Passau|Regensburg|Reutlingen|Stuttgart|Trier|Würzburg|Wiesbaden|Pforzheim|Villingen-Schwenningen|Weiden in der Oberpfalz|Albstadt|Heilbronn|Idar-Oberstein|Bad Kreuznach|Lichtenfels|Suhl|Ulm|Ehingen|Münster|Gera|Nuremberg|Bad Mergentheim|Leipzig|Schwäbisch Gmünd|Schwäbisch Hall|Steinau an der Straße|Rosenheim|Cologne|Ingolstadt|Siegen|Neubrandenburg|Aachen|Bad Hersfeld|Oldenburg|Mannheim|Kindsbach',
  US: 'Atlanta|Austin|Boston|Chicago|Cincinnati|Columbus|Dallas|Houston|Indianapolis|Las Vegas|Los Angeles|Louisville|Miami|Nashville|New Orleans|New York|Orlando|Philadelphia|Phoenix|Palo Alto|San Diego|San Francisco|Seattle|Tampa|Washington|Mountain View|Sunnyvale|Redmond|Burlingame',
  FR: 'Paris|Valence|Toulouse|Lyon|Bordeaux|Dijon|Mont-de-Marsan|Montmorillon|Brive-la-Gaillarde|Nantes',
  BE: 'Brussels|Leuven',
  GB: 'London|Bristol|Birmingham|Cambridge',
  NL: 'Amsterdam|Rotterdam|The Hague|Hague|Amersfoort|Eindhoven|Eindhover',
  CH: 'Bern|Geneva|Zurich|Zürich|St. Gallen|St Gallen|Furttal',
  PL: 'Krakow|Kraków|Warsaw|Gdańsk',
  IT: 'Milan|Rome|Turin|Bologna|Ravenna|Naples|Prato|Foligno|Brescia',
  IE: 'Dublin',
  AT: 'Vienna',
  PT: 'Lisbon|Porto',
  CZ: 'Prague',
  SE: 'Stockholm',
  EE: 'Tallinn',
  UA: 'Lviv|Kyiv',
  FI: 'Helsinki',
  NO: 'Oslo|Lørenskog',
  IN: 'Hyderabad|New Delhi',
  TH: 'Bangkok',
  MY: 'Kuala Lumpur',
  BR: 'Sao Paulo|São Paulo|San Paulo|Salvador|Fortaleza|Belo Horizonte|Manaus|Curitiba|Belém|Porto Alegre|Goiânia|Campinas|Guarulhos|São Luís|Maceió|Natal|João Pessoa|Recife|Rio de Janeiro',
  RO: 'Bucharest',
  HU: 'Budapest',
  BG: 'Sofia',
  LV: 'Riga',
  CA: 'Toronto|Ottawa|Montreal|Vancouver|Calgary|Edmonton',
  AU: 'Sydney|Melbourne|Brisbane|Perth',
  ID: 'Jakarta',
  ES: 'Madrid|Barcelona|Pamplona|Bilbao|Zaragoza|Vigo|Murcia|Lugo',
  JP: 'Tokyo',
  VN: 'Hanoi',
  SA: 'Riyadh',
  PH: 'Manila',
  RS: 'Belgrade',
  SK: 'Bratislava',
  SI: 'Ljubljana',
  TW: 'Taipei',
  NZ: 'Wellington',
  ZA: 'Cape Town',
  LT: 'Vilnius',
  AE: 'Dubai',
  DK: 'Copenhagen',
  GR: 'Thessaloniki|Athens',
  CY: 'Nicosia',
  TR: 'Istanbul',
})) {
  for (const name of names.split('|')) CITY_COUNTRY.set(normalizeKey(name), code);
}

const US_STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const CA_PROVINCES = new Set('AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '));

function normalizeKey(value) {
  return String(value || '').toLocaleLowerCase('en').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const normalizeCountryText = (value) =>
  value.toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function cityCountryCodes(raw) {
  const found = new Set();
  const text = String(raw || '');
  for (const part of text.split(/[\/;|]+/)) {
    const value = part.trim();
    const normalized = normalizeKey(value);
    if (CITY_COUNTRY.has(normalized)) found.add(CITY_COUNTRY.get(normalized));

    const pieces = value.split(',').map((piece) => piece.trim());
    const suffix = (pieces.at(-1) || '').toUpperCase().replace(/\./g, '');
    if (pieces.length > 1 && US_STATES.has(suffix)) found.add('US');
    if (pieces.length > 1 && CA_PROVINCES.has(suffix)) found.add('CA');
    if (pieces.length > 1) {
      const city = normalizeKey(pieces[0]);
      if (CITY_COUNTRY.has(city)) found.add(CITY_COUNTRY.get(city));
    }
  }
  return [...found];
}

export function extractCountryCodes(raw) {
  const text = String(raw || '');
  const normalized = ' ' + normalizeCountryText(text) + ' ';
  const found = new Set(cityCountryCodes(text));
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
