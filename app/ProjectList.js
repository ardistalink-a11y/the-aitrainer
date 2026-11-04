'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const PAGE = 24;
const KEY = 'digestai.marks';
const FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Jakarta',
});
const MARKS = {
  none: 'Not applied',
  applied: 'Applied',
  process: 'In process',
};
// Role dicocokkan dari kata kunci di judul / tipe tugas
const ROLES = {
  Transcription: ['transcri'],
  'Translation & Localization': ['translat', 'locali', 'linguist'],
  'Annotation & Labeling': ['annotat', 'label'],
  'Evaluation & Rating': ['evaluat', 'rater', 'rating'],
  'Quality Control': ['quality', 'qc', 'review'],
  'AI Trainer': ['trainer', 'ai train'],
  'Coding & Engineering': ['coding', 'developer', 'engineer', 'software', 'programm'],
  'Domain Expert': ['expert', 'finance', 'legal', 'medical', 'math', 'physics', 'chemistry', 'biology'],
  'Operations & Coordination': ['coordinator', 'operations', 'manager'],
};

function pageList(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const s = new Set([1, total, cur - 1, cur, cur + 1]);
  if (cur <= 3) [2, 3, 4].forEach((n) => s.add(n));
  if (cur >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => s.add(n));
  const arr = [...s].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out = [];
  arr.forEach((n, i) => {
    if (i && n - arr[i - 1] > 1) out.push('gap' + i);
    out.push(n);
  });
  return out;
}

export default function ProjectList() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [country, setCountry] = useState('all');
  const [countries, setCountries] = useState([]);
  const [role, setRole] = useState('');
  const [mine, setMine] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [page, setPage] = useState(1);
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
  const totalPages = Math.max(1, Math.ceil(count / PAGE));

  useEffect(() => {
    if (!supabase) return;
    supabase.from('projects').select('country_codes').then(({ data }) => {
      const codes = new Set((data || []).flatMap((row) => row.country_codes || []));
      setCountries([...codes].sort());
    });
  }, []);

  // Login session
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

  // Load application marks: from the account if signed in, else from this browser
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
    const t = setTimeout(() => {
      setTerm(q.trim().replace(/[,()%*]/g, ' ').trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function run() {
    if (!supabase) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    const offset = (page - 1) * PAGE;

    let qy = supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .order('last_seen', { ascending: false })
      .order('id')
      .range(offset, offset + PAGE - 1);

    if (!showClosed) qy = qy.eq('status', 'open');
    if (country === 'worldwide') qy = qy.eq('indonesia_status', 'worldwide');
    else if (country !== 'all') qy = qy.or(`country_codes.cs.{${country}},indonesia_status.eq.worldwide`);

    if (role) {
      const kws = ROLES[role] || [];
      qy = qy.or(
        kws.flatMap((k) => [`project_name.ilike.%${k}%`, `task_type.ilike.%${k}%`]).join(',')
      );
    }
    if (term) {
      qy = qy.or(
        `project_name.ilike.%${term}%,task_type.ilike.%${term}%,language.ilike.%${term}%,platform.ilike.%${term}%`
      );
    }

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
      setRows(data);
      setCount(total ?? 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (ready) run();
  }, [ready, term, country, role, mine, showClosed, page]);

  const change = (setter) => (v) => {
    setter(v);
    setPage(1);
  };

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
      if (res.error) setSyncMsg('Could not save status: ' + res.error.message);
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
      setAuthMsg('Account created. Check your email to confirm, then sign in.');
      return;
    }
    setShowAuth(false);
    setPassword('');
  }

  if (!supabase) {
    return <p className="notice">Supabase environment variables are not set.</p>;
  }

  return (
    <section>
      <div className="auth">
        {user ? (
          <span>
            Signed in as {user.email}.{' '}
            <button className="link" onClick={() => supabase.auth.signOut()}>
              Sign out
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
              placeholder="Password (min. 6 characters)"
              autoComplete="current-password"
              minLength={6}
              required
            />
            <button className="btn primary" type="submit" disabled={busy}>
              Sign in
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => submitAuth('signup')}>
              Sign up
            </button>
            {authMsg ? <p className="msg">{authMsg}</p> : null}
          </form>
        ) : (
          <span>
            Application status is saved in this browser only.{' '}
            <button className="link" onClick={() => setShowAuth(true)}>
              Sign in to sync across devices
            </button>
          </span>
        )}
        {syncMsg ? <p className="msg">{syncMsg}</p> : null}
      </div>

      <div className="toolbar">
        <div className="toolbar-top">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects, platforms, languages"
            aria-label="Search projects"
          />
          <select value={role} onChange={(e) => change(setRole)(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {Object.keys(ROLES).map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={mine} onChange={(e) => change(setMine)(e.target.value)} aria-label="Filter by application status">
            <option value="all">All statuses</option>
            <option value="none">Not applied</option>
            <option value="applied">Applied</option>
            <option value="process">In process</option>
          </select>
        </div>
        <div className="toolbar-bottom">
          <select value={country} onChange={(e) => change(setCountry)(e.target.value)} aria-label="Filter by country">
            <option value="all">All countries</option>
            {countries.map((code) => (
              <option key={code} value={code}>{new Intl.DisplayNames(['en'], { type: 'region' }).of(code)}</option>
            ))}
            {countries.length ? <option value="worldwide">Worldwide only</option> : null}
          </select>
          <label className="check">
            <input type="checkbox" checked={showClosed} onChange={(e) => change(setShowClosed)(e.target.checked)} />
            Show closed projects
          </label>
          <span className="count" aria-live="polite">
            {loading && rows.length === 0 ? 'Loading…' : `${count} project${count === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {error ? (
        <p className="notice">Could not load projects: {error}</p>
      ) : !loading && rows.length === 0 ? (
        <p className="notice">No projects match your filters. Try changing or clearing them.</p>
      ) : (
        <ul className="grid">
          {rows.map((p) => {
            const m = marks[p.id] || 'none';
            const closed = p.status !== 'open';
            const loc = p.raw_location || p.country || '';
            const chips = [p.task_type, p.language, p.pay].filter(Boolean);
            return (
              <li key={p.id} className={`card${closed ? ' closed' : ''}`}>
                <span className="platform">{p.platform}</span>
                <h2 className="name">
                  <a href={p.source_url} target="_blank" rel="noopener noreferrer">
                    {p.project_name}
                  </a>
                </h2>
                {loc ? (
                  <p className="loc" title={loc}>
                    {loc}
                  </p>
                ) : null}
                {chips.length ? (
                  <div className="chips">
                    {chips.map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                ) : null}
                <div className="foot-row">
                  {closed ? (
                    <span className="badge">Closed</span>
                  ) : (
                    <select
                      className="mark"
                      data-mark={m}
                      value={m}
                      onChange={(e) => setMark(p.id, e.target.value)}
                      aria-label={`Application status: ${p.project_name}`}
                    >
                      {Object.entries(MARKS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  )}
                  {p.last_seen ? <small>Checked {FMT.format(new Date(p.last_seen))}</small> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            disabled={page === 1}
            onClick={() => {
              setPage(page - 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Prev
          </button>
          {pageList(page, totalPages).map((n) =>
            typeof n === 'string' ? (
              <span key={n} className="gap">
                …
              </span>
            ) : (
              <button
                key={n}
                className={n === page ? 'on' : ''}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => {
                  setPage(n);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {n}
              </button>
            )
          )}
          <button
            disabled={page === totalPages}
            onClick={() => {
              setPage(page + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
