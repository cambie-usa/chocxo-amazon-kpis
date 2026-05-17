// ============================================================
// admin.js — Chocxo admin panel
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

    if (tab === 'catalog') loadCatalogTable();
    if (tab === 'edit-sb') loadSellerboardTable();
    if (tab === 'edit-ppc') loadPpcTable();
  });
});

// Populate month dropdowns
['sb-month','ppc-month','edit-sb-month','edit-ppc-month'].forEach(id => {
  const sel = document.getElementById(id);
  if (!sel) return;
  if (id.startsWith('edit-')) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = 'All months';
    sel.appendChild(opt);
  }
  MONTHS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    sel.appendChild(opt);
  });
  if (id === 'sb-month' || id === 'ppc-month') {
    sel.value = 'March';
  }
});

// File parsers
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

    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const r = rows[i];
      if (r && r.some(v => typeof v === 'string' && v.trim().length > 0)) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx < 0) continue;

    const headers = rows[headerRowIdx];
    const dataRows = rows.slice(headerRowIdx + 1).filter(r => r && r.some(v => v != null && v !== ''));

    const sbIdx = buildColumnIndex(headers, SB_HEADER_MAP);
    const ppcIdx = buildColumnIndex(headers, PPC_HEADER_MAP);
    const sbCoreScore = ['asin','sessions','units','gross_sales','refunds'].filter(k => sbIdx[k] >= 0).length;
    const ppcScore = Object.values(ppcIdx).filter(i => i >= 0).length;

    if (sbIdx.asin >= 0 && sbCoreScore >= 3 && sbCoreScore >= ppcScore) {
      results.push({ type: 'sellerboard', sheetName, headers, colIdx: sbIdx, dataRows, score: sbCoreScore });
    } else if (ppcIdx.campaign >= 0 && ppcScore >= 3) {
      results.push({ type: 'ppc', sheetName, headers, colIdx: ppcIdx, dataRows, score: ppcScore });
    }
  }
  return results;
}

async function parseFile(file) {
  const all = await parseFileAll(file);
  if (!all.length) return null;
  return all.reduce((best, cur) => cur.score > (best?.score ?? -1) ? cur : best, null);
}

// Single-brand version: every row gets brand = 'Chocxo'. Catalog ASINs filter, duplicates sum.
function rowsToSellerboardRecords(parsed, month) {
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
      // For Cambie-style multi-vendor exports, only keep Chocxo ASINs.
      // For single-brand exports without SKU, accept any ASIN (catalog can be permissive).
      if (skuColExists && !CATALOG_BY_ASIN[r.asin]) {
        stats.skippedNotInCatalog++; return false;
      }
      return true;
    });

  // Aggregate duplicate ASINs (FBA + FBM, .missing placeholders, etc.)
  const byAsin = {};
  for (const r of cleaned) {
    if (!byAsin[r.asin]) {
      byAsin[r.asin] = {
        month, year: CURRENT_YEAR, brand: BRAND_NAME, asin: r.asin,
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

function rowsToPpcRecords(parsed, month) {
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
        month, year: CURRENT_YEAR, brand: BRAND_NAME,
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

// Drag-drop setup
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
  await handleSingleFile(file, month, 'sb');
});
setupDrop('ppc-drop', 'ppc-file', async (files) => {
  const file = files[0];
  const month = document.getElementById('ppc-month').value;
  await handleSingleFile(file, month, 'ppc');
});

async function handleSingleFile(file, month, expectedType) {
  const previewEl = document.getElementById(expectedType + '-preview');
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

  const detected = parsed.type;
  if (expectedType === 'sb' && detected !== 'sellerboard') {
    previewEl.innerHTML = `<p class="text-bad text-sm">Detected this as PPC data, not Sellerboard. Upload it on the right side.</p>`;
    return;
  }
  if (expectedType === 'ppc' && detected !== 'ppc') {
    previewEl.innerHTML = `<p class="text-bad text-sm">Detected this as Sellerboard data, not PPC. Upload it on the left side.</p>`;
    return;
  }

  const records = detected === 'sellerboard'
    ? rowsToSellerboardRecords(parsed, month)
    : rowsToPpcRecords(parsed, month);

  if (!records.length) {
    previewEl.innerHTML = `<p class="text-bad text-sm">No valid rows found.</p>`;
    return;
  }

  const rowsHtml = records.slice(0, 6).map(r => {
    if (detected === 'sellerboard') {
      return `<tr class="border-t border-slate-200">
        <td class="py-1 px-2 font-mono text-xs">${r.asin}</td>
        <td class="py-1 px-2 text-right">${r.sessions}</td>
        <td class="py-1 px-2 text-right">${r.units}</td>
        <td class="py-1 px-2 text-right">$${r.gross_sales.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">$${r.refunds.toFixed(2)}</td>
      </tr>`;
    } else {
      return `<tr class="border-t border-slate-200">
        <td class="py-1 px-2 text-xs truncate max-w-xs">${r.campaign}</td>
        <td class="py-1 px-2">${r.ad_type}</td>
        <td class="py-1 px-2 text-right">$${r.spend.toFixed(2)}</td>
        <td class="py-1 px-2 text-right">$${r.sales.toFixed(2)}</td>
      </tr>`;
    }
  }).join('');

  const headerHtml = detected === 'sellerboard'
    ? '<tr><th class="text-left py-1 px-2">ASIN</th><th class="text-right py-1 px-2">Sessions</th><th class="text-right py-1 px-2">Units</th><th class="text-right py-1 px-2">Sales</th><th class="text-right py-1 px-2">Refunds</th></tr>'
    : '<tr><th class="text-left py-1 px-2">Campaign</th><th class="text-left py-1 px-2">Type</th><th class="text-right py-1 px-2">Spend</th><th class="text-right py-1 px-2">Sales</th></tr>';

  const statsBadge = records._stats
    ? `<p class="text-xs text-slate-500 mt-1">Skipped: ${records._stats.skippedParent} parent rows, ${records._stats.skippedNotInCatalog} non-Chocxo ASINs.</p>`
    : '';

  previewEl.innerHTML = `
    <div class="bg-slate-50 rounded p-3 text-xs">
      <p class="font-semibold text-navy mb-2">Preview · ${records.length} rows · ${month} · Chocxo</p>
      ${statsBadge}
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
    await commitRecords(detected, records);
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
  });
  previewEl.querySelector('.upload-cancel').addEventListener('click', () => {
    previewEl.classList.add('hidden');
    previewEl.innerHTML = '';
  });
}

async function commitRecords(type, records) {
  const table = type === 'sellerboard' ? 'sellerboard_data' : 'ppc_data';
  const onConflict = type === 'sellerboard' ? 'asin,month,year' : 'campaign,month,year';

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

// Bulk upload
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

      let month = inferMonth(file.name);

      if (!month) {
        status.innerHTML = `
          <select class="bulk-month border border-slate-300 rounded px-2 py-1 text-xs">${MONTHS.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>
          <button class="bulk-go bg-cocoa text-white text-xs px-2 py-1 rounded ml-1">Upload</button>
        `;
        status.className = 'bulk-status flex items-center gap-1';
        await new Promise(resolve => {
          status.querySelector('.bulk-go').addEventListener('click', async () => {
            const m = status.querySelector('.bulk-month').value;
            await uploadAllSheets(allParsed, m, status);
            resolve();
          });
        });
      } else {
        await uploadAllSheets(allParsed, month, status);
      }
    } catch (e) {
      console.error(e);
      status.textContent = 'Error: ' + e.message;
      status.className = 'bulk-status text-xs text-bad';
    }
  }
});

async function uploadAllSheets(allParsed, month, status) {
  status.innerHTML = 'Uploading…';
  status.className = 'bulk-status text-xs text-slate-500';
  const summary = [];
  for (const parsed of allParsed) {
    const records = parsed.type === 'sellerboard'
      ? rowsToSellerboardRecords(parsed, month)
      : rowsToPpcRecords(parsed, month);
    if (!records.length) continue;
    const inserted = await commitRecords(parsed.type, records);
    summary.push(`${inserted} ${parsed.type}`);
  }
  if (!summary.length) {
    status.textContent = `⚠️ No rows uploaded · ${month}`;
    status.className = 'bulk-status text-xs text-amber';
  } else {
    status.textContent = `✓ ${summary.join(', ')} · ${month}`;
    status.className = 'bulk-status text-xs text-good';
  }
}

function inferMonth(filename) {
  for (const m of MONTHS) {
    if (filename.toLowerCase().includes(m.toLowerCase())) return m;
    if (filename.toLowerCase().includes(m.slice(0,3).toLowerCase())) return m;
  }
  return null;
}

// Catalog management
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

// Edit Sellerboard
async function loadSellerboardTable() {
  const month = document.getElementById('edit-sb-month').value;
  let q = sb.from('sellerboard_data').select('*').eq('year', CURRENT_YEAR);
  if (month) q = q.eq('month', month);
  const { data, error } = await q.order('month').order('asin');
  if (error) { toast(error.message, 'error'); return; }

  const body = document.getElementById('edit-sb-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2">${row.month}</td>
      <td class="px-3 py-2 font-mono text-xs">${row.asin}</td>
      <td class="px-3 py-2 text-right"><input data-field="sessions" data-id="${row.id}" type="number" value="${row.sessions}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="units" data-id="${row.id}" type="number" value="${row.units}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="gross_sales" data-id="${row.id}" type="number" step="0.01" value="${row.gross_sales}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="refunds" data-id="${row.id}" type="number" step="0.01" value="${row.refunds}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right">
        <button data-action="delete-sb" data-id="${row.id}" class="text-xs text-bad hover:underline">Delete</button>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = +input.dataset.id;
      const field = input.dataset.field;
      const value = parseFloat(input.value) || 0;
      const { error } = await sb.from('sellerboard_data').update({ [field]: value }).eq('id', id);
      if (error) { toast(error.message, 'error'); }
      else { input.classList.add('bg-green-50'); setTimeout(() => input.classList.remove('bg-green-50'), 500); }
    });
  });
  body.querySelectorAll('button[data-action="delete-sb"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this row?')) return;
      const { error } = await sb.from('sellerboard_data').delete().eq('id', +btn.dataset.id);
      if (error) { toast(error.message, 'error'); return; }
      loadSellerboardTable();
    });
  });
}
document.getElementById('edit-sb-month').addEventListener('change', loadSellerboardTable);

// Edit PPC
async function loadPpcTable() {
  const month = document.getElementById('edit-ppc-month').value;
  let q = sb.from('ppc_data').select('*').eq('year', CURRENT_YEAR);
  if (month) q = q.eq('month', month);
  const { data, error } = await q.order('month').order('campaign');
  if (error) { toast(error.message, 'error'); return; }

  const body = document.getElementById('edit-ppc-body');
  body.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.className = i % 2 === 0 ? 'bg-cream' : 'bg-white';
    tr.innerHTML = `
      <td class="px-3 py-2">${row.month}</td>
      <td class="px-3 py-2 text-xs">${row.campaign}</td>
      <td class="px-3 py-2 text-center">${row.ad_type || ''}</td>
      <td class="px-3 py-2 text-right"><input data-field="impressions" data-id="${row.id}" type="number" value="${row.impressions}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="clicks" data-id="${row.id}" type="number" value="${row.clicks}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="spend" data-id="${row.id}" type="number" step="0.01" value="${row.spend}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="sales" data-id="${row.id}" type="number" step="0.01" value="${row.sales}" class="w-24 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right"><input data-field="orders" data-id="${row.id}" type="number" value="${row.orders}" class="w-20 text-right border border-slate-200 rounded px-1 py-0.5" /></td>
      <td class="px-3 py-2 text-right">
        <button data-action="delete-ppc" data-id="${row.id}" class="text-xs text-bad hover:underline">Delete</button>
      </td>
    `;
    body.appendChild(tr);
  });
  body.querySelectorAll('input[data-field]').forEach(input => {
    input.addEventListener('change', async () => {
      const id = +input.dataset.id;
      const field = input.dataset.field;
      const value = parseFloat(input.value) || 0;
      const { error } = await sb.from('ppc_data').update({ [field]: value }).eq('id', id);
      if (error) { toast(error.message, 'error'); }
      else { input.classList.add('bg-green-50'); setTimeout(() => input.classList.remove('bg-green-50'), 500); }
    });
  });
  body.querySelectorAll('button[data-action="delete-ppc"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this row?')) return;
      const { error } = await sb.from('ppc_data').delete().eq('id', +btn.dataset.id);
      if (error) { toast(error.message, 'error'); return; }
      loadPpcTable();
    });
  });
}
document.getElementById('edit-ppc-month').addEventListener('change', loadPpcTable);
