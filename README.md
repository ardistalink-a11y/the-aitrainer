# digestai.job

Direktori proyek AI dari berbagai platform. Data dari Supabase, tampilan Next.js, hosting Vercel.

## Menjalankan

1. Di Supabase > SQL Editor, jalankan isi `superbase/schema.sql`.
2. Untuk database yang sudah ada, jalankan `superbase/migrations/20261104_country_codes.sql` sebelum workflow scraper berikutnya.
3. Salin `.env.example` menjadi `.env.local`, isi URL dan anon key dari Supabase (Project Settings > API).
4. `npm install` lalu `npm run dev`, buka http://localhost:3000

## Deploy

Push ke GitHub, import repo di Vercel, isi environment variable yang sama, klik Deploy.

## Catatan

- Jangan pernah memakai `service_role` key di situs ini. Key itu hanya untuk scraper.
- Data di situs diperbarui tiap 5 menit (`revalidate` di `app/page.js`).
- Resolusi kota menggunakan basis data `@tansuasici/country-state-city`; data geografisnya berasal dari [Countries States Cities Database](https://github.com/dr5hn/countries-states-cities-database) dan berlisensi ODbL.
