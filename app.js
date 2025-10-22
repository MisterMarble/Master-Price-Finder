// === CONFIG: paste your published Google Sheet CSV URL here ===
const CONFIG = {
  DATA_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTs821qXqFvNo4U_pss0snnGH7pVD7kutnboUzqqUWnxkAPu4GlLUk8zmtBh1dbgK7JtqgsaoXdDley/pub?output=csv", // <-- replace me
  CACHE_BUST: true
};

const state = { rows: [], byName: new Map() };

function oneDollar(p){
  if (p == null || p === "") return "-";
  // strip any leading $ and spaces, then add one $
  const cleaned = String(p).trim().replace(/^\$+/, "");
  return "$" + cleaned;
}
// Robust CSV fetch + parse (handles commas inside quotes)
async function loadDataCsv(url){
  const finalUrl = CONFIG.CACHE_BUST ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url;
  const res = await fetch(finalUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const text = await res.text();

  // Parse CSV safely
  const rows = [];
  let i = 0, cell = "", inQuotes = false, row = [];
  while (i < text.length){
    const ch = text[i];
    if (ch === '"'){
      if (inQuotes && text[i+1] === '"'){ cell += '"'; i += 2; continue; }
      inQuotes = !inQuotes; i++; continue;
    }
    if (!inQuotes && (ch === ',' || ch === '\n' || ch === '\r')){
      row.push(cell.trim()); cell = "";
      if (ch === ',' ){ i++; continue; }
      // end of line
      if (row.length) rows.push(row);
      row = []; 
      // skip \r\n combos
      if (ch === '\r' && text[i+1] === '\n') i += 2; else i++;
      continue;
    }
    cell += ch; i++;
  }
  if (cell.length || row.length){ row.push(cell.trim()); rows.push(row); }

  // Map headers
  const headers = rows.shift().map(h => h.trim());
  const idx = (h) => headers.indexOf(h);
  const iName = idx("Product Name");
  const i30  = idx("30mm");
  const i20  = idx("20mm");
  const iImg = idx("Image URL");

  state.rows = rows
    .map(r => ({
      name: (r[iName] || "").trim(),
      mm30: (r[i30]  || "").trim(),
      mm20: (r[i20]  || "").trim(),
      imageUrl: (r[iImg] || "").trim()
    }))
    .filter(r => r.name);

  state.byName.clear();
  for (const r of state.rows) state.byName.set(r.name.toLowerCase(), r);
}

function renderCard(row){
  const main = document.getElementById('result');
  const hasImage = !!row.imageUrl;
  main.innerHTML = `
  <div class="card">
    <div class="img-wrap">
      ${hasImage ? `<img src="${row.imageUrl}" alt="${row.name}" onerror="this.replaceWith(document.createElement('div'));this.outerHTML='<div class=&quot;fallback&quot;>Image Not Available</div>';">`
                  : `<div class="fallback">Image Not Available</div>`}
    </div>
    <div class="content">
      <div class="title">${row.name}</div>
      <div class="grid">
        <div class="pricebox">
          <div class="label">30mm</div>
          <div class="value">${row.mm30 || "-"}</div>
        </div>
        <div class="pricebox">
          <div class="label">20mm</div>
          <div class="value">${row.mm20 || "-"}</div>
        </div>
      </div>
    </div>
    <!-- NEW: actions row -->
    <div class="actions">
  <button id="shareBtn" type="button" aria-label="Share this material">Share</button>
  <input id="shareLink" type="text" readonly class="share-link" value="${row.imageUrl || ''}" />
    <span id="shareToast" class="share-toast" role="status" aria-live="polite"></span>
</div> <!-- .actions -->
</div> <!-- .card -->
`;
const linkField = document.getElementById('shareLink');
if (linkField) {
  const img = document.querySelector('.img-wrap img');
  const src = (row && row.imageUrl) || (img && img.src) || '';
  linkField.value = src;
}
wireShareButton(row);
}

function initSearch(){
  const input = document.getElementById('query');
  const suggestions = document.getElementById('suggestions');
  const clearBtn = document.getElementById('clearBtn');

  function show(matches){
    suggestions.innerHTML = "";
    matches.forEach(m => {
      const li = document.createElement('li');
      li.textContent = m.name;
      li.onclick = () => { input.value = m.name; renderCard(m); suggestions.hidden = true; };
      suggestions.appendChild(li);
    });
    suggestions.hidden = matches.length === 0;
  }

  input.addEventListener('input', () => {
    const val = input.value.toLowerCase().trim();
    if (!val){ suggestions.hidden = true; return; }
    const matches = state.rows.filter(r => r.name.toLowerCase().includes(val)).slice(0, 12);
    show(matches);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      const val = input.value.toLowerCase().trim();
      const m = state.rows.find(r => r.name.toLowerCase().includes(val));
      if (m) renderCard(m);
      suggestions.hidden = true;
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    document.getElementById('result').innerHTML = '';
    suggestions.hidden = true;
    input.focus();
  });
}

async function init(){
  try{
    await loadDataCsv(CONFIG.DATA_URL);
    initSearch();
  }catch(err){
    document.getElementById('result').innerHTML = `
      <div class="card"><div class="content">
        <div class="title">Could not load data</div>
        <div>${String(err)}</div>
      </div></div>`;
  }
}
init();

// ===== Share button helpers =====
function buildMaterialLink(row){
  const url = new URL(window.location.href);
  if (row?.name) url.searchParams.set('q', row.name);
  return url.toString();
}

function buildSharePayload(row){
  const link  = buildMaterialLink(row);
  const title = [row?.name, row?.brand].filter(Boolean).join(' — ') || 'Material';
  const bits  = [
    row?.size ? `Size: ${row.size}` : null,
    row?.price ? `Price: ${row.price}` : null,
    row?.stock ? `Stock: ${row.stock}` : null,
  ].filter(Boolean).join(' · ');
  const text = bits ? `${bits}\n${link}` : link;
  return { title, text, url: link };
}

function showToast(el, msg){
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1400);
}

function isWebShareAvailable(){
  try { return typeof navigator.share === 'function'; }
  catch { return false; }
}

function fallbackCopy(text){
  // Try clipboard API, then prompt as last resort
  return navigator.clipboard?.writeText(text).catch(() => {
    window.prompt('Copy this link:', text);
  });
}

function wireShareButton(row){
  const btn   = document.getElementById('shareBtn');
  const toast = document.getElementById('shareToast');
  const linkField = document.getElementById('shareLink');
if (!btn) return;

  const payload = buildSharePayload(row);

// If sharing is not supported (desktop), change button text to "Open Link"
if (!isWebShareAvailable()) {
  btn.textContent = 'Open Link';
}

btn.onclick = async () => {
  if (isWebShareAvailable()) {
    try {
      await navigator.share({
        title: payload.title,
        text: payload.text,
        url:  payload.url
      });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }

  // Desktop or unsupported -> open the image/app link in a new tab
  window.open(payload.url, '_blank');
};
}