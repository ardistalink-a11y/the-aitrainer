# digestai.job

Direktori proyek AI dari berbagai platform. Data dari Supabase, tampilan Next.js, hosting Vercel.

## Menjalankan

1. Di Supabase > SQL Editor, jalankan isi `supabase/schema.sql`.
2. Salin `.env.example` menjadi `.env.local`, isi URL dan anon key dari Supabase (Project Settings > API).
3. `npm install` lalu `npm run dev`, buka http://localhost:3000

## Deploy

Push ke GitHub, import repo di Vercel, isi environment variable yang sama, klik Deploy.

## Catatan

- Jangan pernah memakai `service_role` key di situs ini. Key itu hanya untuk scraper.
- Data di situs diperbarui tiap 5 menit (`revalidate` di `app/page.js`).
