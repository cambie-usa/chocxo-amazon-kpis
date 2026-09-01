// ============================================================
// admin.js — Chocxo admin panel (with CIN7 + Meta support)
// ============================================================

// Auth gate
(async () => {
  const { data } = await sb.auth.getUser();
  if (!data.user) { window.location.href = '/login'; return; }
  document.getElementById('auth-status').textContent = data.user.email;
})();

document.getElementById('logout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = '/';
});

// Toast
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  const colors = { info: 'bg-cocoa', success: 'bg-good', error: 'bg-bad', warn: 'bg-gold' };
  el.className = `${colors[type]} text-white px-4 py-3 rounded shadow-lg text-sm max-w-sm`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Tab switching
document.querySelectorAll('.admin-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.admin-tab').forEach(b => {
      b.classList.remove('border-cocoa', 'text-navy');
      b.classList.add('border-transparent', 'text-slate-500');
    });
    btn.classList.remove('border-transparent', 'text-slate-500');
    btn.classList.add('border-cocoa', 'text-navy');
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('tab-' + tab).classList.remove('hidden');

    if (tab === 'catalog')     loadCatalogTable();
    if (tab === 'edit-sb')     loadSellerboardTable();
    if (tab === 'edit-ppc')    loadPpcTable();
    if (tab === 'edit-web')    loadWebSalesTable();
    if (tab === 'edit-meta')   loadMetaAdsTable();
  });
});

// ============================================================
// Month/year selector population
// ============================================================
const CURRENT_YEAR_DEFAULT = new Date().getFullYear();
const YEAR_OPTIONS = [2025, 2026, 2027];

// Populate all month/year dropdowns
function populateSelectors() {
  const monthSels = ['sb-month','ppc-month','web-month','meta-month',
                     'edit-sb-month','edit-ppc-month','edit-web-month','edit-meta-month'];
  const yearSels  = ['sb-year','ppc-year','web-year','meta-year',
                     'edit-sb-year','edit-ppc-year','edit-web-year','edit-meta-year'];

  monthSels.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (id.startsWith('edit-')) {
      const all = document.createElement('option');
      all.value = ''; all.textContent = 'All months';
      sel.appendChild(all);
    }
    MONTHS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m;
      sel.appendChild(opt);
    });
    // Default to current month for upload cards
    if (!id.startsWith('edit-')) {
      const now = new Date();
      sel.value = MONTHS[now.getMonth()];
    }
  });

  yearSels.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    if (id.startsWith('edit-')) {
      const all = document.createElement('option');
      all.value = ''; all.textContent = 'All years';
      sel.appendChild(all);
    }
    YEAR_OPTIONS.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      sel.appendChild(opt);
    });
    if (!id.startsWith('edit-')) {
      sel.value = CURRENT_YEAR_DEFAULT;
    }
  });
}
populateSelectors();

// ============================================================
// Header mappings for the four file types
// ============================================================
const SB_HEADER_MAP = {
  asin:         ['asin'],
  sku:          ['sku', 'internal sku', 'merchant sku', 'seller sku'],
  sessions:     ['sessions', 'total sessions'],
  units:        ['units sold', 'units', 'unit ordered', 'units ordered'],
  gross_sales:  ['gross sales', 'sales', 'ordered product sales', 'gross revenue'],
  refunds:      ['refunds', 'refund cost', 'refund сost'],
};
const PPC_HEADER_MAP = {
  campaign:    ['campaign', 'campaign name', 'campaigns'],
  ad_type:     ['ad type', 'type', 'campaign type'],
  impressions: ['impressions'],
  clicks:      ['clicks'],
  spend:       ['spend', 'spend(usd)', 'cost'],
  sales:       ['sales', 'sales(usd)', 'attributed sales', '7 day total sales'],
  orders:      ['orders', '7 day total orders', 'attributed orders'],
};
const CIN7_HEADER_MAP = {
  sku:      ['sku'],
  product:  ['product'],
  brand:    ['brand'],
  quantity: ['quantity', 'qty'],
  sales:    ['sale', 'sales'],
  profit:   ['profit'],
  cogs:     ['cogs', 'cost'],
};
const META_HEADER_MAP = {
  ad_name:      ['ad name'],
  ad_delivery:  ['ad delivery'],
  spend:        ['amount spent (usd)', 'amount spent'],
  impressions:  ['impressions'],
  link_clicks:  ['link clicks'],
  all_clicks:   ['clicks (all)'],
  purchases:    ['results'],
  roas:         ['purchase roas (return on ad spend)', 'purchase roas'],
};

const CHOCXO_WEB_SKUS = new Set(['900143','900900','900921','900950','900954','900959',
                                  '900969','900975','900976','900978','900979','900980']);
const CIN7_SKU_ALIASES = { '900959a': '900959' };

function normHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildColumnIndex(headers, headerMap) {
  const idx = {};
  const normalized = headers.map(normHeader);
  for (const [canonical, variants] of Object.entries(headerMap)) {
    idx[canonical] = -1;
    for (const variant of variants) {
      const i = normalized.indexOf(variant);
      if (i >= 0) { idx[canonical] = i; break; }
    }
  }
  return idx;
}

async function parseFileAll(file) {
  const buf = await file.arrayBuffer();
  let workbook;
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(buf);
    workbook = XLSX.read(text, { type: 'string' });
  } else {
    workbook = XLSX.read(buf, { type: 'array' });
  }

  const results = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (!rows.length) continue;

    // Try each header row in the first 10 rows
    for (let hdrIdx = 0; hdrIdx < Math.min(rows.length, 12); hdrIdx++) {
      const headers = rows[hdrIdx];
      if (!headers || !headers.some(v => typeof v === 'string' && v.trim().length > 0)) continue;

      const sbIdx = buildColumnIndex(headers, SB_HEADER_MAP);
      const ppcIdx = buildColumnIndex(headers, PPC_HEADER_MAP);
      const cin7Idx = buildColumnIndex(headers, CIN7_HEADER_MAP);
      const metaIdx = buildColumnIndex(headers, META_HEADER_MAP);

      const sbScore = ['asin','sessions','units','gross_sales','refunds'].filter(k => sbIdx[k] >= 0).length;
      const ppcScore = Object.values(ppcIdx).filter(i => i >= 0).length;
      const cin7Score = ['sku','product','quantity','sales'].filter(k => cin7Idx[k] >= 0).length;
      const metaScore = ['ad_name','spend','impressions'].filter(k => metaIdx[k] >= 0).length;

      const scores = [
        { type: 'sellerboard', score: sbScore, colIdx: sbIdx, minScore: 3 },
        { type: 'ppc',         score: ppcScore, colIdx: ppcIdx, minScore: 3 },
        { type: 'cin7',        score: cin7Score, colIdx: cin7Idx, minScore: 3 },
        { type: 'meta',        score: metaScore, colIdx: metaIdx, minScore: 3 },
      ];
      const best = scores.filter(s => s.score >= s.minScore).sort((a,b) => b.score - a.score)[0];
      if (!best) continue;

      const dataRows = rows.slice(hdrIdx + 1).filter(r => r && r.some(v => v != null && v !== ''));
      results.push({ type: best.type, sheetName, headers, colIdx: best.colIdx, dataRows, score: best.score });
      break; // one section per sheet
    }
  }
  return results;
}

async function parseFile(file) {
  const all = await parseFileAll(file);
  if (!all.length) return null;
  return all.reduce((best, cur) => cur.score > (best?.score ?? -1) ? cur : best, null);
}

// ============================================================
// Sellerboard parser (existing, unchanged from previous version)
// ============================================================
function rowsToSellerboardRecords(parsed, month, year) {
  const { colIdx, dataRows } = parsed;
  const skuColExists = colIdx.sku >= 0;
  const stats = { skippedParent: 0, skippedNotInCatalog: 0, accepted: 0 };

  const cleaned = dataRows
    .map(r => {
      const asin = colIdx.asin >= 0 ? String(r[colIdx.asin] || '').trim() : '';
      const sku  = colIdx.sku  >= 0 ? String(r[colIdx.sku]  || '').trim() : '';
      return {
        asin, _sku: sku,
        sessions: numOrZero(r[colIdx.sessions]),
        units:    numOrZero(r[colIdx.units]),
        gross_sales: numOrZero(r[colIdx.gross_sales]),
        refunds:  numOrZero(r[colIdx.refunds]),
      };
    })
    .filter(r => {
      if (!r.asin || !/^B0/i.test(r.asin)) return false;
      if (skuColExists && !r._sku) { stats.skippedParent++; return false; }
      if (skuColExists && !CATALOG_BY_ASIN[r.asin]) {
        stats.skippedNotInCatalog++; return false;
      }
      return true;
    });

  const byAsin = {};
  for (const r of cleaned) {
    if (!byAsin[r.asin]) {
      byAsin[r.asin] = {
        month, year, brand: BRAND_NAME, asin: r.asin,
        sessions: r.sessions, units: r.units,
        gross_sales: r.gross_sales, refunds: r.refunds,
      };
    } else {
      byAsin[r.asin].sessions += r.sessions;
      byAsin[r.asin].units += r.units;
      byAsin[r.asin].gross_sales += r.gross_sales;
      byAsin[r.asin].refunds += r.refunds;
    }
  }

  const records = Object.values(byAsin);
  stats.accepted = records.length;
  records._stats = stats;
  return records;
}

// ============================================================
// Amazon PPC parser (existing)
// ============================================================
function rowsToPpcRecords(parsed, month, year) {
  const { colIdx, dataRows } = parsed;
  const byCampaign = {};
  for (const r of dataRows) {
    const campaign = colIdx.campaign >= 0 ? String(r[colIdx.campaign] || '').trim() : '';
    if (!campaign) continue;
    const ad_type = colIdx.ad_type >= 0 ? String(r[colIdx.ad_type] || '').trim() : '';
    const impressions = numOrZero(r[colIdx.impressions]);
    const clicks = numOrZero(r[colIdx.clicks]);
    const spend = numOrZero(r[colIdx.spend]);
    const sales = numOrZero(r[colIdx.sales]);
    const orders = numOrZero(r[colIdx.orders]);

    if (!byCampaign[campaign]) {
      byCampaign[campaign] = {
        month, year, brand: BRAND_NAME,
        campaign, ad_type,
        impressions, clicks, spend, sales, orders,
      };
    } else {
      byCampaign[campaign].impressions += impressions;
      byCampaign[campaign].clicks += clicks;
      byCampaign[campaign].spend += spend;
      byCampaign[campaign].sales += sales;
      byCampaign[campaign].orders += orders;
    }
  }
  return Object.values(byCampaign);
}

// ============================================================
// NEW: CIN7 Web Sales parser
// ============================================================
function rowsToWebSalesRecords(parsed, month, year) {
  const { colIdx, dataRows } = parsed;
  const stats = { skippedCS6: 0, skippedTax: 0, skippedShipping: 0,
                  skippedNonChocxo: 0, skippedUnknown: 0, aliased: 0, accepted: 0 };

  const cleaned = [];
  for (const r of dataRows) {
    let sku = colIdx.sku >= 0 ? String(r[colIdx.sku] || '').trim() : '';
    const brand = colIdx.brand >= 0 ? String(r[colIdx.brand] || '').trim() : '';
    if (!sku) continue;

    // Alias fix (historical SKU typos)
    if (CIN7_SKU_ALIASES[sku]) {
      sku = CIN7_SKU_ALIASES[sku];
      stats.aliased++;
    }

    // Skip rules
    if (sku.toUpperCase().includes('-CS6')) { stats.skippedCS6++; continue; }
    if (sku.toUpperCase() === 'TAX' || sku === '1') { stats.skippedTax++; continue; }
    if (sku.toLowerCase().startsWith('discount') ||
        sku.toLowerCase().startsWith('shipping')) { stats.skippedShipping++; continue; }
    if (!brand || !brand.toLowerCase().includes('chocxo')) { stats.skippedNonChocxo++; continue; }
    if (!CHOCXO_WEB_SKUS.has(sku)) { stats.skippedUnknown++; continue; }

    cleaned.push({
      sku,
      quantity_singles: Math.round(numOrZero(r[colIdx.quantity])),
      sales:  numOrZero(r[colIdx.sales]),
      profit: numOrZero(r[colIdx.profit]),
      cogs:   numOrZero(r[colIdx.cogs]),
    });
  }

  // Aggregate by SKU
  const bySku = {};
  for (const r of cleaned) {
    if (!bySku[r.sku]) {
      bySku[r.sku] = { month, year, sku: r.sku,
                       quantity_singles: r.quantity_singles,
                       sales: r.sales, profit: r.profit, cogs: r.cogs };
    } else {
      bySku[r.sku].quantity_singles += r.quantity_singles;
      bySku[r.sku].sales += r.sales;
      bySku[r.sku].profit += r.profit;
      bySku[r.sku].cogs += r.cogs;
    }
  }

  const records = Object.values(bySku);
  stats.accepted = records.length;
  records._stats = stats;
  return records;
}

// ============================================================
// NEW: Meta Ads parser
// ============================================================
function rowsToMetaRecords(parsed, month, year) {
  const { colIdx, dataRows } = parsed;
  const byAdName = {};
  let skipped = 0;

  for (const r of dataRows) {
    const ad_name = colIdx.ad_name >= 0 ? String(r[colIdx.ad_name] || '').trim() : '';
    if (!ad_name) { skipped++; continue; }

    const spend = numOrZero(r[colIdx.spend]);
    const roas = numOrZero(r[colIdx.roas]);
    const impressions = Math.round(numOrZero(r[colIdx.impressions]));
    const link_clicks = Math.round(numOrZero(r[colIdx.link_clicks]));
    const all_clicks  = Math.round(numOrZero(r[colIdx.all_clicks]));
    const purchases   = Math.round(numOrZero(r[colIdx.purchases]));
    const purchase_value = spend * roas;
    const ad_delivery = colIdx.ad_delivery >= 0 ? String(r[colIdx.ad_delivery] || '').trim() : '';

    if (!byAdName[ad_name]) {
      byAdName[ad_name] = {
        month, year, ad_name, ad_delivery,
        spend, impressions, link_clicks, all_clicks,
        purchases, purchase_value,
      };
    } else {
      // Aggregate — Meta splits same ad across ad sets
      if (ad_delivery) byAdName[ad_name].ad_delivery = ad_delivery;
      byAdName[ad_name].spend += spend;
      byAdName[ad_name].impressions += impressions;
      byAdName[ad_name].link_clicks += link_clicks;
      byAdName[ad_name].all_clicks += all_clicks;
      byAdName[ad_name].purchases += purchases;
      byAdName[ad_name].purchase_value += purchase_value;
    }
  }

  const records = Object.values(byAdName).map(r => ({
    ...r,
    spend: +r.spend.toFixed(2),
    purchase_value: +r.purchase_value.toFixed(2),
  }));
  records._stats = { accepted: records.length, skipped };
  return records;
}

function numOrZero(v) {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,$%]/g, ''));
  return isNaN(n) ? 0 : n;
}

// Catalog cache
let CATALOG_BY_ASIN = {};
async function loadCatalogCache() {
  const { data, error } = await sb.from('catalog').select('asin, brand, internal_sku');
  if (error) { console.error('catalog load:', error); return; }
  CATALOG_BY_ASIN = {};
  for (const row of data || []) {
    CATALOG_BY_ASIN[row.asin] = { brand: row.brand, sku: row.internal_sku };
  }
}
loadCatalogCache();

// ============================================================
// Drag-drop setup
// ============================================================
function setupDrop(dropId, fileInputId, onFile) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(fileInputId);
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('bg-cocoa/10', 'border-cocoa');
  });
  drop.addEventListener('dragleave', () => {
    drop.classList.remove('bg-cocoa/10', 'border-cocoa');
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('bg-cocoa/10', 'border-cocoa');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) onFile(files);
  });
  input.addEventListener('change', () => {
    if (input.files.length) onFile(Array.from(input.files));
  });
}

setupDrop('sb-drop', 'sb-file', async (files) => {
  const file = files[0];
  const month = document.getElementById('sb-month').value;
  const year = parseInt(document.getElementById('sb-year').value, 10);
  await handleSingleFile(file, month, year, 'sb', 'sellerboard');
});
setupDrop('ppc-drop', 'ppc-file', async (files) => {
  const file = files[0];
  const month = document.getElementById('ppc-month').value;
  const year = parseInt(document.getElementById('ppc-year').value, 10);
  await handleSingleFile(file, month, year, 'ppc', 'ppc');
});
setupDrop('web-drop', 'web-file', async (files) => {
  const file = files[0];
  const month = document.getElementById('web-month').value;
  const year = parseInt(document.getElementById('web-year').value, 10);
  await handleSingleFile(file, month, year, 'web', 'cin7');
});
setupDrop('meta-drop', 'meta-file', async (files) => {
  const file = files[0];
  const month = document.getElementById('meta-month').value;
  const year = parseInt(document.getElementById('meta-year').value, 10);
  await handleSingleFile(file, month, year, 'meta', 'meta');
});

async function handleSingleFile(file, month, year, uiPrefix, expectedType) {
  const previewEl = document.getElementById(uiPrefix + '-preview');
  previewEl.classList.remove('hidden');
  previewEl.innerHTML = `<p class="text-sm text-slate-600">Parsing ${file.name}…</p>`;

  let parsed;
  try {
    parsed = await parseFile(file);
  } catch (e) {
    previewEl.innerHTML = `<p class="text-bad text-sm">Failed to parse file: ${e.message}</p>`;
    return;
  }
  if (!parsed) {
    previewEl.innerHTML = `<p class="text-bad text-sm">Couldn't find a recognized data sheet inside this file.</p>`;
    return;
  }

  const typeNames = { sellerboard: 'Sellerboard', ppc: 'Amazon PPC', cin7: 'CIN7', meta: 'Meta Ads' };
  if (parsed.type !== expectedType) {
    previewEl.innerHTML = `<p class="text-bad text-sm">Detected as ${typeNames[parsed.type] || parsed.type} data, not ${typeNames[expectedType]}. Upload it in the correct zone.</p>`;
    return;
  }

  let records;
  switch (expectedType) {
    case 'sellerboard': records = rowsToSellerboardRecords(parsed, month, year); break;
    case 'ppc':         records = rowsToPpcRecords(parsed, month, year); break;
    case 'cin7':        records = rowsToWebSalesRecords(parsed, month, year); break;
    case 'meta':        records = rowsToMetaRecords(parsed, month, year); break;
  }

  if (!records.length) {
    previewEl.innerHTML = `<p class="text-bad text-sm">No valid rows found.</p>`;
    return;
  }

  renderPreview(previewEl, records, expectedType, month, year);
}

function renderPreview(previewEl, records, type, month, year) {
  let headerHtml = '';
  let rowsHtml = '';

  if (type === 'sellerboard') {
    headerHtml = '<tr><th class="text-left py-1 px-2">ASIN</th><th class="text-right py-1 px-2">Sessions</th><th class="text-right py-1 px-2">Units</th><th class="text-right py-1 px-2">Sales</th><th class="text-right py-1 px-2">Refunds</th></tr>';
    rowsHtml = records.slice(0, 6).map(r => `
      <tr class="border-t border-slate-200">
        <td class="py-1 px-2 font-mono text-xs">${r.asin}</td>
        <td class="py-1 px-2 text-right">${r.sessions}</td>
        <td class="py-1 px-2 text-right">${r.units}</td>
        <td class="py-1 px-2 text-right">$${r.gross_sales.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">$${r.refunds.toFixed(2)}</td>
      </tr>`).join('');
  } else if (type === 'ppc') {
    headerHtml = '<tr><th class="text-left py-1 px-2">Campaign</th><th class="text-left py-1 px-2">Type</th><th class="text-right py-1 px-2">Spend</th><th class="text-right py-1 px-2">Sales</th></tr>';
    rowsHtml = records.slice(0, 6).map(r => `
      <tr class="border-t border-slate-200">
        <td class="py-1 px-2 text-xs truncate max-w-xs">${r.campaign}</td>
        <td class="py-1 px-2">${r.ad_type}</td>
        <td class="py-1 px-2 text-right">$${r.spend.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">$${r.sales.toFixed(2)}</td>
      </tr>`).join('');
  } else if (type === 'cin7') {
    headerHtml = '<tr><th class="text-left py-1 px-2">SKU</th><th class="text-right py-1 px-2">Qty (singles)</th><th class="text-right py-1 px-2">Sales</th><th class="text-right py-1 px-2">COGS</th><th class="text-right py-1 px-2">Profit</th></tr>';
    rowsHtml = records.slice(0, 6).map(r => `
      <tr class="border-t border-slate-200">
        <td class="py-1 px-2 font-mono text-xs">${r.sku}</td>
        <td class="py-1 px-2 text-right">${r.quantity_singles} (${(r.quantity_singles/6).toFixed(2)} cases)</td>
        <td class="py-1 px-2 text-right">$${r.sales.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">$${r.cogs.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">$${r.profit.toFixed(2)}</td>
      </tr>`).join('');
  } else if (type === 'meta') {
    headerHtml = '<tr><th class="text-left py-1 px-2">Ad name</th><th class="text-right py-1 px-2">Spend</th><th class="text-right py-1 px-2">Impr</th><th class="text-right py-1 px-2">Purchases</th><th class="text-right py-1 px-2">Value</th></tr>';
    rowsHtml = records.slice(0, 6).map(r => `
      <tr class="border-t border-slate-200">
        <td class="py-1 px-2 text-xs truncate max-w-xs">${r.ad_name}</td>
        <td class="py-1 px-2 text-right">$${r.spend.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">${r.impressions.toLocaleString()}</td>
        <td class="py-1 px-2 text-right">${r.purchases}</td>
        <td class="py-1 px-2 text-right">$${r.purchase_value.toFixed(2)}</td>
      </tr>`).join('');
  }

  const stats = records._stats || {};
  let statsHtml = '';
  if (type === 'cin7') {
    const skipped = (stats.skippedCS6||0) + (stats.skippedTax||0) + (stats.skippedShipping||0) + (stats.skippedNonChocxo||0) + (stats.skippedUnknown||0);
    if (skipped || stats.aliased) {
      const parts = [];
      if (stats.skippedCS6) parts.push(`${stats.skippedCS6} -CS6 rows`);
      if (stats.skippedUnknown) parts.push(`${stats.skippedUnknown} unknown SKUs`);
      if (stats.skippedNonChocxo) parts.push(`${stats.skippedNonChocxo} non-Chocxo`);
      if (stats.skippedTax || stats.skippedShipping) parts.push(`${(stats.skippedTax||0)+(stats.skippedShipping||0)} tax/shipping`);
      if (stats.aliased) parts.push(`${stats.aliased} aliased (900959a→900959)`);
      statsHtml = `<p class="text-xs text-slate-500 mt-1">Skipped/normalized: ${parts.join(', ')}.</p>`;
    }
  } else if (type === 'sellerboard' && stats.skippedNotInCatalog) {
    statsHtml = `<p class="text-xs text-slate-500 mt-1">Skipped: ${stats.skippedParent||0} parent rows, ${stats.skippedNotInCatalog||0} non-Chocxo ASINs.</p>`;
  } else if (type === 'meta' && stats.skipped) {
    statsHtml = `<p class="text-xs text-slate-500 mt-1">Skipped ${stats.skipped} rows with no ad name.</p>`;
  }

  previewEl.innerHTML = `
    <div class="bg-slate-50 rounded p-3 text-xs">
      <p class="font-semibold text-navy mb-2">Preview · ${records.length} rows · ${month} ${year}</p>
      ${statsHtml}
      <table class="w-full text-xs mt-2">
        <thead class="text-slate-500">${headerHtml}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${records.length > 6 ? `<p class="text-slate-400 mt-2">… and ${records.length - 6} more</p>` : ''}
      <div class="flex gap-2 mt-3">
        <button class="upload-confirm bg-cocoa text-white px-4 py-1.5 rounded text-sm font-semibold hover:bg-cocoa/90">
          Upload ${records.length} rows
        </button>
        <button class="upload-cancel border border-slate-300 px-4 py-1.5 rounded text-sm font-semibold hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  `;
  previewEl.querySelector('.upload-confirm').addEventListener('click', async () => {
    await commitRecords(type, records);
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
  });
  previewEl.querySelector('.upload-cancel').addEventListener('click', () => {
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
  });
}

async function commitRecords(type, records) {
  const tableMap = {
    sellerboard: { table: 'sellerboard_data', onConflict: 'asin,month,year' },
    ppc:         { table: 'ppc_data',         onConflict: 'campaign,month,year' },
    cin7:        { table: 'web_sales_data',   onConflict: 'sku,month,year' },
    meta:        { table: 'web_ads_data',     onConflict: 'ad_name,month,year' },
  };
  const { table, onConflict } = tableMap[type];

  let inserted = 0;
  for (let i = 0; i < records.length; i += 200) {
    const chunk = records.slice(i, i + 200);
    const cleanChunk = chunk.map(({ _stats, ...rest }) => rest);
    const { error } = await sb.from(table).upsert(cleanChunk, { onConflict });
    if (error) {
      console.error(error);
      toast(`Error: ${error.message}`, 'error');
      return inserted;
    }
    inserted += chunk.length;
  }
  toast(`Uploaded ${inserted} rows to ${table}`, 'success');
  return inserted;
}

// ============================================================
// Bulk upload — auto-detects type from content
// ============================================================
setupDrop('bulk-drop', 'bulk-file', async (files) => {
  await loadCatalogCache();
  const queueEl = document.getElementById('bulk-queue');
  queueEl.innerHTML = '';
  for (const file of files) {
    const item = document.createElement('div');
    item.className = 'bg-white border border-slate-200 rounded p-3 flex items-center gap-3';
    item.innerHTML = `
      <span class="text-sm font-mono text-slate-600 flex-1 truncate">${file.name}</span>
      <span class="bulk-status text-xs text-slate-500">Parsing…</span>
    `;
    queueEl.appendChild(item);

    const status = item.querySelector('.bulk-status');
    try {
      const allParsed = await parseFileAll(file);
      if (!allParsed.length) {
        status.textContent = 'Skipped (no data found)';
        status.className = 'bulk-status text-xs text-bad';
        continue;
      }

      const month = inferMonth(file.name);
      const year = inferYear(file.name);

      if (!month || !year) {
        // Prompt for missing values
        const monthOpts = MONTHS.map(m=>`<option ${m===month?'selected':''} value="${m}">${m}</option>`).join('');
        const yearOpts = YEAR_OPTIONS.map(y=>`<option ${y===year?'selected':''} value="${y}">${y}</option>`).join('');
        status.innerHTML = `
          <select class="bulk-month border border-slate-300 rounded px-2 py-1 text-xs">${monthOpts}</select>
          <select class="bulk-year border border-slate-300 rounded px-2 py-1 text-xs">${yearOpts}</select>
          <button class="bulk-go bg-cocoa text-white text-xs px-2 py-1 rounded ml-1">Upload</button>
        `;
        status.className = 'bulk-status flex items-center gap-1';
        await new Promise(resolve => {
          status.querySelector('.bulk-go').addEventListener('click', async () => {
            const m = status.querySelector('.bulk-month').value;
            const y = parseInt(status.querySelector('.bulk-year').value, 10);
            await uploadAllSheets(allParsed, m, y, status);
            resolve();
          });
        });
      } else {
        await uploadAllSheets(allParsed, month, year, status);
      }
    } catch (e) {
      console.error(e);
      status.textContent = 'Error: ' + e.message;
      status.className = 'bulk-status text-xs text-bad';
    }
  }
});

async function uploadAllSheets(allParsed, month, year, status) {
  status.innerHTML = 'Uploading…';
  status.className = 'bulk-status text-xs text-slate-500';
  const summary = [];
  for (const parsed of allParsed) {
    let records;
    switch (parsed.type) {
      case 'sellerboard': records = rowsToSellerboardRecords(parsed, month, year); break;
      case 'ppc':         records = rowsToPpcRecords(parsed, month, year); break;
      case 'cin7':        records = rowsToWebSalesRecords(parsed, month, year); break;
      case 'meta':        records = rowsToMetaRecords(parsed, month, year); break;
      default: continue;
    }
    if (!records.length) continue;
    const inserted = await commitRecords(parsed.type, records);
    summary.push(`${inserted} ${parsed.type}`);
  }
  if (!summary.length) {
    status.textContent = `⚠️ No rows uploaded · ${month} ${year}`;
    status.className = 'bulk-status text-xs text-amber';
  } else {
    status.textContent = `✓ ${summary.join(', ')} · ${month} ${year}`;
    status.className = 'bulk-status text-xs text-good';
  }
}

function inferMonth(filename) {
  const lc = filename.toLowerCase();
  for (const m of MONTHS) {
    if (lc.includes(m.toLowerCase())) return m;
    if (lc.includes(m.slice(0,3).toLowerCase())) return m;
  }
  return null;
}

function inferYear(filename) {
  const match = filename.match(/(20\d{2})/);
  return match ? parseInt(match[1], 10) : null;
}

// ============================================================
// Catalog management (unchanged)
// ============================================================
async function loadCatalogTable() {
  const { data, error } = await sb.from('catalog').select('*').order('internal_sku');
  if (error) { toast(error.message, 'error'); return; }
  const body = document.getElementById('catalog-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2 font-mono text-xs">${row.asin}</td>
      <td class="px-3 py-2 font-bold">${row.internal_sku}</td>
      <td class="px-3 py-2">${row.product_name}</td>
      <td class="px-3 py-2">${row.category || ''}</td>
      <td class="px-3 py-2 text-right space-x-1">
        <button data-action="edit" data-asin="${row.asin}" class="text-xs text-cocoa hover:underline">Edit</button>
        <button data-action="delete" data-asin="${row.asin}" class="text-xs text-bad hover:underline">Delete</button>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const asin = btn.dataset.asin;
      if (action === 'delete') deleteSku(asin);
      else if (action === 'edit') editSku(asin, data.find(r => r.asin === asin));
    });
  });
}

document.getElementById('add-sku-btn').addEventListener('click', () => editSku(null, null));

function editSku(asin, existing) {
  const isNew = !existing;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
  modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
      <h3 class="text-lg font-bold text-navy mb-4">${isNew ? 'Add SKU' : 'Edit SKU'}</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-bold uppercase text-navy mb-1">ASIN</label>
          <input id="m-asin" type="text" value="${existing?.asin || ''}" ${isNew ? '' : 'disabled'} class="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono disabled:bg-slate-100" />
        </div>
        <div>
          <label class="block text-xs font-bold uppercase text-navy mb-1">Internal SKU</label>
          <input id="m-sku" type="text" value="${existing?.internal_sku || ''}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-bold uppercase text-navy mb-1">Product Name</label>
          <input id="m-name" type="text" value="${existing?.product_name || ''}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-xs font-bold uppercase text-navy mb-1">Category</label>
          <input id="m-cat" type="text" value="${existing?.category || ''}" class="w-full border border-slate-300 rounded px-3 py-2 text-sm" />
        </div>
      </div>
      <div class="flex justify-end gap-2 mt-6">
        <button id="m-cancel" class="px-4 py-2 text-sm border border-slate-300 rounded hover:bg-slate-100">Cancel</button>
        <button id="m-save" class="px-4 py-2 text-sm bg-cocoa text-white rounded hover:bg-cocoa/90">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#m-cancel').addEventListener('click', () => modal.remove());
  modal.querySelector('#m-save').addEventListener('click', async () => {
    const record = {
      asin: modal.querySelector('#m-asin').value.trim(),
      internal_sku: modal.querySelector('#m-sku').value.trim(),
      product_name: modal.querySelector('#m-name').value.trim(),
      brand: 'Chocxo',
      category: modal.querySelector('#m-cat').value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (!record.asin || !record.internal_sku || !record.product_name) {
      toast('ASIN, SKU, and Name are required', 'error'); return;
    }
    const { error } = await sb.from('catalog').upsert(record);
    if (error) { toast(error.message, 'error'); return; }
    toast(isNew ? 'SKU added' : 'SKU updated', 'success');
    modal.remove();
    loadCatalogTable();
    loadCatalogCache();
  });
}

async function deleteSku(asin) {
  if (!confirm(`Delete SKU ${asin}? This won't remove existing Sellerboard data.`)) return;
  const { error } = await sb.from('catalog').delete().eq('asin', asin);
  if (error) { toast(error.message, 'error'); return; }
  toast('SKU deleted', 'success');
  loadCatalogTable();
  loadCatalogCache();
}

// ============================================================
// Edit tables — Sellerboard, PPC, Web Sales, Meta Ads
// ============================================================
async function loadSellerboardTable() {
  const year = document.getElementById('edit-sb-year').value;
  const month = document.getElementById('edit-sb-month').value;
  let q = sb.from('sellerboard_data').select('*');
  if (year)  q = q.eq('year', parseInt(year, 10));
  if (month) q = q.eq('month', month);
  const { data, error } = await q.order('year').order('month').order('asin');
  if (error) { toast(error.message, 'error'); return; }
  const body = document.getElementById('edit-sb-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2">${row.month}</td>
      <td class="px-3 py-2">${row.year}</td>
      <td class="px-3 py-2 font-mono text-xs">${row.asin}</td>
      <td class="px-3 py-2 text-right"><input data-field="sessions" data-id="${row.id}" type="number" value="${row.sessions}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="units" data-id="${row.id}" type="number" value="${row.units}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="gross_sales" data-id="${row.id}" type="number" step="0.01" value="${row.gross_sales}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="refunds" data-id="${row.id}" type="number" step="0.01" value="${row.refunds}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><button data-del="${row.id}" class="text-xs text-bad hover:underline">Delete</button></td>
    `;
    body.appendChild(tr);
  });
  wireEditTable(body, 'sellerboard_data', loadSellerboardTable);
}
document.getElementById('edit-sb-month').addEventListener('change', loadSellerboardTable);
document.getElementById('edit-sb-year').addEventListener('change', loadSellerboardTable);

async function loadPpcTable() {
  const year = document.getElementById('edit-ppc-year').value;
  const month = document.getElementById('edit-ppc-month').value;
  let q = sb.from('ppc_data').select('*');
  if (year)  q = q.eq('year', parseInt(year, 10));
  if (month) q = q.eq('month', month);
  const { data, error } = await q.order('year').order('month').order('campaign');
  if (error) { toast(error.message, 'error'); return; }
  const body = document.getElementById('edit-ppc-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2">${row.month}</td>
      <td class="px-3 py-2">${row.year}</td>
      <td class="px-3 py-2 text-xs">${row.campaign}</td>
      <td class="px-3 py-2 text-center">${row.ad_type || ''}</td>
      <td class="px-3 py-2 text-right"><input data-field="impressions" data-id="${row.id}" type="number" value="${row.impressions}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="clicks" data-id="${row.id}" type="number" value="${row.clicks}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="spend" data-id="${row.id}" type="number" step="0.01" value="${row.spend}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="sales" data-id="${row.id}" type="number" step="0.01" value="${row.sales}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="orders" data-id="${row.id}" type="number" value="${row.orders}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><button data-del="${row.id}" class="text-xs text-bad hover:underline">Delete</button></td>
    `;
    body.appendChild(tr);
  });
  wireEditTable(body, 'ppc_data', loadPpcTable);
}
document.getElementById('edit-ppc-month').addEventListener('change', loadPpcTable);
document.getElementById('edit-ppc-year').addEventListener('change', loadPpcTable);

async function loadWebSalesTable() {
  const year = document.getElementById('edit-web-year').value;
  const month = document.getElementById('edit-web-month').value;
  let q = sb.from('web_sales_data').select('*');
  if (year)  q = q.eq('year', parseInt(year, 10));
  if (month) q = q.eq('month', month);
  const { data, error } = await q.order('year').order('month').order('sku');
  if (error) { toast(error.message, 'error'); return; }
  const body = document.getElementById('edit-web-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2">${row.month}</td>
      <td class="px-3 py-2">${row.year}</td>
      <td class="px-3 py-2 font-mono text-xs">${row.sku}</td>
      <td class="px-3 py-2 text-right"><input data-field="quantity_singles" data-id="${row.id}" type="number" value="${row.quantity_singles}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="sales" data-id="${row.id}" type="number" step="0.01" value="${row.sales}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="cogs" data-id="${row.id}" type="number" step="0.01" value="${row.cogs}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="profit" data-id="${row.id}" type="number" step="0.01" value="${row.profit}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><button data-del="${row.id}" class="text-xs text-bad hover:underline">Delete</button></td>
    `;
    body.appendChild(tr);
  });
  wireEditTable(body, 'web_sales_data', loadWebSalesTable);
}
document.getElementById('edit-web-month').addEventListener('change', loadWebSalesTable);
document.getElementById('edit-web-year').addEventListener('change', loadWebSalesTable);

async function loadMetaAdsTable() {
  const year = document.getElementById('edit-meta-year').value;
  const month = document.getElementById('edit-meta-month').value;
  let q = sb.from('web_ads_data').select('*');
  if (year)  q = q.eq('year', parseInt(year, 10));
  if (month) q = q.eq('month', month);
  const { data, error } = await q.order('year').order('month').order('ad_name');
  if (error) { toast(error.message, 'error'); return; }
  const body = document.getElementById('edit-meta-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2">${row.month}</td>
      <td class="px-3 py-2">${row.year}</td>
      <td class="px-3 py-2 text-xs">${row.ad_name}</td>
      <td class="px-3 py-2 text-right"><input data-field="spend" data-id="${row.id}" type="number" step="0.01" value="${row.spend}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="impressions" data-id="${row.id}" type="number" value="${row.impressions}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="link_clicks" data-id="${row.id}" type="number" value="${row.link_clicks}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="purchases" data-id="${row.id}" type="number" value="${row.purchases}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="purchase_value" data-id="${row.id}" type="number" step="0.01" value="${row.purchase_value}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><button data-del="${row.id}" class="text-xs text-bad hover:underline">Delete</button></td>
    `;
    body.appendChild(tr);
  });
  wireEditTable(body, 'web_ads_data', loadMetaAdsTable);
}
document.getElementById('edit-meta-month').addEventListener('change', loadMetaAdsTable);
document.getElementById('edit-meta-year').addEventListener('change', loadMetaAdsTable);

// Shared edit-table wiring
function wireEditTable(body, tableName, reloadFn) {
  body.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = +input.dataset.id;
      const field = input.dataset.field;
      const value = parseFloat(input.value) || 0;
      const { error } = await sb.from(tableName).update({ [field]: value }).eq('id', id);
      if (error) { toast(error.message, 'error'); }
      else { input.classList.add('bg-green-50'); setTimeout(() => input.classList.remove('bg-green-50'), 500); }
    });
  });
  body.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this row?')) return;
      const { error } = await sb.from(tableName).delete().eq('id', +btn.dataset.del);
      if (error) { toast(error.message, 'error'); return; }
      reloadFn();
    });
  });
}
