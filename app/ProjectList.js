'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const PAGE = 30;
const KEY = 'digestai.marks';
const FMT = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Asia/Jakarta',
});
const TAG = {
  indonesia: 'Indonesia',
  worldwide: 'Worldwide',
  unknown: 'Lokasi belum jelas',
  excluded: 'Bukan untuk Indonesia',
};
const MARKS = {
  none: 'Belum dilamar',
  applied: 'Sudah dilamar',
  process: 'Dalam proses',
};

export default function ProjectList() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [platform, setPlatform] = useState('');
  const [scope, setScope] = useState('default');
  const [mine, setMine] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  const [marks, setMarks] = useState({});
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const marksRef = useRef({});
  const reqId = useRef(0);
  const userId = user?.id ?? null;

  // Sesi login
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Muat penanda lamaran: dari akun kalau login, dari browser kalau belum
  useEffect(() => {
    if (!authChecked || !supabase) return;
    let cancelled = false;
    (async () => {
      setReady(false);
      let local = {};
      try {
        local = JSON.parse(localStorage.getItem(KEY) || '{}');
      } catch {}
      let map = local;
      if (userId) {
        const entries = Object.entries(local);
        if (entries.length) {
          // pindahkan penanda lama di browser ini ke akun
          const up = await supabase.from('user_marks').upsert(
            entries.map(([project_id, mark]) => ({ user_id: userId, project_id, mark })),
            { onConflict: 'user_id,project_id' }
          );
          if (!up.error) {
            try {
              localStorage.removeItem(KEY);
            } catch {}
          }
        }
        const { data } = await supabase.from('user_marks').select('project_id, mark');
        map = {};
        (data || []).forEach((r) => {
          map[r.project_id] = r.mark;
        });
      }
      if (cancelled) return;
      marksRef.current = map;
      setMarks(map);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, userId]);

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim().replace(/[,()%*]/g, ' ').trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('platform_list')
      .select('platform')
      .then(({ data }) => {
        if (data) setPlatforms(data.map((d) => d.platform).sort());
      });
  }, []);

  async function run(offset) {
    if (!supabase) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);

    let qy = supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .order('last_seen', { ascending: false })
      .order('id')
      .range(offset, offset + PAGE - 1);

    if (!showClosed) qy = qy.eq('status', 'open');
    if (platform) qy = qy.eq('platform', platform);
    if (scope === 'indonesia') qy = qy.eq('indonesia_status', 'indonesia');
    else if (scope === 'default')
      qy = qy.in('indonesia_status', ['indonesia', 'worldwide', 'unknown']);
    if (term)
      qy = qy.or(
        `project_name.ilike.%${term}%,task_type.ilike.%${term}%,language.ilike.%${term}%`
      );

    if (mine !== 'all') {
      const ids = Object.keys(marksRef.current);
      if (mine === 'none') {
        if (ids.length) qy = qy.not('id', 'in', `(${ids.join(',')})`);
      } else {
        const sel = ids.filter((k) => marksRef.current[k] === mine);
        if (sel.length === 0) {
          if (id === reqId.current) {
            setRows([]);
            setCount(0);
            setLoading(false);
          }
          return;
        }
        qy = qy.in('id', sel);
      }
    }

    const { data, count: total, error: err } = await qy;
    if (id !== reqId.current) return;
    if (err) setError(err.message);
    else {
      setRows((prev) => (offset ? [...prev, ...data] : data));
      setCount(total ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (ready) run(0);
  }, [ready, term, platform, scope, mine, showClosed]);

  async function setMark(id, value) {
    const next = { ...marksRef.current };
    if (value === 'none') delete next[id];
    else next[id] = value;
    marksRef.current = next;
    setMarks(next);
    setSyncMsg('');

    if (userId) {
      const res =
        value === 'none'
          ? await supabase.from('user_marks').delete().eq('project_id', id)
          : await supabase
              .from('user_marks')
              .upsert({ user_id: userId, project_id: id, mark: value }, { onConflict: 'user_id,project_id' });
      if (res.error) setSyncMsg('Status belum tersimpan: ' + res.error.message);
    } else {
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
    }
  }

  async function submitAuth(mode) {
    setBusy(true);
    setAuthMsg('');
    const creds = { email: email.trim(), password };
    const { data, error: err } =
      mode === 'signup'
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);
    setBusy(false);
    if (err) {
      setAuthMsg(err.message);
      return;
    }
    if (mode === 'signup' && !data.session) {
      setAuthMsg('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.');
      return;
    }
    setShowAuth(false);
    setPassword('');
  }

  if (!supabase) {
    return <p className="notice">Variabel environment Supabase belum diisi.</p>;
  }

  return (
    <section>
      <div className="auth">
        {user ? (
          <span>
            Masuk sebagai {user.email}.{' '}
            <button className="link" onClick={() => supabase.auth.signOut()}>
              Keluar
            </button>
          </span>
        ) : showAuth ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitAuth('signin');
            }}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="email"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (min. 6 karakter)"
              autoComplete="current-password"
              minLength={6}
              required
            />
            <button className="btn" type="submit" disabled={busy}>
              Masuk
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => submitAuth('signup')}>
              Daftar
            </button>
            {authMsg ? <p className="msg">{authMsg}</p> : null}
          </form>
        ) : (
          <span>
            Status lamaran tersimpan di browser ini saja.{' '}
            <button className="link" onClick={() => setShowAuth(true)}>
              Masuk agar tersinkron antar perangkat
            </button>
          </span>
        )}
        {syncMsg ? <p className="msg">{syncMsg}</p> : null}
      </div>

      <div className="bar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari proyek, tipe tugas, atau bahasa"
          aria-label="Cari proyek"
        />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Filter platform">
          <option value="">Semua platform</option>
          {platforms.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Filter lokasi">
          <option value="default">Indonesia + Worldwide</option>
          <option value="indonesia">Hanya Indonesia</option>
          <option value="all">Semua lokasi</option>
        </select>
        <select value={mine} onChange={(e) => setMine(e.target.value)} aria-label="Filter status lamaran">
          <option value="all">Semua status lamaran</option>
          <option value="none">Belum dilamar</option>
          <option value="applied">Sudah dilamar</option>
          <option value="process">Dalam proses</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Tampilkan yang sudah ditutup
        </label>
      </div>

      <p className="count" aria-live="polite">
        {loading && rows.length === 0 ? 'Memuat…' : `${count} proyek`}
      </p>

      {error ? (
        <p className="notice">Data belum bisa dimuat: {error}</p>
      ) : !loading && rows.length === 0 ? (
        <p className="notice">Tidak ada proyek yang cocok. Coba ubah atau hapus filter.</p>
      ) : (
        <ul className="list">
          {rows.map((p) => {
            const m = marks[p.id] || 'none';
            return (
              <li key={p.id} className="row">
                <a className="main" href={p.source_url} target="_blank" rel="noopener noreferrer">
                  <span className="name">{p.project_name}</span>
                  <span className="meta">
                    <b>{p.platform}</b>
                    <span className={`tag ${p.indonesia_status}`}>{TAG[p.indonesia_status] || TAG.unknown}</span>
                    {[p.task_type, p.language, p.pay].filter(Boolean).map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </span>
                </a>
                <span className="side">
                  <span>
                    <span className={`dot ${p.status === 'open' ? 'on' : ''}`} />
                    {p.status === 'open' ? 'Buka' : 'Ditutup'}
                  </span>
                  <select
                    className="mark"
                    data-mark={m}
                    value={m}
                    onChange={(e) => setMark(p.id, e.target.value)}
                    aria-label={`Status lamaran: ${p.project_name}`}
                  >
                    {Object.entries(MARKS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {p.last_seen ? <small>Dicek {FMT.format(new Date(p.last_seen))}</small> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {rows.length > 0 && rows.length < count ? (
        <button className="more" onClick={() => run(rows.length)} disabled={loading}>
          {loading ? 'Memuat…' : 'Muat lebih banyak'}
        </button>
      ) : null}
    </section>
  );
}
