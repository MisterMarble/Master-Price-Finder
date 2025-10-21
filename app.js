// === CONFIG: paste your published Google Sheet CSV URL here ===
const CONFIG = {
  DATA_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTs821qXqFvNo4U_pss0snnGH7pVD7kutnboUzqqUWnxkAPu4GlLUk8zmtBh1dbgK7JtqgsaoXdDley/pub?output=csv", // <-- replace me
  CACHE_BUST: true
};

const state = { rows: [], byName: new Map() };

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
    </div>
  `;
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