// ============================================================
// dashboard.js — renders all 6 pages
// ============================================================

// Router mapping paths to page IDs + render function
const ROUTES = {
  '/':          { pageId: 'dashboard-page', render: renderDashboardPage },
  '/amazon':    { pageId: 'amazon-page',    render: renderAmazonPage },
  '/website':   { pageId: 'website-page',   render: renderWebsitePage },
  '/combined':  { pageId: 'combined-page',  render: renderCombinedPage },
  '/products':  { pageId: 'products-page',  render: renderProductsPage },
  '/trends':    { pageId: 'trends-page',    render: renderTrendsPage },
};

let currentRoute = '/';
let salesChart = null;
let combinedChart = null;

// ============================================================
// Router
// ============================================================
function onRouteChange(path) {
  currentRoute = ROUTES[path] ? path : '/';
  // Hide all pages
  document.querySelectorAll('[id$="-page"]').forEach(el => el.classList.add('hidden'));
  // Show current
  const cfg = ROUTES[currentRoute];
  document.getElementById(cfg.pageId).classList.remove('hidden');
  // Highlight nav
  document.querySelectorAll('nav a').forEach(a => {
    const isActive = a.getAttribute('href') === currentRoute;
    a.classList.toggle('bg-white/10', isActive);
  });
  // Render
  cfg.render();
}

function rerenderCurrentPage() {
  ROUTES[currentRoute].render();
}

// ============================================================
// Dashboard (home)
// ============================================================
function renderDashboardPage() {
  const m = state.selectedMonth;
  const y = state.selectedYear;
  const comb = combinedRollupForMonth(m, y);

  // Seasonal banner
  const banner = document.getElementById('seasonal-banner');
  if (comb.isSeasonalPause) banner.classList.remove('hidden');
  else banner.classList.add('hidden');

  // Channel tiles
  renderChannelTile('tile-combined', 'Combined', comb.totalSales, [
    ['Amazon', fmtCurrency(comb.amazonSales)],
    ['Website', fmtCurrency(comb.webSales)],
    ['Total Ad Spend', fmtCurrency(comb.totalAdSpend)],
    ['Blended MER', fmtDecimal(comb.blendedMer)],
  ]);
  renderChannelTile('tile-amazon', 'Amazon', comb.amazon.sales, [
    ['Cases sold', fmtNumber(comb.amazon.units)],
    ['Sessions', fmtNumber(comb.amazon.sessions)],
    ['Ad Spend', fmtCurrency(comb.amazon.adSpend)],
    ['TACoS', fmtPct(comb.amazon.tacos)],
  ]);
  renderChannelTile('tile-website', 'Website', comb.web.sales, [
    ['Cases (equiv.)', fmtNumber2(comb.web.cases)],
    ['Singles', fmtNumber(comb.web.singles)],
    ['Meta Spend', fmtCurrency(comb.web.metaSpend)],
    ['MER', fmtDecimal(comb.web.mer)],
  ]);

  // MoM
  const priorM = priorMonth(m, y);
  const priorComb = combinedRollupForMonth(priorM.month, priorM.year);
  renderComparisonGrid('dashboard-mom', 'vs. ' + priorM.month + ' ' + priorM.year, [
    ['Total Sales',   comb.totalSales,   priorComb.totalSales,   'currency'],
    ['Amazon Sales',  comb.amazonSales,  priorComb.amazonSales,  'currency'],
    ['Web Sales',     comb.webSales,     priorComb.webSales,     'currency'],
    ['Ad Spend',      comb.totalAdSpend, priorComb.totalAdSpend, 'currency-invert'],
    ['Blended MER',   comb.blendedMer,   priorComb.blendedMer,   'decimal'],
  ]);

  // YoY
  const priorY = priorYearSameMonth(m, y);
  const priorYearComb = combinedRollupForMonth(priorY.month, priorY.year);
  const hasYoy = priorYearComb.hasData;
  if (hasYoy) {
    renderComparisonGrid('dashboard-yoy', 'vs. ' + priorY.month + ' ' + priorY.year, [
      ['Total Sales',   comb.totalSales,   priorYearComb.totalSales,   'currency'],
      ['Amazon Sales',  comb.amazonSales,  priorYearComb.amazonSales,  'currency'],
      ['Web Sales',     comb.webSales,     priorYearComb.webSales,     'currency'],
      ['Ad Spend',      comb.totalAdSpend, priorYearComb.totalAdSpend, 'currency-invert'],
      ['Blended MER',   comb.blendedMer,   priorYearComb.blendedMer,   'decimal'],
    ]);
  } else {
    document.getElementById('dashboard-yoy').innerHTML =
      '<p class="text-slate-500 text-sm">No prior-year data available for this month.</p>';
  }

  // Sales chart
  renderSalesChart(y);
  document.getElementById('chart-year-label').textContent = y;
  document.getElementById('footer-updated').textContent = new Date().toLocaleDateString();
}

function renderChannelTile(id, label, headlineValue, subrows) {
  const el = document.getElementById(id);
  const rows = subrows.map(([k, v]) =>
    `<div class="flex justify-between text-sm"><span class="text-slate-500">${k}</span><span class="font-semibold text-navy">${v}</span></div>`
  ).join('');
  el.innerHTML = `
    <div class="text-3xl font-bold text-navy mb-3">${fmtCurrency(headlineValue)}</div>
    ${rows}
  `;
}

function renderComparisonGrid(id, subtitle, rows) {
  const el = document.getElementById(id);
  const html = [
    `<div class="text-xs text-slate-500 mb-1">${subtitle}</div>`,
  ];
  rows.forEach(([label, cur, prev, type]) => {
    let curDisplay, prevDisplay, delta = null, deltaClass = '';
    if (type === 'currency') { curDisplay = fmtCurrency(cur); prevDisplay = fmtCurrency(prev); }
    else if (type === 'currency-invert') { curDisplay = fmtCurrency(cur); prevDisplay = fmtCurrency(prev); }
    else if (type === 'decimal') { curDisplay = fmtDecimal(cur); prevDisplay = fmtDecimal(prev); }
    else if (type === 'pct') { curDisplay = fmtPct(cur); prevDisplay = fmtPct(prev); }
    else { curDisplay = fmtNumber(cur); prevDisplay = fmtNumber(prev); }

    if (prev != null && prev !== 0 && cur != null && !isNaN(cur)) {
      const pct = (cur - prev) / Math.abs(prev);
      const sign = pct >= 0 ? '+' : '';
      delta = `${sign}${(pct * 100).toFixed(1)}%`;
      const goodUp = type !== 'currency-invert';
      deltaClass = ((pct >= 0) === goodUp) ? 'text-good' : 'text-bad';
    }
    html.push(`
      <div class="grid grid-cols-3 items-center gap-2 py-1 border-b border-slate-100 last:border-b-0">
        <span class="text-slate-600">${label}</span>
        <span class="font-semibold text-navy text-right">${curDisplay}</span>
        <span class="text-right">
          <span class="text-slate-400 text-xs mr-1">${prevDisplay}</span>
          ${delta ? `<span class="${deltaClass} text-xs font-semibold">${delta}</span>` : ''}
        </span>
      </div>
    `);
  });
  el.innerHTML = html.join('');
}

function renderSalesChart(year) {
  const ctx = document.getElementById('sales-chart');
  if (!ctx) return;
  if (salesChart) salesChart.destroy();
  const amzData = MONTHS.map(m => amazonRollupForMonth(m, year).sales);
  const webData = MONTHS.map(m => webRollupForMonth(m, year).sales);
  salesChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTHS.map(m => m.slice(0,3)),
      datasets: [
        { label: 'Amazon', data: amzData, backgroundColor: '#2E86AB' },
        { label: 'Website', data: webData, backgroundColor: '#C9A961' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}` } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => fmtCurrency(v) } },
      },
    },
  });
}

// ============================================================
// Amazon Page
// ============================================================
function renderAmazonPage() {
  const m = state.selectedMonth;
  const y = state.selectedYear;
  const amz = amazonRollupForMonth(m, y);
  const isPause = SEASONAL_PAUSE_MONTHS.has(m) && !amz.hasData;

  document.getElementById('amazon-seasonal-banner').classList.toggle('hidden', !isPause);

  document.getElementById('amz-sales').textContent = fmtCurrency(amz.sales);
  document.getElementById('amz-adspend').textContent = fmtCurrency(amz.adSpend);
  document.getElementById('amz-units').textContent = fmtNumber(amz.units);

  const priorM = priorMonth(m, y);
  const priorAmz = amazonRollupForMonth(priorM.month, priorM.year);
  const momEl = document.getElementById('amz-mom');
  if (priorAmz.sales > 0) {
    const pct = (amz.sales - priorAmz.sales) / priorAmz.sales;
    momEl.textContent = (pct >= 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
    momEl.className = 'text-3xl font-bold mt-2 ' + (pct >= 0 ? 'text-good' : 'text-bad');
  } else {
    momEl.textContent = '—';
    momEl.className = 'text-3xl font-bold text-navy mt-2';
  }

  // KPI grid — 16 metrics
  const kpiRows = [
    ['Sessions',    fmtNumber(amz.sessions)],
    ['Cases sold',  fmtNumber(amz.units)],
    ['Sales',       fmtCurrency(amz.sales)],
    ['Refund cost', fmtCurrency(amz.refundCost)],
    ['CVR',         fmtPct(amz.cvr)],
    ['Organic Sales', amz.organicSales != null ? fmtCurrency(amz.organicSales) : '—'],
    ['Ad Sales',    amz.hasPpcDetail ? fmtCurrency(amz.adSales) : '—'],
    ['Ad Orders',   amz.hasPpcDetail ? fmtNumber(amz.adOrders) : '—'],
    ['Ad Spend',    fmtCurrency(amz.adSpend)],
    ['Impressions', amz.hasPpcDetail ? fmtNumber(amz.impressions) : '—'],
    ['Clicks',      amz.hasPpcDetail ? fmtNumber(amz.clicks) : '—'],
    ['CTR',         amz.hasPpcDetail ? fmtPct(amz.ctr) : '—'],
    ['CPC',         amz.hasPpcDetail ? fmtCurrency2(amz.cpc) : '—'],
    ['ACoS',        amz.acos != null ? fmtPct(amz.acos) : '—'],
    ['TACoS',       fmtPct(amz.tacos)],
    ['ROAS',        amz.roas != null ? fmtDecimal(amz.roas) : '—'],
  ];
  document.getElementById('amz-kpi-grid').innerHTML = kpiRows.map(([k, v]) =>
    `<div class="flex justify-between border-b border-slate-100 pb-2"><span class="text-slate-500">${k}</span><span class="font-semibold text-navy">${v}</span></div>`
  ).join('');

  // Top SKUs
  const sbRows = state.sellerboard.filter(r => r.month === m && r.year === y);
  const catByAsin = {};
  state.catalog.forEach(c => catByAsin[c.asin] = c);
  const topRows = sbRows
    .map(r => ({
      ...r,
      productName: catByAsin[r.asin]?.product_name || '—',
      sku: catByAsin[r.asin]?.internal_sku || r.asin,
      cvr: r.sessions > 0 ? r.units / r.sessions : 0,
    }))
    .sort((a, b) => (+b.gross_sales || 0) - (+a.gross_sales || 0));

  document.getElementById('amz-top-pill').textContent = `${m} ${y} · ${topRows.length} SKUs`;
  document.getElementById('amz-top-body').innerHTML = topRows.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-cream' : 'bg-white'} border-b border-slate-100">
      <td class="px-3 py-2 font-mono text-xs">${r.sku}</td>
      <td class="px-3 py-2 text-xs">${r.productName}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.units)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.sessions)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.cvr)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(+r.gross_sales)}</td>
      <td class="px-3 py-2 text-right text-bad">${fmtCurrency(Math.abs(+r.refunds || 0))}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" class="px-3 py-6 text-center text-slate-400">No Amazon sales for ${m} ${y}</td></tr>`;

  // PPC Detail
  const ppcRows = state.ppc.filter(r => r.month === m && r.year === y);
  document.getElementById('amz-ppc-pill').textContent = `${m} ${y} · ${ppcRows.length} campaigns`;
  const ppcEmpty = document.getElementById('amz-ppc-empty');
  const ppcBody = document.getElementById('amz-ppc-body');
  if (!ppcRows.length) {
    ppcEmpty.classList.remove('hidden');
    ppcBody.innerHTML = '';
  } else {
    ppcEmpty.classList.add('hidden');
    const sorted = ppcRows.slice().sort((a, b) => (+b.spend || 0) - (+a.spend || 0));
    ppcBody.innerHTML = sorted.map((r, i) => {
      const spend = +r.spend || 0, sales = +r.sales || 0, clicks = r.clicks || 0, impr = r.impressions || 0;
      const ctr = impr > 0 ? clicks / impr : 0;
      const acos = sales > 0 ? spend / sales : null;
      const roas = spend > 0 ? sales / spend : null;
      return `
        <tr class="${i % 2 === 0 ? 'bg-cream' : 'bg-white'} border-b border-slate-100">
          <td class="px-3 py-2 text-xs">${r.campaign}</td>
          <td class="px-3 py-2 text-center text-xs">${r.ad_type || '—'}</td>
          <td class="px-3 py-2 text-right">${fmtNumber(impr)}</td>
          <td class="px-3 py-2 text-right">${fmtNumber(clicks)}</td>
          <td class="px-3 py-2 text-right">${fmtPct(ctr)}</td>
          <td class="px-3 py-2 text-right">${fmtCurrency2(spend)}</td>
          <td class="px-3 py-2 text-right">${fmtNumber(r.orders || 0)}</td>
          <td class="px-3 py-2 text-right font-semibold">${fmtCurrency2(sales)}</td>
          <td class="px-3 py-2 text-right">${acos != null ? fmtPct(acos) : '—'}</td>
          <td class="px-3 py-2 text-right">${roas != null ? fmtDecimal(roas) : '—'}</td>
        </tr>
      `;
    }).join('');
  }
}

// ============================================================
// Website Page
// ============================================================
function renderWebsitePage() {
  const m = state.selectedMonth;
  const y = state.selectedYear;
  const web = webRollupForMonth(m, y);
  const isPause = SEASONAL_PAUSE_MONTHS.has(m) && !web.hasData;

  document.getElementById('web-seasonal-banner').classList.toggle('hidden', !isPause);

  document.getElementById('web-sales').textContent = fmtCurrency(web.sales);
  document.getElementById('web-meta-spend').textContent = fmtCurrency(web.metaSpend);
  document.getElementById('web-cases').textContent = fmtNumber2(web.cases);
  document.getElementById('web-mer').textContent = fmtDecimal(web.mer);

  // KPI grid (sales-only — no COGS/profit/margin)
  const kpiRows = [
    ['Web Sales',    fmtCurrency(web.sales)],
    ['Singles sold', fmtNumber(web.singles)],
    ['Case-equiv.',  fmtNumber2(web.cases)],
    ['Meta Spend',   fmtCurrency(web.metaSpend)],
    ['Meta Impr',    fmtNumber(web.metaImpr)],
    ['Meta Clicks',  fmtNumber(web.metaClicks)],
    ['Meta CTR',     fmtPct(web.metaCtr)],
    ['Meta CPC',     web.metaCpc > 0 ? fmtCurrency2(web.metaCpc) : '—'],
    ['Meta Purchases', fmtNumber(web.metaPurchases)],
    ['Attributed Value', fmtCurrency(web.metaValue)],
    ['ROAS (attrib.)', fmtDecimal(web.roas)],
    ['MER (total)',  fmtDecimal(web.mer)],
  ];
  document.getElementById('web-kpi-grid').innerHTML = kpiRows.map(([k, v]) =>
    `<div class="flex justify-between border-b border-slate-100 pb-2"><span class="text-slate-500">${k}</span><span class="font-semibold text-navy">${v}</span></div>`
  ).join('');

  // Top web SKUs
  const salesRows = state.webSales.filter(r => r.month === m && r.year === y);
  // Build variant → product name lookup
  const variantByWebSku = {};
  state.variants.filter(v => v.channel === 'web').forEach(v => variantByWebSku[v.sku] = v);
  const productById = {};
  state.products.forEach(p => productById[p.product_id] = p);

  const topRows = salesRows
    .map(r => {
      const v = variantByWebSku[r.sku];
      const p = v ? productById[v.product_id] : null;
      return {
        ...r,
        productName: p?.product_name || '—',
        caseEq: (r.quantity_singles || 0) / 6,
      };
    })
    .sort((a, b) => (+b.sales || 0) - (+a.sales || 0));

  document.getElementById('web-top-pill').textContent = `${m} ${y} · ${topRows.length} SKUs`;
  document.getElementById('web-top-body').innerHTML = topRows.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-cream' : 'bg-white'} border-b border-slate-100">
      <td class="px-3 py-2 font-mono text-xs">${r.sku}</td>
      <td class="px-3 py-2 text-xs">${r.productName}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.quantity_singles)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber2(r.caseEq)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(+r.sales)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" class="px-3 py-6 text-center text-slate-400">No web sales for ${m} ${y}</td></tr>`;

  // Meta Ads detail
  const adRows = state.webAds.filter(r => r.month === m && r.year === y);
  document.getElementById('web-meta-pill').textContent = `${m} ${y} · ${adRows.length} ads`;
  const metaEmpty = document.getElementById('web-meta-empty');
  const metaBody = document.getElementById('web-meta-body');
  if (!adRows.length) {
    metaEmpty.classList.remove('hidden');
    metaBody.innerHTML = '';
  } else {
    metaEmpty.classList.add('hidden');
    const sorted = adRows.slice().sort((a, b) => (+b.spend || 0) - (+a.spend || 0));
    metaBody.innerHTML = sorted.map((r, i) => {
      const spend = +r.spend || 0, val = +r.purchase_value || 0;
      const clicks = r.link_clicks || 0, impr = r.impressions || 0;
      const ctr = impr > 0 ? clicks / impr : 0;
      const roas = spend > 0 ? val / spend : null;
      return `
        <tr class="${i % 2 === 0 ? 'bg-cream' : 'bg-white'} border-b border-slate-100">
          <td class="px-3 py-2 text-xs">${r.ad_name}</td>
          <td class="px-3 py-2 text-right">${fmtCurrency2(spend)}</td>
          <td class="px-3 py-2 text-right">${fmtNumber(impr)}</td>
          <td class="px-3 py-2 text-right">${fmtNumber(clicks)}</td>
          <td class="px-3 py-2 text-right">${fmtPct(ctr)}</td>
          <td class="px-3 py-2 text-right">${fmtNumber(r.purchases)}</td>
          <td class="px-3 py-2 text-right">${fmtCurrency2(val)}</td>
          <td class="px-3 py-2 text-right">${roas != null ? fmtDecimal(roas) : '—'}</td>
        </tr>
      `;
    }).join('');
  }
}

// ============================================================
// Combined Page
// ============================================================
function renderCombinedPage() {
  const m = state.selectedMonth;
  const y = state.selectedYear;
  const comb = combinedRollupForMonth(m, y);

  document.getElementById('combined-seasonal-banner').classList.toggle('hidden', !comb.isSeasonalPause);

  document.getElementById('comb-total-sales').textContent = fmtCurrency(comb.totalSales);
  document.getElementById('comb-amz-share').textContent = fmtPct(comb.amazonShare);
  document.getElementById('comb-web-share').textContent = fmtPct(comb.webShare);
  document.getElementById('comb-mer').textContent = fmtDecimal(comb.blendedMer);

  // Breakdown table
  const rows = [
    ['Sales',        fmtCurrency(comb.amazon.sales),  fmtCurrency(comb.web.sales),  fmtCurrency(comb.totalSales)],
    ['Cases',        fmtNumber(comb.amazon.units),    fmtNumber2(comb.web.cases),   fmtNumber2(comb.amazon.units + comb.web.cases)],
    ['Ad Spend',     fmtCurrency(comb.amazon.adSpend), fmtCurrency(comb.web.metaSpend), fmtCurrency(comb.totalAdSpend)],
    ['Ad Spend % of Sales',
      fmtPct(comb.amazon.sales > 0 ? comb.amazon.adSpend / comb.amazon.sales : null),
      fmtPct(comb.web.sales > 0 ? comb.web.metaSpend / comb.web.sales : null),
      fmtPct(comb.totalSales > 0 ? comb.totalAdSpend / comb.totalSales : null)],
    ['ROAS (attributed)',
      comb.amazon.roas != null ? fmtDecimal(comb.amazon.roas) : '—',
      comb.web.roas != null ? fmtDecimal(comb.web.roas) : '—',
      '—'],
    ['MER (total sales / ad spend)',
      comb.amazon.adSpend > 0 ? fmtDecimal(comb.amazon.sales / comb.amazon.adSpend) : '—',
      comb.web.mer != null ? fmtDecimal(comb.web.mer) : '—',
      fmtDecimal(comb.blendedMer)],
  ];
  document.getElementById('comb-breakdown-body').innerHTML = rows.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'bg-cream' : 'bg-white'} border-b border-slate-100">
      <td class="px-3 py-2 font-semibold text-navy">${r[0]}</td>
      <td class="px-3 py-2 text-right">${r[1]}</td>
      <td class="px-3 py-2 text-right">${r[2]}</td>
      <td class="px-3 py-2 text-right font-semibold">${r[3]}</td>
    </tr>
  `).join('');

  document.getElementById('comb-chart-label').textContent = y;
  renderCombinedChart(y);
}

function renderCombinedChart(year) {
  const ctx = document.getElementById('combined-chart');
  if (!ctx) return;
  if (combinedChart) combinedChart.destroy();
  const amzData = MONTHS.map(m => amazonRollupForMonth(m, year).sales);
  const webData = MONTHS.map(m => webRollupForMonth(m, year).sales);
  combinedChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: MONTHS.map(m => m.slice(0,3)),
      datasets: [
        { label: 'Amazon', data: amzData, backgroundColor: '#2E86AB', stack: 's' },
        { label: 'Website', data: webData, backgroundColor: '#C9A961', stack: 's' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${fmtCurrency(c.parsed.y)}`,
            footer: (items) => 'Total: ' + fmtCurrency(items.reduce((a, it) => a + (it.parsed.y || 0), 0)),
          },
        },
      },
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => fmtCurrency(v) } },
      },
    },
  });
}

// ============================================================
// Products Page
// ============================================================
let productsSortKey = 'totalSales';
let productsSortDir = 'desc';

function renderProductsPage() {
  const m = state.selectedMonth;
  const y = state.selectedYear;
  document.getElementById('products-month-pill').textContent = `${m} ${y}`;

  const products = productRollupsForMonth(m, y);
  const sorted = products.slice().sort((a, b) => {
    let va = a[productsSortKey], vb = b[productsSortKey];
    if (typeof va === 'string') { va = va || ''; vb = vb || ''; return productsSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    va = va || 0; vb = vb || 0;
    return productsSortDir === 'asc' ? va - vb : vb - va;
  });

  document.getElementById('products-body').innerHTML = sorted.map((p, i) => `
    <tr class="${i % 2 === 0 ? 'bg-cream' : 'bg-white'} border-b border-slate-100 ${p.active ? '' : 'opacity-60'}">
      <td class="px-3 py-2">
        <div class="font-semibold text-navy">${p.product_name}</div>
        ${!p.active ? '<div class="text-xs text-slate-500">Upcoming / inactive</div>' : ''}
      </td>
      <td class="px-3 py-2 font-mono text-xs">${p.web_sku || '—'}</td>
      <td class="px-3 py-2 font-mono text-xs">${p.amazon_sku || '—'}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(p.amzUnits)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber2(p.webCaseEq)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtNumber2(p.totalCaseEq)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(p.amzSales)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(p.webSales)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(p.totalSales)}</td>
    </tr>
  `).join('');

  // Update sort arrows
  document.querySelectorAll('#products-head .sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === productsSortKey) {
      arrow.textContent = productsSortDir === 'asc' ? '↑' : '↓';
    } else {
      arrow.textContent = '';
    }
  });
}

// Wire products sort
document.addEventListener('click', (e) => {
  const th = e.target.closest('#products-head .sortable');
  if (!th) return;
  const key = th.dataset.sort;
  if (productsSortKey === key) {
    productsSortDir = productsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    productsSortKey = key;
    productsSortDir = ['product_name'].includes(key) ? 'asc' : 'desc';
  }
  const sortSel = document.getElementById('products-sort');
  if (sortSel) sortSel.value = `${key}-${productsSortDir}`;
  renderProductsPage();
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'products-sort') return;
  const [k, d] = e.target.value.split('-');
  productsSortKey = k; productsSortDir = d;
  renderProductsPage();
});

// ============================================================
// Trends Page
// ============================================================
function renderTrendsPage() {
  const y = state.selectedYear;
  const cols = ['Month','Amz Sales','Amz Cases','Amz Ad Spend','Web Sales','Web Cases','Meta Spend','Total Sales','Blended MER'];
  document.getElementById('trends-head').innerHTML = cols.map(c =>
    `<th class="px-3 py-2 ${c === 'Month' ? 'text-left' : 'text-right'}">${c}</th>`
  ).join('');

  const priorYearAvail = state.availableYears.includes(y - 1);

  let bodyHtml = '';
  const totals = { amzSales:0, amzUnits:0, amzSpend:0, webSales:0, webCases:0, metaSpend:0, totalSales:0 };
  MONTHS.forEach((m, i) => {
    const amz = amazonRollupForMonth(m, y);
    const web = webRollupForMonth(m, y);
    const totalSales = amz.sales + web.sales;
    const totalSpend = amz.adSpend + web.metaSpend;
    const mer = totalSpend > 0 ? totalSales / totalSpend : null;
    const isPause = SEASONAL_PAUSE_MONTHS.has(m);
    const isEmpty = !amz.hasData && !web.hasData;

    totals.amzSales += amz.sales;
    totals.amzUnits += amz.units;
    totals.amzSpend += amz.adSpend;
    totals.webSales += web.sales;
    totals.webCases += web.cases;
    totals.metaSpend += web.metaSpend;
    totals.totalSales += totalSales;

    const rowClass = isEmpty && isPause ? 'bg-mid/30 text-slate-500' : (i % 2 === 0 ? 'bg-cream' : 'bg-white');
    const monthLabel = isPause ? `${m} <span class="text-xs text-slate-400">(pause)</span>` : m;

    bodyHtml += `
      <tr class="${rowClass} border-b border-slate-100">
        <td class="px-3 py-2 font-semibold">${monthLabel}</td>
        <td class="px-3 py-2 text-right">${fmtCurrency(amz.sales)}</td>
        <td class="px-3 py-2 text-right">${fmtNumber(amz.units)}</td>
        <td class="px-3 py-2 text-right">${fmtCurrency(amz.adSpend)}</td>
        <td class="px-3 py-2 text-right">${fmtCurrency(web.sales)}</td>
        <td class="px-3 py-2 text-right">${fmtNumber2(web.cases)}</td>
        <td class="px-3 py-2 text-right">${fmtCurrency(web.metaSpend)}</td>
        <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(totalSales)}</td>
        <td class="px-3 py-2 text-right">${fmtDecimal(mer)}</td>
      </tr>
    `;

    // YoY sub-row where prior year exists
    if (priorYearAvail) {
      const amzPY = amazonRollupForMonth(m, y - 1);
      const webPY = webRollupForMonth(m, y - 1);
      if (amzPY.hasData || webPY.hasData) {
        const totalSalesPY = amzPY.sales + webPY.sales;
        const totalSpendPY = amzPY.adSpend + webPY.metaSpend;
        const merPY = totalSpendPY > 0 ? totalSalesPY / totalSpendPY : null;
        bodyHtml += `
          <tr class="bg-white/50 text-xs text-slate-500 border-b border-slate-100">
            <td class="px-3 py-1 pl-6">${y - 1}</td>
            <td class="px-3 py-1 text-right">${fmtCurrency(amzPY.sales)}</td>
            <td class="px-3 py-1 text-right">${fmtNumber(amzPY.units)}</td>
            <td class="px-3 py-1 text-right">${fmtCurrency(amzPY.adSpend)}</td>
            <td class="px-3 py-1 text-right">${fmtCurrency(webPY.sales)}</td>
            <td class="px-3 py-1 text-right">${fmtNumber2(webPY.cases)}</td>
            <td class="px-3 py-1 text-right">${fmtCurrency(webPY.metaSpend)}</td>
            <td class="px-3 py-1 text-right">${fmtCurrency(totalSalesPY)}</td>
            <td class="px-3 py-1 text-right">${fmtDecimal(merPY)}</td>
          </tr>
        `;
      }
    }
  });

  // Total row
  const totalMer = (totals.amzSpend + totals.metaSpend) > 0 ? totals.totalSales / (totals.amzSpend + totals.metaSpend) : null;
  bodyHtml += `
    <tr class="bg-cocoa text-white font-bold border-b border-slate-100">
      <td class="px-3 py-2">${y} Total</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(totals.amzSales)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(totals.amzUnits)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(totals.amzSpend)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(totals.webSales)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber2(totals.webCases)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(totals.metaSpend)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(totals.totalSales)}</td>
      <td class="px-3 py-2 text-right">${fmtDecimal(totalMer)}</td>
    </tr>
  `;
  document.getElementById('trends-body').innerHTML = bodyHtml;
}

// ============================================================
// Excel Export — all channels
// ============================================================
function exportExcel() {
  if (!state.loaded) return;
  const wb = XLSX.utils.book_new();
  const y = state.selectedYear;

  // Sheet 1: Combined summary (12 months)
  const combSheet = [
    ['Chocxo Ecommerce Performance · ' + y],
    ['Generated ' + new Date().toLocaleString()],
    [],
    ['Month','Amz Sales','Amz Cases','Amz Ad Spend','Web Sales','Web Cases','Meta Spend','Total Sales','Blended MER'],
  ];
  const totals = { amzSales:0, amzUnits:0, amzSpend:0, webSales:0, webCases:0, metaSpend:0, totalSales:0 };
  MONTHS.forEach(m => {
    const amz = amazonRollupForMonth(m, y);
    const web = webRollupForMonth(m, y);
    const totalSales = amz.sales + web.sales;
    const totalSpend = amz.adSpend + web.metaSpend;
    const mer = totalSpend > 0 ? totalSales / totalSpend : null;
    totals.amzSales += amz.sales; totals.amzUnits += amz.units;
    totals.amzSpend += amz.adSpend; totals.webSales += web.sales;
    totals.webCases += web.cases; totals.metaSpend += web.metaSpend;
    totals.totalSales += totalSales;
    combSheet.push([
      m, amz.sales, amz.units, amz.adSpend,
      web.sales, +web.cases.toFixed(2), web.metaSpend,
      totalSales, mer != null ? +mer.toFixed(2) : null,
    ]);
  });
  const totalMer = (totals.amzSpend + totals.metaSpend) > 0
    ? totals.totalSales / (totals.amzSpend + totals.metaSpend) : null;
  combSheet.push([
    y + ' TOTAL', totals.amzSales, totals.amzUnits, totals.amzSpend,
    totals.webSales, +totals.webCases.toFixed(2), totals.metaSpend,
    totals.totalSales, totalMer != null ? +totalMer.toFixed(2) : null,
  ]);
  const ws1 = XLSX.utils.aoa_to_sheet(combSheet);
  XLSX.utils.book_append_sheet(wb, ws1, 'Combined Trends');

  // Sheet 2: Products (current month)
  const m = state.selectedMonth;
  const prodRows = productRollupsForMonth(m, y);
  const prodSheet = [
    [`Products · ${m} ${y}`],
    [],
    ['Product','Web SKU','Amazon SKU','Amz Cases','Web Case-eq.','Total Cases','Amz Sales','Web Sales','Total Sales'],
  ];
  prodRows.forEach(p => prodSheet.push([
    p.product_name, p.web_sku || '', p.amazon_sku || '',
    p.amzUnits, +p.webCaseEq.toFixed(2), +p.totalCaseEq.toFixed(2),
    p.amzSales, p.webSales, p.totalSales,
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodSheet), 'Products ' + m);

  // Sheet 3: Amazon detail
  const amzSheet = [['Amazon Sellerboard'], [], ['Year','Month','ASIN','Sessions','Units','Sales','Refunds']];
  state.sellerboard.slice().sort((a,b) => a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
    .forEach(r => amzSheet.push([r.year, r.month, r.asin, r.sessions, r.units, +r.gross_sales, +r.refunds]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(amzSheet), 'Amazon Sellerboard');

  // Sheet 4: Amazon PPC
  const ppcSheet = [['Amazon PPC'], [], ['Year','Month','Campaign','Type','Impr','Clicks','Spend','Sales','Orders']];
  state.ppc.slice().sort((a,b) => a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
    .forEach(r => ppcSheet.push([r.year, r.month, r.campaign, r.ad_type || '', r.impressions, r.clicks, +r.spend, +r.sales, r.orders]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ppcSheet), 'Amazon PPC');

  // Sheet 5: Web sales
  const webSheet = [['CIN7 Web Sales'], [], ['Year','Month','SKU','Singles','Case-equiv.','Sales']];
  state.webSales.slice().sort((a,b) => a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
    .forEach(r => webSheet.push([r.year, r.month, r.sku, r.quantity_singles, +((r.quantity_singles||0)/6).toFixed(2), +r.sales]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(webSheet), 'Web Sales');

  // Sheet 6: Meta ads
  const metaSheet = [['Meta Ads'], [], ['Year','Month','Ad Name','Spend','Impr','Link Clicks','Purchases','Value','ROAS']];
  state.webAds.slice().sort((a,b) => a.year - b.year || MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month))
    .forEach(r => {
      const spend = +r.spend || 0, val = +r.purchase_value || 0;
      const roas = spend > 0 ? +(val/spend).toFixed(2) : null;
      metaSheet.push([r.year, r.month, r.ad_name, spend, r.impressions, r.link_clicks, r.purchases, val, roas]);
    });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaSheet), 'Meta Ads');

  XLSX.writeFile(wb, `Chocxo_KPIs_${y}_${new Date().toISOString().slice(0,10)}.xlsx`);
}

document.getElementById('export-btn')?.addEventListener('click', exportExcel);

// ============================================================
// Boot
// ============================================================
(async () => {
  await refreshAuthUI();
  await loadAllData();
  setupSelectors(rerenderCurrentPage);
  setupRouter(onRouteChange);
})();
