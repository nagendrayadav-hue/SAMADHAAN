// Small localStorage-backed helpers so customer + office state survives a hard refresh.
const NS = "samaadhaan";
const CUSTOMER_KEY = `${NS}_customer`;
const DRAFT_KEY = `${NS}_ticket_draft`;
const DASH_KEY = `${NS}_dashboard`;

const read = (k) => {
  try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; }
};
const write = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
};

export const customerSession = {
  get: () => read(CUSTOMER_KEY),
  set: (v) => write(CUSTOMER_KEY, { ...v, saved_at: Date.now() }),
  clear: () => { try { localStorage.removeItem(CUSTOMER_KEY); } catch {} },
  patch: (patch) => {
    const cur = read(CUSTOMER_KEY) || {};
    write(CUSTOMER_KEY, { ...cur, ...patch, saved_at: Date.now() });
  },
};

export const ticketDraft = {
  get: (mobile) => {
    const all = read(DRAFT_KEY) || {};
    return all[mobile] || null;
  },
  set: (mobile, draft) => {
    const all = read(DRAFT_KEY) || {};
    all[mobile] = { ...draft, saved_at: Date.now() };
    write(DRAFT_KEY, all);
  },
  clear: (mobile) => {
    const all = read(DRAFT_KEY) || {};
    delete all[mobile];
    write(DRAFT_KEY, all);
  },
};

export const dashboardPrefs = {
  get: () => read(DASH_KEY) || {},
  patch: (patch) => {
    const cur = read(DASH_KEY) || {};
    write(DASH_KEY, { ...cur, ...patch });
  },
};
