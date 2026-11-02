import { supabase } from '../lib/supabase';
import ProjectList from './ProjectList';

export const revalidate = 300; // data diperbarui tiap 5 menit

export default async function Home() {
  let projects = [];
  let error = null;

  if (!supabase) {
    error = 'Variabel environment Supabase belum diisi.';
  } else {
    const res = await supabase
      .from('projects')
      .select('*')
      .order('last_seen', { ascending: false })
      .limit(2000);
    if (res.error) error = res.error.message;
    else projects = res.data || [];
  }

  const reportUrl = process.env.NEXT_PUBLIC_REPORT_URL;

  return (
    <>
      <header className="top">
        <h1 className="brand">
          digestai<span>.job</span>
        </h1>
        <p className="lede">
          Proyek AI dari berbagai platform, terkumpul di satu tempat. Klik
          proyek untuk lanjut ke platform aslinya.
        </p>
      </header>

      <main>
        {error ? (
          <p className="notice">Data belum bisa dimuat: {error}</p>
        ) : (
          <ProjectList projects={projects} />
        )}
      </main>

      <footer className="foot">
        <p>
          digestai.job tidak berafiliasi dengan platform mana pun yang
          tercantum. Semua nama platform milik pemiliknya masing-masing.
          Pendaftaran dilakukan langsung di platform tersebut.
        </p>
        {reportUrl ? (
          <p>
            <a href={reportUrl} target="_blank" rel="noopener noreferrer">
              Laporkan link mati
            </a>
          </p>
        ) : null}
      </footer>
    </>
  );
}
