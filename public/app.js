// ============================================================
// app.js — shared logic (multi-year)
// ============================================================

const sb = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const BRAND_NAME = 'Chocxo';
const BRAND_COLOR = '#6B3410';

const state = {
  catalog: [],
  sellerboard: [],   // all years
  ppc: [],           // all years
  selectedYear: null,
  selectedMonth: null,
  availableYears: [],  // sorted asc
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
  // No .eq('year', X) — load ALL years now.
  const [catRes, sbRes, ppcRes] = await Promise.all([
    sb.from('catalog').select('*'),
    sb.from('sellerboard_data').select('*'),
    sb.from('ppc_data').select('*'),
  ]);
  if (catRes.error) console.error('catalog:', catRes.error);
  if (sbRes.error)  console.error('sellerboard:', sbRes.error);
  if (ppcRes.error) console.error('ppc:', ppcRes.error);
  state.catalog = catRes.data || [];
  state.sellerboard = sbRes.data || [];
  state.ppc = ppcRes.data || [];
  state.loaded = true;

  // Derive available years from actual data
  const years = new Set();
  state.sellerboard.forEach(r => years.add(r.year));
  state.ppc.forEach(r => years.add(r.year));
  state.availableYears = Array.from(years).sort();
  if (!state.selectedYear) {
    state.selectedYear = state.availableYears[state.availableYears.length - 1] || 2026;
  }
}

// Single-brand rollup for a specific month+year
function rollupForMonth(month, year) {
  year = year || state.selectedYear;
  const sbRows = state.sellerboard.filter(r => r.month === month && r.year === year);
  const ppcRows = state.ppc.filter(r => r.month === month && r.year === year);

  const sessions = sbRows.reduce((a, r) => a + (r.sessions || 0), 0);
  const units = sbRows.reduce((a, r) => a + (r.units || 0), 0);
  const sales = sbRows.reduce((a, r) => a + (+r.gross_sales || 0), 0);
  const refundCost = sbRows.reduce((a, r) => a + Math.abs(+r.refunds || 0), 0);

  // Ad-metric source: PPC campaigns if available, else total_ad_spend from sellerboard
  const hasPpc = ppcRows.length > 0;
  const adSpendFromPpc = ppcRows.reduce((a, r) => a + (+r.spend || 0), 0);
  const adSpendFromTotals = sbRows.reduce((a, r) => a + (+r.total_ad_spend || 0), 0);
  const adSpend = hasPpc ? adSpendFromPpc : adSpendFromTotals;

  const adSales = ppcRows.reduce((a, r) => a + (+r.sales || 0), 0);
  const adOrders = ppcRows.reduce((a, r) => a + (r.orders || 0), 0);
  const impressions = ppcRows.reduce((a, r) => a + (r.impressions || 0), 0);
  const clicks = ppcRows.reduce((a, r) => a + (r.clicks || 0), 0);

  return {
    hasPpcDetail: hasPpc,        // true if campaign-level data exists
    hasAnyAdSpend: adSpend > 0,  // true if either source has data
    sessions, units, sales, refundCost,
    adSpend, adSales, adOrders, impressions, clicks,
    organicSales: hasPpc ? sales - adSales : null,  // can only compute when Ad Sales is known
    cvr:   sessions > 0 ? units / sessions : 0,
    acos:  hasPpc && adSales > 0 ? adSpend / adSales : null,  // undefined without ad sales
    tacos: sales > 0 ? adSpend / sales : 0,
    roas:  hasPpc && adSpend > 0 ? adSales / adSpend : null,
    ctr:   impressions > 0 ? clicks / impressions : 0,
    cpc:   clicks > 0 ? adSpend / clicks : 0,
  };
}

function priorMonth(month, year) {
  year = year || state.selectedYear;
  const idx = MONTHS.indexOf(month);
  if (idx > 0) return { month: MONTHS[idx - 1], year };
  // January → December of prior year
  return { month: 'December', year: year - 1 };
}

function priorYearSameMonth(month, year) {
  year = year || state.selectedYear;
  return { month, year: year - 1 };
}

// Returns true if any data exists for this month+year combo
function hasDataFor(month, year) {
  return state.sellerboard.some(r => r.month === month && r.year === year) ||
         state.ppc.some(r => r.month === month && r.year === year);
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

function setupSelectors(onChange) {
  const yearSel = document.getElementById('year-select');
  const monthSel = document.getElementById('month-select');
  if (!yearSel || !monthSel) return;

  // Populate year dropdown
  yearSel.innerHTML = '';
  state.availableYears.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === state.selectedYear) opt.selected = true;
    yearSel.appendChild(opt);
  });

  // Populate months for the selected year
  const rebuildMonths = () => {
    monthSel.innerHTML = '';
    const monthsWithData = new Set(
      state.sellerboard.filter(r => r.year === state.selectedYear).map(r => r.month)
    );
    // Default: most recent month with data in this year
    let defaultMonth = MONTHS[0];
    for (const m of MONTHS) {
      if (monthsWithData.has(m)) defaultMonth = m;
    }
    // If current selected month exists in this year, keep it; otherwise reset
    if (!monthsWithData.has(state.selectedMonth)) {
      state.selectedMonth = defaultMonth;
    }
    MONTHS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m + (monthsWithData.has(m) ? '' : ' (no data)');
      if (m === state.selectedMonth) opt.selected = true;
      monthSel.appendChild(opt);
    });
  };

  rebuildMonths();

  yearSel.addEventListener('change', () => {
    state.selectedYear = parseInt(yearSel.value, 10);
    rebuildMonths();
    onChange && onChange();
  });
  monthSel.addEventListener('change', () => {
    state.selectedMonth = monthSel.value;
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
