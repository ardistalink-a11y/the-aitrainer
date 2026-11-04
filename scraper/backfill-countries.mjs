import { db, extractCountryCodes } from './common.mjs';

const PAGE_SIZE = 1000;
const rows = [];

for (let offset = 0; ; offset += PAGE_SIZE) {
  const result = await db
    .from('projects')
    .select('id, raw_location, country, country_codes')
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1);
  if (result.error) throw result.error;
  rows.push(...result.data);
  if (result.data.length < PAGE_SIZE) break;
}

const groups = new Map();
let unresolved = 0;
for (const row of rows) {
  if (Array.isArray(row.country_codes) && row.country_codes.length > 0) continue;
  const codes = extractCountryCodes(row.raw_location ?? row.country);
  if (!codes.length) {
    unresolved++;
    continue;
  }
  const key = [...new Set(codes)].sort().join(',');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row.id);
}

let updated = 0;
for (const [key, ids] of groups) {
  const country_codes = key.split(',');
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const result = await db
      .from('projects')
      .update({ country_codes })
      .in('id', batch);
    if (result.error) throw result.error;
    updated += batch.length;
  }
}

console.log(`Country code backfill: ${updated} rows updated, ${unresolved} rows still have no country-specific location`);
