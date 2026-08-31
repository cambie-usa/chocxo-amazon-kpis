// ============================================================
// dashboard.js — Chocxo dashboard with YoY + total_ad_spend fallback
// ============================================================

let salesChart = null;

const tableState = {
  products: { sort: 'sales-desc' },
  ppc:      { sort: 'spend-desc' },
};

function renderDashboard() {
  const month = state.selectedMonth;
  const year = state.selectedYear;
  const cur = rollupForMonth(month, year);
  const prev = priorMonth(month, year);
  const prior = hasDataFor(prev.month, prev.year) ? rollupForMonth(prev.month, prev.year) : null;
  const yoyPrev = priorYearSameMonth(month, year);
  const yoy = hasDataFor(yoyPrev.month, yoyPrev.year) ? rollupForMonth(yoyPrev.month, yoyPrev.year) : null;

  document.getElementById('kpi-total-sales').textContent = fmtCurrency(cur.sales);
  document.getElementById('kpi-total-ad-spend').textContent = cur.hasAnyAdSpend ? fmtCurrency(cur.adSpend) : '—';
  document.getElementById('kpi-total-units').textContent = fmtNumber(cur.units);

  const momEl = document.getElementById('kpi-mom-sales');
  if (prior && prior.sales) {
    const pct = (cur.sales - prior.sales) / prior.sales;
    momEl.textContent = (pct > 0 ? '+' : '') + (pct * 100).toFixed(1) + '%';
    momEl.className = 'text-3xl font-bold mt-2 ' + (pct > 0 ? 'text-good' : pct < 0 ? 'text-bad' : 'text-navy');
  } else {
    momEl.textContent = '—';
    momEl.className = 'text-3xl font-bold text-navy mt-2';
  }

  // KPI grid — show ad metrics only when data present
  const kpiGrid = document.getElementById('kpi-grid');
  kpiGrid.innerHTML = [
    kpiCell('Gross Sales',   fmtCurrency(cur.sales)),
    kpiCell('Ad Spend',      cur.hasAnyAdSpend ? fmtCurrency(cur.adSpend) : '—'),
    kpiCell('Impressions',   cur.hasPpcDetail ? fmtNumber(cur.impressions) : '—'),
    kpiCell('CTR',           cur.hasPpcDetail ? fmtPct(cur.ctr) : '—'),
    kpiCell('Units',         fmtNumber(cur.units)),
    kpiCell('Ad Sales',      cur.hasPpcDetail ? fmtCurrency(cur.adSales) : '—'),
    kpiCell('Clicks',        cur.hasPpcDetail ? fmtNumber(cur.clicks) : '—'),
    kpiCell('CPC',           cur.hasPpcDetail ? fmtCurrency2(cur.cpc) : '—'),
    kpiCell('Sessions',      fmtNumber(cur.sessions)),
    kpiCell('ACoS',          cur.acos != null ? fmtPct(cur.acos) : '—'),
    kpiCell('Ad Orders',     cur.hasPpcDetail ? fmtNumber(cur.adOrders) : '—'),
    kpiCell('ROAS',          cur.roas != null ? fmtMult(cur.roas) : '—'),
    kpiCell('CVR',           fmtPct(cur.cvr)),
    kpiCell('TACoS',         cur.hasAnyAdSpend ? fmtPct(cur.tacos) : '—'),
    kpiCell('Organic Sales', cur.organicSales != null ? fmtCurrency(cur.organicSales) : '—'),
    kpiCell('Refund Cost',   fmtCurrency(cur.refundCost)),
  ].join('');

  // MoM panel (vs previous month)
  const momPanel = document.getElementById('mom-panel');
  if (!prior) {
    momPanel.innerHTML = `<div class="text-xs text-slate-500 italic">No prior month data</div>`;
  } else {
    momPanel.innerHTML = [
      `<div class="text-xs text-slate-500 mb-1">vs. ${prev.month} ${prev.year}</div>`,
      deltaCell('Δ Sales',         cur.sales        - prior.sales,         fmtCurrency),
      deltaPctCell('Δ Sales %',    prior.sales > 0 ? (cur.sales - prior.sales) / prior.sales : null),
      deltaCell('Δ Units',         cur.units        - prior.units,         fmtNumber),
      deltaCell('Δ Sessions',      cur.sessions     - prior.sessions,      fmtNumber),
      deltaPctPointsCell('Δ CVR',  cur.cvr          - prior.cvr),
      deltaCell('Δ Ad Spend',      (cur.hasAnyAdSpend && prior.hasAnyAdSpend) ? (cur.adSpend - prior.adSpend) : null, fmtCurrency),
    ].join('');
  }

  // YoY panel (vs same month, prior year)
  const yoyPanel = document.getElementById('yoy-panel');
  if (!yoy) {
    yoyPanel.innerHTML = `<div class="text-xs text-slate-500 italic">No ${yoyPrev.year} data for ${yoyPrev.month}</div>`;
  } else {
    yoyPanel.innerHTML = [
      `<div class="text-xs text-slate-500 mb-1">vs. ${yoyPrev.month} ${yoyPrev.year}</div>`,
      deltaCell('Δ Sales',         cur.sales        - yoy.sales,         fmtCurrency),
      deltaPctCell('Δ Sales %',    yoy.sales > 0 ? (cur.sales - yoy.sales) / yoy.sales : null),
      deltaCell('Δ Units',         cur.units        - yoy.units,         fmtNumber),
      deltaCell('Δ Sessions',      cur.sessions     - yoy.sessions,      fmtNumber),
      deltaPctPointsCell('Δ CVR',  cur.cvr          - yoy.cvr),
      deltaCell('Δ Ad Spend',      (cur.hasAnyAdSpend && yoy.hasAnyAdSpend) ? (cur.adSpend - yoy.adSpend) : null, fmtCurrency),
    ].join('');
  }

  document.getElementById('top-skus-month-pill').textContent = `${month} ${year}`;
  document.getElementById('chart-year-label').textContent = year;
  renderTopSkus(month, year);
  renderSalesChart(year);

  const dataMonths = new Set(state.sellerboard.map(r => `${r.month} ${r.year}`));
  document.getElementById('footer-updated').textContent =
    `${dataMonths.size} month(s) of data across ${state.availableYears.length} year(s) · ${state.catalog.length} SKUs`;
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

function renderTopSkus(month, year) {
  const body = document.getElementById('top-skus-body');
  if (!body) return;
  body.innerHTML = '';

  const rows = state.catalog.map(c => {
    const sbRow = state.sellerboard.find(r => r.asin === c.asin && r.month === month && r.year === year);
    return {
      sku: c.internal_sku, name: c.product_name,
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

function renderSalesChart(year) {
  const canvas = document.getElementById('sales-chart');
  if (!canvas) return;

  const salesData = MONTHS.map(m =>
    state.sellerboard.filter(r => r.month === m && r.year === year).reduce((a, r) => a + (+r.gross_sales || 0), 0)
  );
  // Ad spend: prefer PPC, fall back to sellerboard total_ad_spend
  const adSpendData = MONTHS.map(m => {
    const ppc = state.ppc.filter(r => r.month === m && r.year === year);
    if (ppc.length > 0) return ppc.reduce((a, r) => a + (+r.spend || 0), 0);
    return state.sellerboard.filter(r => r.month === m && r.year === year)
      .reduce((a, r) => a + (+r.total_ad_spend || 0), 0);
  });

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
      scales: { y: { ticks: { callback: v => '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) } } }
    }
  });
}

// ============================================================
// TRENDS — now shows all years
// ============================================================
function renderTrends() {
  const headRow = document.getElementById('trends-head');
  const body = document.getElementById('trends-body');
  if (!headRow || !body) return;

  headRow.innerHTML = `
    <th class="px-3 py-2 text-left">Year</th>
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
    <th class="px-3 py-2 text-right">YoY Sales</th>
  `;

  body.innerHTML = '';
  let i = 0;
  state.availableYears.forEach(year => {
    MONTHS.forEach(month => {
      const r = rollupForMonth(month, year);
      if (r.sales === 0 && r.units === 0) return;
      const prevYear = year - 1;
      const priorYear = hasDataFor(month, prevYear) ? rollupForMonth(month, prevYear) : null;
      let yoyCell = '<span class="text-slate-400">—</span>';
      if (priorYear && priorYear.sales > 0) {
        const pct = (r.sales - priorYear.sales) / priorYear.sales;
        const color = pct > 0 ? 'text-good' : pct < 0 ? 'text-bad' : 'text-slate-500';
        const sign = pct > 0 ? '+' : '';
        yoyCell = `<span class="font-bold ${color}">${sign}${(pct * 100).toFixed(1)}%</span>`;
      }
      const tr = document.createElement('tr');
      tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
      tr.innerHTML = `
        <td class="px-3 py-2 font-semibold">${year}</td>
        <td class="px-3 py-2 font-bold text-cocoa">${month}</td>
        <td class="px-3 py-2 text-right font-semibold">${fmtCurrency(r.sales)}</td>
        <td class="px-3 py-2 text-right">${fmtNumber(r.units)}</td>
        <td class="px-3 py-2 text-right">${fmtNumber(r.sessions)}</td>
        <td class="px-3 py-2 text-right">${fmtPct(r.cvr)}</td>
        <td class="px-3 py-2 text-right">${fmtCurrency(r.refundCost)}</td>
        <td class="px-3 py-2 text-right">${r.hasAnyAdSpend ? fmtCurrency(r.adSpend) : '—'}</td>
        <td class="px-3 py-2 text-right">${r.hasPpcDetail ? fmtCurrency(r.adSales) : '—'}</td>
        <td class="px-3 py-2 text-right font-semibold">${r.organicSales != null ? fmtCurrency(r.organicSales) : '—'}</td>
        <td class="px-3 py-2 text-right">${r.acos != null ? fmtPct(r.acos) : '—'}</td>
        <td class="px-3 py-2 text-right">${r.hasAnyAdSpend ? fmtPct(r.tacos) : '—'}</td>
        <td class="px-3 py-2 text-right">${r.roas != null ? fmtMult(r.roas) : '—'}</td>
        <td class="px-3 py-2 text-right">${yoyCell}</td>
      `;
      body.appendChild(tr);
      i++;
    });
  });
}

// ============================================================
// BY PRODUCT
// ============================================================
function renderProducts() {
  const month = state.selectedMonth;
  const year = state.selectedYear;
  document.getElementById('products-month-pill').textContent = `${month} ${year}`;
  const body = document.getElementById('products-body');
  if (!body) return;
  body.innerHTML = '';

  let rows = state.catalog.map(c => {
    const sbRow = state.sellerboard.find(r => r.asin === c.asin && r.month === month && r.year === year);
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
  const year = state.selectedYear;
  document.getElementById('ppc-month-pill').textContent = `${month} ${year}`;
  const body = document.getElementById('ppc-body');
  if (!body) return;
  body.innerHTML = '';

  let rows = state.ppc.filter(r => r.month === month && r.year === year).map(r => {
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

  // Empty-state notice when this month has no campaign detail
  const emptyNotice = document.getElementById('ppc-empty-notice');
  if (rows.length === 0) {
    emptyNotice.classList.remove('hidden');
  } else {
    emptyNotice.classList.add('hidden');
  }

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

  if (rows.length === 0) return;

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
    pSort.addEventListener('change', () => { tableState.products.sort = pSort.value; renderProducts(); });
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
    ppcSort.addEventListener('change', () => { tableState.ppc.sort = ppcSort.value; renderPpc(); });
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

// ============================================================
// EXCEL EXPORT — now includes year in all data
// ============================================================
function setupExportButton() {
  const btn = document.getElementById('export-btn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', exportToExcel);
}

function exportToExcel() {
  if (!state.loaded) {
    alert('Data is still loading. Please try again in a moment.');
    return;
  }
  const btn = document.getElementById('export-btn');
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<span class="opacity-70">Generating…</span>';
  btn.disabled = true;

  setTimeout(() => {
    try {
      const wb = XLSX.utils.book_new();

      // ============ Tab 1 — Dashboard Summary (all years, all months) ============
      const summaryRows = [];
      state.availableYears.forEach(year => {
        MONTHS.forEach(month => {
          const r = rollupForMonth(month, year);
          if (r.sales === 0 && r.units === 0) return;
          summaryRows.push({
            Year: year,
            Month: month,
            Sales: r.sales,
            Units: r.units,
            Sessions: r.sessions,
            CVR: r.cvr,
            'Refund Cost': r.refundCost,
            'Ad Spend': r.hasAnyAdSpend ? r.adSpend : null,
            'Ad Sales': r.hasPpcDetail ? r.adSales : null,
            'Organic Sales': r.organicSales,
            Impressions: r.hasPpcDetail ? r.impressions : null,
            Clicks: r.hasPpcDetail ? r.clicks : null,
            CTR: r.hasPpcDetail ? r.ctr : null,
            CPC: r.hasPpcDetail ? r.cpc : null,
            ACoS: r.acos,
            TACoS: r.hasAnyAdSpend ? r.tacos : null,
            ROAS: r.roas,
          });
        });
      });
      const summarySheet = makeStyledSheet(summaryRows, {
        currencyCols: ['Sales','Refund Cost','Ad Spend','Ad Sales','Organic Sales','CPC'],
        pctCols: ['CVR','CTR','ACoS','TACoS'],
        numCols: ['Units','Sessions','Impressions','Clicks','Year'],
        multCols: ['ROAS'],
      });
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Dashboard Summary');

      // ============ Tab 2 — Trends (with YoY column) ============
      const trendRows = [];
      state.availableYears.forEach(year => {
        MONTHS.forEach(month => {
          const r = rollupForMonth(month, year);
          if (r.sales === 0 && r.units === 0) return;
          const priorYear = year - 1;
          const priorR = hasDataFor(month, priorYear) ? rollupForMonth(month, priorYear) : null;
          const yoyPct = (priorR && priorR.sales > 0) ? (r.sales - priorR.sales) / priorR.sales : null;
          trendRows.push({
            Year: year,
            Month: month,
            Sales: r.sales,
            Units: r.units,
            Sessions: r.sessions,
            CVR: r.cvr,
            'Refund Cost': r.refundCost,
            'Ad Spend': r.hasAnyAdSpend ? r.adSpend : null,
            'Ad Sales': r.hasPpcDetail ? r.adSales : null,
            'Organic Sales': r.organicSales,
            ACoS: r.acos,
            TACoS: r.hasAnyAdSpend ? r.tacos : null,
            ROAS: r.roas,
            'YoY Sales %': yoyPct,
          });
        });
      });
      const trendSheet = makeStyledSheet(trendRows, {
        currencyCols: ['Sales','Refund Cost','Ad Spend','Ad Sales','Organic Sales'],
        pctCols: ['CVR','ACoS','TACoS','YoY Sales %'],
        numCols: ['Units','Sessions','Year'],
        multCols: ['ROAS'],
      });
      XLSX.utils.book_append_sheet(wb, trendSheet, 'Trends');

      // ============ Tab 3 — By Product ============
      const productRows = [];
      state.availableYears.forEach(year => {
        MONTHS.forEach(month => {
          state.catalog.forEach(c => {
            const sbRow = state.sellerboard.find(r => r.asin === c.asin && r.month === month && r.year === year);
            if (!sbRow || (sbRow.gross_sales === 0 && sbRow.units === 0)) return;
            const sessions = sbRow.sessions || 0;
            const units = sbRow.units || 0;
            productRows.push({
              Year: year,
              Month: month,
              'Internal SKU': c.internal_sku,
              ASIN: c.asin,
              'Product Name': c.product_name,
              Category: c.category || '',
              Units: units,
              Sessions: sessions,
              CVR: sessions > 0 ? units / sessions : 0,
              Sales: +sbRow.gross_sales || 0,
              'Refund Cost': Math.abs(+sbRow.refunds || 0),
            });
          });
        });
      });
      const productSheet = makeStyledSheet(productRows, {
        currencyCols: ['Sales','Refund Cost'],
        pctCols: ['CVR'],
        numCols: ['Units','Sessions','Year'],
      });
      XLSX.utils.book_append_sheet(wb, productSheet, 'By Product');

      // ============ Tab 4 — PPC Detail ============
      const ppcRows = state.ppc
        .slice()
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          const mi = MONTHS.indexOf(a.month) - MONTHS.indexOf(b.month);
          if (mi !== 0) return mi;
          return (b.spend || 0) - (a.spend || 0);
        })
        .map(r => {
          const impressions = r.impressions || 0;
          const clicks = r.clicks || 0;
          const spend = +r.spend || 0;
          const sales = +r.sales || 0;
          const orders = r.orders || 0;
          return {
            Year: r.year,
            Month: r.month,
            Campaign: r.campaign,
            Type: r.ad_type || '',
            Impressions: impressions,
            Clicks: clicks,
            CTR: impressions > 0 ? clicks / impressions : 0,
            Spend: spend,
            CPC: clicks > 0 ? spend / clicks : 0,
            Orders: orders,
            Sales: sales,
            ACoS: sales > 0 ? spend / sales : 0,
            ROAS: spend > 0 ? sales / spend : 0,
          };
        });
      const ppcSheet = makeStyledSheet(ppcRows, {
        currencyCols: ['Spend','CPC','Sales'],
        pctCols: ['CTR','ACoS'],
        numCols: ['Impressions','Clicks','Orders','Year'],
        multCols: ['ROAS'],
      });
      XLSX.utils.book_append_sheet(wb, ppcSheet, 'PPC Detail');

      const today = new Date().toISOString().slice(0, 10);
      const filename = `Chocxo_Amazon_KPIs_${today}.xlsx`;
      XLSX.writeFile(wb, filename);

      btn.innerHTML = '<span>✓</span><span class="hidden sm:inline">Downloaded</span>';
      setTimeout(() => { btn.innerHTML = originalHTML; btn.disabled = false; }, 2000);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed: ' + e.message);
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }, 50);
}

function makeStyledSheet(rows, opts = {}) {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (!rows.length) return ws;

  const headers = Object.keys(rows[0]);
  const range = XLSX.utils.decode_range(ws['!ref']);

  ws['!cols'] = headers.map(h => {
    let maxLen = h.length;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
      const v = rows[i][h];
      const s = (v == null) ? '' : (typeof v === 'number' ? v.toFixed(2) : String(v));
      if (s.length > maxLen) maxLen = s.length;
    }
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });

  const headerStyle = { font: { bold: true }, alignment: { horizontal: 'left', vertical: 'center' } };
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }

  const fmtMap = {};
  (opts.currencyCols || []).forEach(col => { fmtMap[col] = '"$"#,##0.00;[Red]("$"#,##0.00)'; });
  (opts.pctCols || []).forEach(col => { fmtMap[col] = '0.0%'; });
  (opts.numCols || []).forEach(col => { fmtMap[col] = '#,##0'; });
  (opts.multCols || []).forEach(col => { fmtMap[col] = '0.00"x"'; });

  for (let r = 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = headers[c];
      const fmt = fmtMap[header];
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      if (fmt) {
        ws[addr].s = ws[addr].s || {};
        ws[addr].z = fmt;
      }
    }
  }

  return ws;
}

// ============================================================
// ROUTING & INIT
// ============================================================
function showPage(path) {
  const dashSections = document.querySelectorAll('main > section');
  const trendsPage   = document.getElementById('trends-page');
  const productsPage = document.getElementById('products-page');
  const ppcPage      = document.getElementById('ppc-page');

  dashSections.forEach(s => s.classList.add('hidden'));
  trendsPage.classList.add('hidden');
  productsPage.classList.add('hidden');
  ppcPage.classList.add('hidden');

  if (path === '/trends') { trendsPage.classList.remove('hidden'); renderTrends(); }
  else if (path === '/products') { productsPage.classList.remove('hidden'); renderProducts(); }
  else if (path === '/ppc') { ppcPage.classList.remove('hidden'); renderPpc(); }
  else { dashSections.forEach(s => s.classList.remove('hidden')); renderDashboard(); }

  document.querySelectorAll('nav a').forEach(a => {
    const href = a.getAttribute('href');
    if (href === path || (path === '/' && href === '/')) a.classList.add('bg-white/10');
    else a.classList.remove('bg-white/10');
  });
}

async function init() {
  document.getElementById('data-status').textContent = 'Loading…';
  await refreshAuthUI();
  await loadAllData();
  document.getElementById('data-status').textContent = '';
  setupSelectors(() => showPage(window.location.pathname));
  setupTableInteractions();
  setupExportButton();
  setupRouter(showPage);
}

if (document.getElementById('month-select')) init();
