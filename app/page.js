import ProjectList from './ProjectList';

export default function Home() {
  const reportUrl = process.env.NEXT_PUBLIC_REPORT_URL;

  return (
    <>
      <div className="stripe" />
      <header className="wrap top">
        <h1 className="brand">
          The <span>AI</span>Trainer
        </h1>
        <p className="lede">
          AI training projects from many platforms, in one place. Click a
          project to apply on the original platform.
        </p>
      </header>

      <main className="wrap">
        <ProjectList />
      </main>

      <footer className="wrap foot">
        <p>
          The AITrainer is not affiliated with any of the listed platforms. All
          platform names belong to their respective owners. Applications are
          made directly on each platform.
        </p>
        {reportUrl ? (
          <p>
            <a href={reportUrl} target="_blank" rel="noopener noreferrer">
              Report a broken link
            </a>
          </p>
        ) : null}
      </footer>
    </>
  );
}
