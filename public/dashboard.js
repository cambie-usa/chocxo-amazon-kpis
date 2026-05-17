// ============================================================
// dashboard.js — Chocxo single-brand rendering
// ============================================================

let salesChart = null;

const tableState = {
  products: { sort: 'sales-desc' },
  ppc:      { sort: 'spend-desc' },
};

function renderDashboard() {
  const month = state.selectedMonth;
  const cur = rollupForMonth(month);
  const prev = priorMonth(month);
  const prior = prev ? rollupForMonth(prev) : null;

  // Top tiles
  document.getElementById('kpi-total-sales').textContent = fmtCurrency(cur.sales);
  document.getElementById('kpi-total-ad-spend').textContent = fmtCurrency(cur.adSpend);
  document.getElementById('kpi-total-units').textContent = fmtNumber(cur.units);

  // MoM Sales tile
  const momEl = document.getElementById('kpi-mom-sales');
  if (prior && prior.sales) {
    const pct = (cur.sales - prior.sales) / prior.sales;
    momEl.textContent = (pct > 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
    momEl.className = 'text-3xl font-bold mt-2 ' + (pct > 0 ? 'text-good' : pct < 0 ? 'text-bad' : 'text-navy');
  } else {
    momEl.textContent = '—';
    momEl.className = 'text-3xl font-bold text-navy mt-2';
  }

  // KPI grid — 16 metrics in a 4-column layout
  const kpiGrid = document.getElementById('kpi-grid');
  kpiGrid.innerHTML = [
    // Row 1: Sales-focused
    kpiCell('Gross Sales',   fmtCurrency(cur.sales)),
    kpiCell('Ad Spend',      fmtCurrency(cur.adSpend)),
    kpiCell('Impressions',   fmtNumber(cur.impressions)),
    kpiCell('CTR',           fmtPct(cur.ctr)),
    // Row 2: Volume
    kpiCell('Units',         fmtNumber(cur.units)),
    kpiCell('Ad Sales',      fmtCurrency(cur.adSales)),
    kpiCell('Clicks',        fmtNumber(cur.clicks)),
    kpiCell('CPC',           fmtCurrency2(cur.cpc)),
    // Row 3: Efficiency
    kpiCell('Sessions',      fmtNumber(cur.sessions)),
    kpiCell('ACoS',          fmtPct(cur.acos)),
    kpiCell('Ad Orders',     fmtNumber(cur.adOrders)),
    kpiCell('ROAS',          fmtMult(cur.roas)),
    // Row 4: Quality
    kpiCell('CVR',           fmtPct(cur.cvr)),
    kpiCell('TACoS',         fmtPct(cur.tacos)),
    kpiCell('Organic Sales', fmtCurrency(cur.organicSales)),
    kpiCell('Refund Cost',   fmtCurrency(cur.refundCost)),
  ].join('');

  // MoM panel (right column)
  const momPanel = document.getElementById('mom-panel');
  if (!prior) {
    momPanel.innerHTML = `<div class="text-xs text-slate-500 italic">No prior month data</div>`;
  } else {
    momPanel.innerHTML = [
      deltaCell('Δ Sales',         cur.sales        - prior.sales,         fmtCurrency),
      deltaPctCell('Δ Sales %',    prior.sales > 0 ? (cur.sales - prior.sales) / prior.sales : null),
      deltaCell('Δ Units',         cur.units        - prior.units,         fmtNumber),
      deltaCell('Δ Sessions',      cur.sessions     - prior.sessions,      fmtNumber),
      deltaPctPointsCell('Δ CVR',  cur.cvr          - prior.cvr),
      deltaCell('Δ Organic Sales', cur.organicSales - prior.organicSales,  fmtCurrency),
      deltaCell('Δ Ad Sales',      cur.adSales      - prior.adSales,       fmtCurrency),
      deltaCell('Δ Ad Spend',      cur.adSpend      - prior.adSpend,       fmtCurrency),
    ].join('');
  }

  // Top SKUs table
  document.getElementById('top-skus-month-pill').textContent = month;
  renderTopSkus(month);

  renderSalesChart();

  const dataMonths = new Set(state.sellerboard.map(r => r.month));
  document.getElementById('footer-updated').textContent =
    `${dataMonths.size} month(s) of data · ${state.catalog.length} SKUs`;
}

function kpiCell(label, value) {
  return `
    <div>
      <div class="text-xs text-slate-500 uppercase tracking-wide">${label}</div>
      <div class="text-lg font-bold text-navy">${value}</div>
    </div>
  `;
}

function deltaCell(label, value, formatter) {
  if (value == null || isNaN(value)) return `<div class="flex justify-between"><span class="text-xs text-slate-500">${label}</span><span class="font-semibold text-slate-400">—</span></div>`;
  const color = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-slate-500';
  const sign = value > 0 ? '+' : '';
  return `
    <div class="flex justify-between">
      <span class="text-xs text-slate-500">${label}</span>
      <span class="font-bold ${color}">${value === 0 ? '—' : sign + formatter(value)}</span>
    </div>
  `;
}
function deltaPctCell(label, value) {
  if (value == null || isNaN(value)) return `<div class="flex justify-between"><span class="text-xs text-slate-500">${label}</span><span class="font-semibold text-slate-400">—</span></div>`;
  const color = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-slate-500';
  const sign = value > 0 ? '+' : '';
  return `
    <div class="flex justify-between">
      <span class="text-xs text-slate-500">${label}</span>
      <span class="font-bold ${color}">${value === 0 ? '—' : sign + (value * 100).toFixed(1) + '%'}</span>
    </div>
  `;
}
function deltaPctPointsCell(label, value) {
  if (value == null || isNaN(value)) return `<div class="flex justify-between"><span class="text-xs text-slate-500">${label}</span><span class="font-semibold text-slate-400">—</span></div>`;
  const color = value > 0 ? 'text-good' : value < 0 ? 'text-bad' : 'text-slate-500';
  const sign = value > 0 ? '+' : '';
  return `
    <div class="flex justify-between">
      <span class="text-xs text-slate-500">${label}</span>
      <span class="font-bold ${color}">${value === 0 ? '—' : sign + (value * 100).toFixed(1) + ' pp'}</span>
    </div>
  `;
}

function renderTopSkus(month) {
  const body = document.getElementById('top-skus-body');
  if (!body) return;
  body.innerHTML = '';

  const rows = state.catalog.map(c => {
    const sbRow = state.sellerboard.find(r => r.asin === c.asin && r.month === month);
    return {
      sku: c.internal_sku,
      name: c.product_name,
      units: sbRow?.units || 0,
      sessions: sbRow?.sessions || 0,
      sales: +sbRow?.gross_sales || 0,
      refund: Math.abs(+sbRow?.refunds || 0),
      cvr: sbRow?.sessions > 0 ? (sbRow?.units || 0) / sbRow.sessions : 0,
    };
  }).sort((a, b) => b.sales - a.sales);

  const maxSales = Math.max(...rows.map(r => r.sales), 1);
  rows.forEach((r, i) => {
    const intensity = Math.min(0.95, r.sales / maxSales);
    const bgStyle = intensity > 0.05 ? `background: linear-gradient(90deg, rgba(107,52,16,${intensity * 0.25}) 0%, transparent 100%);` : '';
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2 font-bold text-cocoa">${r.sku}</td>
      <td class="px-3 py-2 text-xs">${r.name}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.units)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.sessions)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.cvr)}</td>
      <td class="px-3 py-2 text-right font-semibold text-navy" style="${bgStyle}">${fmtCurrency(r.sales)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(r.refund)}</td>
    `;
    body.appendChild(tr);
  });
}

function renderSalesChart() {
  const canvas = document.getElementById('sales-chart');
  if (!canvas) return;

  const salesData = MONTHS.map(m =>
    state.sellerboard.filter(r => r.month === m).reduce((a, r) => a + (+r.gross_sales || 0), 0)
  );
  const adSpendData = MONTHS.map(m =>
    state.ppc.filter(r => r.month === m).reduce((a, r) => a + (+r.spend || 0), 0)
  );

  if (salesChart) salesChart.destroy();
  salesChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: MONTHS,
      datasets: [
        { label: 'Sales', backgroundColor: '#6B3410', data: salesData },
        { label: 'Ad Spend', backgroundColor: '#C9A961', data: adSpendData },
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtCurrency2(ctx.parsed.y)}` } }
      },
      scales: {
        y: { ticks: { callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } }
      }
    }
  });
}

// ============================================================
// TRENDS
// ============================================================
function renderTrends() {
  const headRow = document.getElementById('trends-head');
  const body = document.getElementById('trends-body');
  if (!headRow || !body) return;

  headRow.innerHTML = `
    <th class="px-3 py-2 text-left">Month</th>
    <th class="px-3 py-2 text-right">Sales</th>
    <th class="px-3 py-2 text-right">Units</th>
    <th class="px-3 py-2 text-right">Sessions</th>
    <th class="px-3 py-2 text-right">CVR</th>
    <th class="px-3 py-2 text-right">Refund Cost</th>
    <th class="px-3 py-2 text-right">Ad Spend</th>
    <th class="px-3 py-2 text-right">Ad Sales</th>
    <th class="px-3 py-2 text-right">Organic Sales</th>
    <th class="px-3 py-2 text-right">ACoS</th>
    <th class="px-3 py-2 text-right">TACoS</th>
    <th class="px-3 py-2 text-right">ROAS</th>
  `;

  body.innerHTML = '';
  MONTHS.forEach((month, mi) => {
    const r = rollupForMonth(month);
    if (r.sales === 0) return;
    const tr = document.createElement('tr');
    tr.className = mi % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2 font-bold text-cocoa">${month}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(r.sales)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.units)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.sessions)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.cvr)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(r.refundCost)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(r.adSpend)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(r.adSales)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(r.organicSales)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.acos)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.tacos)}</td>
      <td class="px-3 py-2 text-right">${fmtMult(r.roas)}</td>
    `;
    body.appendChild(tr);
  });
}

// ============================================================
// BY PRODUCT
// ============================================================
function renderProducts() {
  const month = state.selectedMonth;
  document.getElementById('products-month-pill').textContent = month;
  const body = document.getElementById('products-body');
  if (!body) return;
  body.innerHTML = '';

  let rows = state.catalog.map(c => {
    const sbRow = state.sellerboard.find(r => r.asin === c.asin && r.month === month);
    return {
      sku: c.internal_sku, asin: c.asin, name: c.product_name,
      units: sbRow?.units || 0,
      sessions: sbRow?.sessions || 0,
      sales: +sbRow?.gross_sales || 0,
      refund: Math.abs(+sbRow?.refunds || 0),
      cvr: sbRow?.sessions > 0 ? (sbRow?.units || 0) / sbRow.sessions : 0,
    };
  });

  rows = sortProductRows(rows, tableState.products.sort);
  updateSortArrows('products-head', tableState.products.sort);

  let totUnits = 0, totSessions = 0, totSales = 0, totRefund = 0;
  rows.forEach((r, i) => {
    totUnits += r.units; totSessions += r.sessions; totSales += r.sales; totRefund += r.refund;
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2 font-bold text-cocoa">${r.sku}</td>
      <td class="px-3 py-2 font-mono text-xs">${r.asin}</td>
      <td class="px-3 py-2">${r.name}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.units)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.sessions)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.cvr)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(r.sales)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency(r.refund)}</td>
    `;
    body.appendChild(tr);
  });

  const totCvr = totSessions > 0 ? totUnits / totSessions : 0;
  const totTr = document.createElement('tr');
  totTr.className = 'bg-cocoa text-white font-bold';
  totTr.innerHTML = `
    <td class="px-3 py-2" colspan="3">TOTAL</td>
    <td class="px-3 py-2 text-right">${fmtNumber(totUnits)}</td>
    <td class="px-3 py-2 text-right">${fmtNumber(totSessions)}</td>
    <td class="px-3 py-2 text-right">${fmtPct(totCvr)}</td>
    <td class="px-3 py-2 text-right">${fmtCurrency(totSales)}</td>
    <td class="px-3 py-2 text-right">${fmtCurrency(totRefund)}</td>
  `;
  body.appendChild(totTr);
}

function sortProductRows(rows, sortKey) {
  const [field, dir] = sortKey.split('-');
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av, bv;
    switch (field) {
      case 'sales':    av = a.sales;    bv = b.sales;    break;
      case 'units':    av = a.units;    bv = b.units;    break;
      case 'sessions': av = a.sessions; bv = b.sessions; break;
      case 'cvr':      av = a.cvr;      bv = b.cvr;      break;
      case 'refund':   av = a.refund;   bv = b.refund;   break;
      case 'sku':      return mult * String(a.sku).localeCompare(String(b.sku));
      default:         av = a.sales;    bv = b.sales;
    }
    return mult * (av - bv);
  });
}

// ============================================================
// PPC DETAIL
// ============================================================
function renderPpc() {
  const month = state.selectedMonth;
  document.getElementById('ppc-month-pill').textContent = month;
  const body = document.getElementById('ppc-body');
  if (!body) return;
  body.innerHTML = '';

  let rows = state.ppc
    .filter(r => r.month === month)
    .map(r => {
      const impressions = r.impressions || 0;
      const clicks = r.clicks || 0;
      const spend = +r.spend || 0;
      const sales = +r.sales || 0;
      return {
        campaign: r.campaign, ad_type: r.ad_type,
        impressions, clicks, spend, sales,
        orders: r.orders || 0,
        ctr: impressions > 0 ? clicks / impressions : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        acos: sales > 0 ? spend / sales : 0,
        roas: spend > 0 ? sales / spend : 0,
      };
    });

  rows = sortPpcRows(rows, tableState.ppc.sort);
  updateSortArrows('ppc-head', tableState.ppc.sort);

  let totImpr = 0, totClicks = 0, totSpend = 0, totSales = 0, totOrders = 0;
  rows.forEach((r, i) => {
    totImpr += r.impressions; totClicks += r.clicks; totSpend += r.spend;
    totSales += r.sales; totOrders += r.orders;
    const acosColor = r.acos > 0.25 ? 'bg-red-50 text-bad' : r.acos > 0 && r.acos < 0.15 ? 'bg-green-50 text-good' : '';
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2 text-xs">${r.campaign}</td>
      <td class="px-3 py-2 text-center">${r.ad_type || ''}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.impressions)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.clicks)}</td>
      <td class="px-3 py-2 text-right">${fmtPct(r.ctr)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency2(r.spend)}</td>
      <td class="px-3 py-2 text-right">${fmtCurrency2(r.cpc)}</td>
      <td class="px-3 py-2 text-right">${fmtNumber(r.orders)}</td>
      <td class="px-3 py-2 text-right font-semibold">${fmtCurrency2(r.sales)}</td>
      <td class="px-3 py-2 text-right font-bold ${acosColor}">${fmtPct(r.acos)}</td>
      <td class="px-3 py-2 text-right">${fmtMult(r.roas)}</td>
    `;
    body.appendChild(tr);
  });

  const totCtr = totImpr > 0 ? totClicks / totImpr : 0;
  const totCpc = totClicks > 0 ? totSpend / totClicks : 0;
  const totAcos = totSales > 0 ? totSpend / totSales : 0;
  const totRoas = totSpend > 0 ? totSales / totSpend : 0;
  const totTr = document.createElement('tr');
  totTr.className = 'bg-cocoa text-white font-bold';
  totTr.innerHTML = `
    <td class="px-3 py-2" colspan="2">TOTAL</td>
    <td class="px-3 py-2 text-right">${fmtNumber(totImpr)}</td>
    <td class="px-3 py-2 text-right">${fmtNumber(totClicks)}</td>
    <td class="px-3 py-2 text-right">${fmtPct(totCtr)}</td>
    <td class="px-3 py-2 text-right">${fmtCurrency2(totSpend)}</td>
    <td class="px-3 py-2 text-right">${fmtCurrency2(totCpc)}</td>
    <td class="px-3 py-2 text-right">${fmtNumber(totOrders)}</td>
    <td class="px-3 py-2 text-right">${fmtCurrency2(totSales)}</td>
    <td class="px-3 py-2 text-right">${fmtPct(totAcos)}</td>
    <td class="px-3 py-2 text-right">${fmtMult(totRoas)}</td>
  `;
  body.appendChild(totTr);
}

function sortPpcRows(rows, sortKey) {
  const [field, dir] = sortKey.split('-');
  const mult = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    let av, bv;
    switch (field) {
      case 'spend':       av = a.spend;       bv = b.spend;       break;
      case 'sales':       av = a.sales;       bv = b.sales;       break;
      case 'impressions': av = a.impressions; bv = b.impressions; break;
      case 'clicks':      av = a.clicks;      bv = b.clicks;      break;
      case 'orders':      av = a.orders;      bv = b.orders;      break;
      case 'acos':        av = a.acos;        bv = b.acos;        break;
      case 'roas':        av = a.roas;        bv = b.roas;        break;
      case 'campaign':    return mult * String(a.campaign).localeCompare(String(b.campaign));
      default:            av = a.spend;       bv = b.spend;
    }
    return mult * (av - bv);
  });
}

function updateSortArrows(headId, sortKey) {
  const head = document.getElementById(headId);
  if (!head) return;
  const [field, dir] = sortKey.split('-');
  head.querySelectorAll('.sort-arrow').forEach(s => s.textContent = '');
  head.querySelectorAll('th.sortable').forEach(th => {
    th.classList.remove('bg-white/10');
    if (th.dataset.sort === field) {
      th.classList.add('bg-white/10');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = dir === 'asc' ? ' ↑' : ' ↓';
    }
  });
}

function setupTableInteractions() {
  const pSort = document.getElementById('products-sort');
  if (pSort && !pSort.dataset.wired) {
    pSort.dataset.wired = '1';
    pSort.addEventListener('change', () => {
      tableState.products.sort = pSort.value;
      renderProducts();
    });
  }
  const pHead = document.getElementById('products-head');
  if (pHead && !pHead.dataset.wired) {
    pHead.dataset.wired = '1';
    pHead.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        const [curField, curDir] = tableState.products.sort.split('-');
        let newDir;
        if (curField === field) newDir = curDir === 'desc' ? 'asc' : 'desc';
        else newDir = field === 'sku' ? 'asc' : 'desc';
        tableState.products.sort = `${field}-${newDir}`;
        if (pSort) {
          const opt = Array.from(pSort.options).find(o => o.value === tableState.products.sort);
          pSort.value = opt ? tableState.products.sort : '';
        }
        renderProducts();
      });
    });
  }

  const ppcSort = document.getElementById('ppc-sort');
  if (ppcSort && !ppcSort.dataset.wired) {
    ppcSort.dataset.wired = '1';
    ppcSort.addEventListener('change', () => {
      tableState.ppc.sort = ppcSort.value;
      renderPpc();
    });
  }
  const ppcHead = document.getElementById('ppc-head');
  if (ppcHead && !ppcHead.dataset.wired) {
    ppcHead.dataset.wired = '1';
    ppcHead.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        const [curField, curDir] = tableState.ppc.sort.split('-');
        let newDir;
        if (curField === field) newDir = curDir === 'desc' ? 'asc' : 'desc';
        else newDir = field === 'campaign' ? 'asc' : 'desc';
        tableState.ppc.sort = `${field}-${newDir}`;
        if (ppcSort) {
          const opt = Array.from(ppcSort.options).find(o => o.value === tableState.ppc.sort);
          ppcSort.value = opt ? tableState.ppc.sort : '';
        }
        renderPpc();
      });
    });
  }
}

function showPage(path) {
  const dashSections = document.querySelectorAll('main > section');
  const trendsPage   = document.getElementById('trends-page');
  const productsPage = document.getElementById('products-page');
  const ppcPage      = document.getElementById('ppc-page');

  dashSections.forEach(s => s.classList.add('hidden'));
  trendsPage.classList.add('hidden');
  productsPage.classList.add('hidden');
  ppcPage.classList.add('hidden');

  if (path === '/trends') {
    trendsPage.classList.remove('hidden');
    renderTrends();
  } else if (path === '/products') {
    productsPage.classList.remove('hidden');
    renderProducts();
  } else if (path === '/ppc') {
    ppcPage.classList.remove('hidden');
    renderPpc();
  } else {
    dashSections.forEach(s => s.classList.remove('hidden'));
    renderDashboard();
  }

  document.querySelectorAll('nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '/' && href === '/')) {
      a.classList.add('bg-white/10');
    } else {
      a.classList.remove('bg-white/10');
    }
  });
}

async function init() {
  document.getElementById('data-status').textContent = 'Loading…';
  await refreshAuthUI();
  await loadAllData();
  document.getElementById('data-status').textContent = '';
  setupMonthSelector(() => showPage(window.location.pathname));
  setupTableInteractions();
  setupRouter(showPage);
}

if (document.getElementById('month-select')) init();
