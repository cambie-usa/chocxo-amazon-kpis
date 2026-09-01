// ============================================================
// app.js — shared logic (multi-year + multi-channel)
// ============================================================

const sb = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const BRAND_NAME = 'Chocxo';
const BRAND_COLOR = '#6B3410';

// Chocxo does not sell May–September (chocolate shipping heat pause)
const SEASONAL_PAUSE_MONTHS = new Set(['May','June','July','August','September']);

const state = {
  catalog: [],           // legacy Amazon-only catalog (ASIN keyed)
  sellerboard: [],
  ppc: [],
  webSales: [],          // CIN7
  webAds: [],            // Meta
  products: [],          // master products
  variants: [],          // one row per SKU × channel
  selectedYear: null,
  selectedMonth: null,
  availableYears: [],
  user: null,
  loaded: false,
};

// ============================================================
// Formatters
// ============================================================
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
const fmtNumber2 = (n) => {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};
const fmtPct = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
};
const fmtDecimal = (n) => {
  // ROAS/MER — decimal with 2 places, no "x"
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return n.toFixed(2);
};
const fmtMult = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return n.toFixed(2) + 'x';
};

// ============================================================
// Data load — everything
// ============================================================
async function loadAllData() {
  const [catRes, sbRes, ppcRes, webSalesRes, webAdsRes, prodRes, varRes] = await Promise.all([
    sb.from('catalog').select('*'),
    sb.from('sellerboard_data').select('*'),
    sb.from('ppc_data').select('*'),
    sb.from('web_sales_data').select('*'),
    sb.from('web_ads_data').select('*'),
    sb.from('products').select('*'),
    sb.from('variants').select('*'),
  ]);
  if (catRes.error) console.error('catalog:', catRes.error);
  if (sbRes.error) console.error('sellerboard:', sbRes.error);
  if (ppcRes.error) console.error('ppc:', ppcRes.error);
  if (webSalesRes.error) console.error('web_sales:', webSalesRes.error);
  if (webAdsRes.error) console.error('web_ads:', webAdsRes.error);
  if (prodRes.error) console.error('products:', prodRes.error);
  if (varRes.error) console.error('variants:', varRes.error);
  state.catalog = catRes.data || [];
  state.sellerboard = sbRes.data || [];
  state.ppc = ppcRes.data || [];
  state.webSales = webSalesRes.data || [];
  state.webAds = webAdsRes.data || [];
  state.products = prodRes.data || [];
  state.variants = varRes.data || [];
  state.loaded = true;

  const years = new Set();
  state.sellerboard.forEach(r => years.add(r.year));
  state.ppc.forEach(r => years.add(r.year));
  state.webSales.forEach(r => years.add(r.year));
  state.webAds.forEach(r => years.add(r.year));
  state.availableYears = Array.from(years).sort();
  if (!state.selectedYear) {
    state.selectedYear = state.availableYears[state.availableYears.length - 1] || new Date().getFullYear();
  }
}

// ============================================================
// Rollups — Amazon channel (existing)
// ============================================================
function amazonRollupForMonth(month, year) {
  year = year || state.selectedYear;
  const sbRows = state.sellerboard.filter(r => r.month === month && r.year === year);
  const ppcRows = state.ppc.filter(r => r.month === month && r.year === year);

  const sessions = sbRows.reduce((a, r) => a + (r.sessions || 0), 0);
  const units = sbRows.reduce((a, r) => a + (r.units || 0), 0);
  const sales = sbRows.reduce((a, r) => a + (+r.gross_sales || 0), 0);
  const refundCost = sbRows.reduce((a, r) => a + Math.abs(+r.refunds || 0), 0);

  const hasPpc = ppcRows.length > 0;
  const adSpendFromPpc = ppcRows.reduce((a, r) => a + (+r.spend || 0), 0);
  const adSpendFromTotals = sbRows.reduce((a, r) => a + (+r.total_ad_spend || 0), 0);
  const adSpend = hasPpc ? adSpendFromPpc : adSpendFromTotals;
  const adSales = ppcRows.reduce((a, r) => a + (+r.sales || 0), 0);
  const adOrders = ppcRows.reduce((a, r) => a + (r.orders || 0), 0);
  const impressions = ppcRows.reduce((a, r) => a + (r.impressions || 0), 0);
  const clicks = ppcRows.reduce((a, r) => a + (r.clicks || 0), 0);

  return {
    hasPpcDetail: hasPpc,
    hasAnyAdSpend: adSpend > 0,
    hasData: sbRows.length > 0 || ppcRows.length > 0,
    sessions, units, sales, refundCost,
    adSpend, adSales, adOrders, impressions, clicks,
    organicSales: hasPpc ? sales - adSales : null,
    cvr:   sessions > 0 ? units / sessions : 0,
    acos:  hasPpc && adSales > 0 ? adSpend / adSales : null,
    tacos: sales > 0 ? adSpend / sales : 0,
    roas:  hasPpc && adSpend > 0 ? adSales / adSpend : null,
    ctr:   impressions > 0 ? clicks / impressions : 0,
    cpc:   clicks > 0 ? adSpend / clicks : 0,
  };
}

// ============================================================
// Rollups — Website channel (CIN7 + Meta)
// ============================================================
function webRollupForMonth(month, year) {
  year = year || state.selectedYear;
  const salesRows = state.webSales.filter(r => r.month === month && r.year === year);
  const adRows = state.webAds.filter(r => r.month === month && r.year === year);

  const singles = salesRows.reduce((a, r) => a + (r.quantity_singles || 0), 0);
  const sales = salesRows.reduce((a, r) => a + (+r.sales || 0), 0);
  const cogs = salesRows.reduce((a, r) => a + (+r.cogs || 0), 0);
  const profit = salesRows.reduce((a, r) => a + (+r.profit || 0), 0);

  const metaSpend = adRows.reduce((a, r) => a + (+r.spend || 0), 0);
  const metaValue = adRows.reduce((a, r) => a + (+r.purchase_value || 0), 0);
  const metaImpr = adRows.reduce((a, r) => a + (r.impressions || 0), 0);
  const metaClicks = adRows.reduce((a, r) => a + (r.link_clicks || 0), 0);
  const metaPurchases = adRows.reduce((a, r) => a + (r.purchases || 0), 0);

  const cases = singles / 6;

  return {
    hasData: salesRows.length > 0 || adRows.length > 0,
    hasSales: salesRows.length > 0,
    hasAds: metaSpend > 0,  // April had ad rows but $0 spend
    singles,
    cases,
    sales,
    cogs,
    profit,
    grossMargin: sales > 0 ? profit / sales : null,
    aov: metaPurchases > 0 ? sales / metaPurchases : null,   // proxy: web sales / meta purchases
    metaSpend,
    metaValue,
    metaImpr,
    metaClicks,
    metaPurchases,
    metaCtr: metaImpr > 0 ? metaClicks / metaImpr : 0,
    metaCpc: metaClicks > 0 ? metaSpend / metaClicks : 0,
    roas: metaSpend > 0 ? metaValue / metaSpend : null,       // decimal (2 places)
    mer:  metaSpend > 0 ? sales / metaSpend : null,           // decimal (2 places) — total web sales / meta spend
  };
}

// ============================================================
// Rollups — Combined (Amazon + Web)
// ============================================================
function combinedRollupForMonth(month, year) {
  year = year || state.selectedYear;
  const amz = amazonRollupForMonth(month, year);
  const web = webRollupForMonth(month, year);
  const totalSales = amz.sales + web.sales;
  const totalAdSpend = amz.adSpend + web.metaSpend;
  return {
    hasData: amz.hasData || web.hasData,
    isSeasonalPause: SEASONAL_PAUSE_MONTHS.has(month) && !amz.hasData && !web.hasData,
    amazon: amz,
    web: web,
    totalSales,
    amazonSales: amz.sales,
    webSales: web.sales,
    amazonAdSpend: amz.adSpend,
    metaSpend: web.metaSpend,
    totalAdSpend,
    // Blended MER = total revenue across channels / total ad spend across channels
    blendedMer: totalAdSpend > 0 ? totalSales / totalAdSpend : null,
    amazonShare: totalSales > 0 ? amz.sales / totalSales : null,
    webShare: totalSales > 0 ? web.sales / totalSales : null,
  };
}

// ============================================================
// Product rollup — combines Amazon + Web variants into case-equivalents
// ============================================================
function productRollupsForMonth(month, year) {
  year = year || state.selectedYear;
  // Group variants by product
  const varsByProduct = {};
  state.variants.forEach(v => {
    if (!varsByProduct[v.product_id]) varsByProduct[v.product_id] = [];
    varsByProduct[v.product_id].push(v);
  });

  const productList = state.products.map(p => {
    const variants = varsByProduct[p.product_id] || [];
    const amazonVariant = variants.find(v => v.channel === 'amazon');
    const webVariant = variants.find(v => v.channel === 'web');

    // Amazon side
    let amzUnits = 0, amzSales = 0, amzRefunds = 0, amzSessions = 0;
    if (amazonVariant && amazonVariant.asin) {
      const sbRow = state.sellerboard.find(r =>
        r.asin === amazonVariant.asin && r.month === month && r.year === year);
      if (sbRow) {
        amzUnits = sbRow.units || 0;              // Amazon "units" = cases
        amzSales = +sbRow.gross_sales || 0;
        amzRefunds = Math.abs(+sbRow.refunds || 0);
        amzSessions = sbRow.sessions || 0;
      }
    }

    // Web side
    let webSingles = 0, webSales = 0, webCogs = 0, webProfit = 0;
    if (webVariant) {
      const wsRow = state.webSales.find(r =>
        r.sku === webVariant.sku && r.month === month && r.year === year);
      if (wsRow) {
        webSingles = wsRow.quantity_singles || 0;
        webSales = +wsRow.sales || 0;
        webCogs = +wsRow.cogs || 0;
        webProfit = +wsRow.profit || 0;
      }
    }

    // Case-equivalents: Amazon units are already cases; web singles ÷ 6
    const webCaseEq = webSingles / 6;
    const totalCaseEq = amzUnits + webCaseEq;
    const totalSales = amzSales + webSales;

    return {
      product_id: p.product_id,
      product_name: p.product_name,
      active: p.active,
      amazon_sku: amazonVariant?.sku || null,
      amazon_asin: amazonVariant?.asin || null,
      web_sku: webVariant?.sku || null,
      // Amazon
      amzUnits, amzSales, amzRefunds, amzSessions,
      // Web
      webSingles, webCaseEq, webSales, webCogs, webProfit,
      webGrossMargin: webSales > 0 ? webProfit / webSales : null,
      // Combined
      totalCaseEq,
      totalSales,
      amazonSharePct: totalSales > 0 ? amzSales / totalSales : null,
      webSharePct:    totalSales > 0 ? webSales / totalSales : null,
    };
  });

  return productList;
}

// ============================================================
// Time helpers
// ============================================================
function priorMonth(month, year) {
  year = year || state.selectedYear;
  const idx = MONTHS.indexOf(month);
  if (idx > 0) return { month: MONTHS[idx - 1], year };
  return { month: 'December', year: year - 1 };
}

function priorYearSameMonth(month, year) {
  year = year || state.selectedYear;
  return { month, year: year - 1 };
}

// Returns true if any of the four tables have data for this month+year
function hasAnyData(month, year) {
  return state.sellerboard.some(r => r.month === month && r.year === year) ||
         state.ppc.some(r => r.month === month && r.year === year) ||
         state.webSales.some(r => r.month === month && r.year === year) ||
         state.webAds.some(r => r.month === month && r.year === year);
}

// ============================================================
// Auth
// ============================================================
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

  yearSel.innerHTML = '';
  state.availableYears.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    if (y === state.selectedYear) opt.selected = true;
    yearSel.appendChild(opt);
  });

  const rebuildMonths = () => {
    monthSel.innerHTML = '';
    const monthsWithData = new Set();
    state.sellerboard.filter(r => r.year === state.selectedYear).forEach(r => monthsWithData.add(r.month));
    state.webSales.filter(r => r.year === state.selectedYear).forEach(r => monthsWithData.add(r.month));
    let defaultMonth = MONTHS[0];
    for (const m of MONTHS) {
      if (monthsWithData.has(m)) defaultMonth = m;
    }
    if (!monthsWithData.has(state.selectedMonth)) {
      state.selectedMonth = defaultMonth;
    }
    MONTHS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      let label = m;
      if (!monthsWithData.has(m)) {
        if (SEASONAL_PAUSE_MONTHS.has(m)) label += ' (seasonal pause)';
        else label += ' (no data)';
      }
      opt.textContent = label;
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
