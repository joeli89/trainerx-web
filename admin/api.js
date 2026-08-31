// Minimal Supabase client (auth + PostgREST) — no dependencies.
// Sign-in is email OTP (same flow as the app). Tokens persist in localStorage
// and refresh automatically.

const CFG = window.TRAINERX_CONFIG;
const LS_KEY = 'trainerx_admin_session_v1';

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY));
  } catch {
    return null;
  }
}

function saveSession(s) {
  if (s) localStorage.setItem(LS_KEY, JSON.stringify(s));
  else localStorage.removeItem(LS_KEY);
}

let session = loadSession();

async function authFetch(path, body) {
  const res = await fetch(`${CFG.supabaseUrl}/auth/v1${path}`, {
    method: 'POST',
    headers: { apikey: CFG.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.msg || json.error_description || json.message || `Auth error ${res.status}`);
  }
  return json;
}

export const auth = {
  get session() {
    return session;
  },
  get userId() {
    return session?.user?.id ?? null;
  },
  async requestOtp(email) {
    await authFetch('/otp', { email, create_user: false });
  },
  async verifyOtp(email, token) {
    const json = await authFetch('/verify', { type: 'email', email, token });
    session = { access_token: json.access_token, refresh_token: json.refresh_token, user: json.user, expires_at: json.expires_at };
    saveSession(session);
    return session;
  },
  async refresh() {
    if (!session?.refresh_token) throw new Error('No session');
    const json = await authFetch('/token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    session = { access_token: json.access_token, refresh_token: json.refresh_token, user: json.user, expires_at: json.expires_at };
    saveSession(session);
    return session;
  },
  signOut() {
    session = null;
    saveSession(null);
  },
};

// PostgREST query. `path` is everything after /rest/v1/, e.g.
// "messages?select=id,content&order=created_at.desc&limit=50"
export async function rest(path, { retried = false } = {}) {
  if (!session) throw new Error('Not signed in');
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000 && !retried) {
    try {
      await auth.refresh();
    } catch {
      /* fall through — the request below will 401 and surface it */
    }
  }
  const res = await fetch(`${CFG.supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: CFG.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  if (res.status === 401 && !retried) {
    await auth.refresh();
    return rest(path, { retried: true });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Query failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

// Paged fetch — PostgREST caps responses at 1000 rows; walk offsets until done.
export async function restAll(path, { pageSize = 1000, maxRows = 20000 } = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const out = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const page = await rest(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    out.push(...page);
    if (page.length < pageSize) break;
  }
  return out;
}

// Create a short-lived URL for an object in a private Storage bucket. The
// dashboard never receives a service-role key: Storage applies the signed-in
// admin's SELECT policy before issuing the URL.
export async function storageSignedUrl(bucket, objectPath, expiresIn = 3600, { retried = false } = {}) {
  if (!session) throw new Error('Not signed in');
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000 && !retried) {
    try {
      await auth.refresh();
    } catch {
      /* fall through — the request below will 401 and surface it */
    }
  }

  const encodedPath = [bucket, ...String(objectPath).split('/')].map(encodeURIComponent).join('/');
  const storageBase = `${CFG.supabaseUrl}/storage/v1`;
  const res = await fetch(`${storageBase}/object/sign/${encodedPath}`, {
    method: 'POST',
    headers: {
      apikey: CFG.supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  if (res.status === 401 && !retried) {
    await auth.refresh();
    return storageSignedUrl(bucket, objectPath, expiresIn, { retried: true });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `Image access failed (${res.status})`);

  const signed = json.signedURL || json.signedUrl || json.signed_url;
  if (!signed) throw new Error('Storage did not return a signed image URL');
  if (/^https?:\/\//i.test(signed)) return signed;
  if (signed.startsWith('/storage/v1/')) return `${CFG.supabaseUrl}${signed}`;
  return `${storageBase}${signed.startsWith('/') ? '' : '/'}${signed}`;
}
