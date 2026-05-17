// ============================================================
// app.js — shared logic
// ============================================================

const sb = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const BRAND_NAME = 'Chocxo';
const BRAND_COLOR = '#6B3410';
const CURRENT_YEAR = 2026;

const state = {
  catalog: [],
  sellerboard: [],
  ppc: [],
  selectedMonth: null,
  user: null,
  loaded: false,
};

// Formatters
const fmtCurrency = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};
const fmtCurrency2 = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
};
const fmtNumber = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
};
const fmtPct = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
};
const fmtMult = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return n.toFixed(2) + 'x';
};

async function loadAllData() {
  const [catRes, sbRes, ppcRes] = await Promise.all([
    sb.from('catalog').select('*'),
    sb.from('sellerboard_data').select('*').eq('year', CURRENT_YEAR),
    sb.from('ppc_data').select('*').eq('year', CURRENT_YEAR),
  ]);
  if (catRes.error) console.error('catalog:', catRes.error);
  if (sbRes.error)  console.error('sellerboard:', sbRes.error);
  if (ppcRes.error) console.error('ppc:', ppcRes.error);
  state.catalog = catRes.data || [];
  state.sellerboard = sbRes.data || [];
  state.ppc = ppcRes.data || [];
  state.loaded = true;
}

// Single-brand rollup — returns one combined object for the selected month
function rollupForMonth(month) {
  const sbRows = state.sellerboard.filter(r => r.month === month);
  const ppcRows = state.ppc.filter(r => r.month === month);

  const sessions = sbRows.reduce((a, r) => a + (r.sessions || 0), 0);
  const units = sbRows.reduce((a, r) => a + (r.units || 0), 0);
  const sales = sbRows.reduce((a, r) => a + (+r.gross_sales || 0), 0);
  const refundCost = sbRows.reduce((a, r) => a + Math.abs(+r.refunds || 0), 0);
  const adSpend = ppcRows.reduce((a, r) => a + (+r.spend || 0), 0);
  const adSales = ppcRows.reduce((a, r) => a + (+r.sales || 0), 0);
  const adOrders = ppcRows.reduce((a, r) => a + (r.orders || 0), 0);
  const impressions = ppcRows.reduce((a, r) => a + (r.impressions || 0), 0);
  const clicks = ppcRows.reduce((a, r) => a + (r.clicks || 0), 0);

  return {
    sessions, units, sales, refundCost,
    adSpend, adSales, adOrders, impressions, clicks,
    organicSales: sales - adSales,
    cvr:   sessions > 0 ? units / sessions : 0,
    acos:  adSales > 0 ? adSpend / adSales : 0,
    tacos: sales > 0 ? adSpend / sales : 0,
    roas:  adSpend > 0 ? adSales / adSpend : 0,
    ctr:   impressions > 0 ? clicks / impressions : 0,
    cpc:   clicks > 0 ? adSpend / clicks : 0,
  };
}

function priorMonth(month) {
  const idx = MONTHS.indexOf(month);
  return idx <= 0 ? null : MONTHS[idx - 1];
}

async function getCurrentUser() {
  const { data } = await sb.auth.getUser();
  state.user = data.user;
  return data.user;
}

async function refreshAuthUI() {
  const user = await getCurrentUser();
  const statusEl = document.getElementById('auth-status');
  const linkEl = document.getElementById('admin-link');
  if (user) {
    if (statusEl) statusEl.textContent = user.email;
    if (linkEl) { linkEl.textContent = 'Admin Panel'; linkEl.href = '/admin'; }
  } else {
    if (statusEl) statusEl.textContent = '';
    if (linkEl) { linkEl.textContent = 'Admin'; linkEl.href = '/login'; }
  }
}

function setupMonthSelector(onChange) {
  const sel = document.getElementById('month-select');
  if (!sel) return;
  sel.innerHTML = '';
  const monthsWithData = new Set(state.sellerboard.map(r => r.month));
  let defaultMonth = MONTHS[0];
  for (const m of MONTHS) {
    if (monthsWithData.has(m)) defaultMonth = m;
  }
  state.selectedMonth = state.selectedMonth || defaultMonth;

  MONTHS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    if (!monthsWithData.has(m)) opt.textContent += ' (no data)';
    if (m === state.selectedMonth) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    state.selectedMonth = sel.value;
    onChange && onChange();
  });
}

function setupRouter(onRouteChange) {
  const route = () => onRouteChange(window.location.pathname);
  window.addEventListener('popstate', route);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('/')) return;
    if (a.target === '_blank' || a.hasAttribute('data-no-route')) return;
    e.preventDefault();
    window.history.pushState({}, '', href);
    route();
  });
  route();
}
