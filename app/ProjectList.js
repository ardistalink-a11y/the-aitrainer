'use client';

import { useMemo, useState } from 'react';

const fmt = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Jakarta',
});

function uniq(list, key) {
  return [...new Set(list.map((p) => p[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export default function ProjectList({ projects }) {
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [language, setLanguage] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const platforms = useMemo(() => uniq(projects, 'platform'), [projects]);
  const languages = useMemo(() => uniq(projects, 'language'), [projects]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return projects.filter((p) => {
      if (!showClosed && p.status !== 'open') return false;
      if (platform && p.platform !== platform) return false;
      if (language && p.language !== language) return false;
      if (!term) return true;
      return [p.project_name, p.platform, p.task_type, p.language, p.country]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [projects, q, platform, language, showClosed]);

  return (
    <section>
      <div className="bar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari proyek, platform, atau bahasa"
          aria-label="Cari proyek"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          aria-label="Filter platform"
        >
          <option value="">Semua platform</option>
          {platforms.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          aria-label="Filter bahasa"
        >
          <option value="">Semua bahasa</option>
          {languages.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Tampilkan yang sudah ditutup
        </label>
      </div>

      <p className="count" aria-live="polite">
        {rows.length} proyek
      </p>

      {projects.length === 0 ? (
        <p className="notice">
          Belum ada proyek. Tambahkan data ke tabel projects di Supabase.
        </p>
      ) : rows.length === 0 ? (
        <p className="notice">
          Tidak ada proyek yang cocok. Coba hapus sebagian filter.
        </p>
      ) : (
        <ul className="list">
          {rows.map((p) => (
            <li key={p.id}>
              <a
                className="row"
                href={p.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="main">
                  <span className="name">{p.project_name}</span>
                  <span className="meta">
                    <b>{p.platform}</b>
                    {[p.task_type, p.language, p.country, p.pay]
                      .filter(Boolean)
                      .map((x) => (
                        <span key={x}>{x}</span>
                      ))}
                  </span>
                </span>
                <span className="side">
                  <span>
                    <span className={`dot ${p.status === 'open' ? 'on' : ''}`} />
                    {p.status === 'open' ? 'Buka' : 'Ditutup'}
                  </span>
                  {p.last_seen ? (
                    <small>Dicek {fmt.format(new Date(p.last_seen))}</small>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
