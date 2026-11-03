import ProjectList from './ProjectList';

export default function Home() {
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
        <ProjectList />
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
