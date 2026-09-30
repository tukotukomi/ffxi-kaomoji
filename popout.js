// Shared "always on top" compact panel.
// Used two ways:
//  1) Chrome/Edge: openKaomojiPopout() spawns a real Document Picture-in-Picture
//     window (documentPictureInPicture.requestWindow) and builds this UI into it.
//     That window is drawn by the OS as always-on-top, floating above other apps.
//  2) Any browser (Firefox etc.): falls back to a plain window.open() of
//     popout.html. That's a normal window - pin it on top yourself with an
//     OS tool (Windows: PowerToys' "Always on Top", Win+Ctrl+T by default).
// Both routes call the same buildPopoutUI() so there is one UI to maintain.

const PLACEHOLDER_GLYPHS_POPOUT = new Set(["NBSP","SHY"]);

function gatherPopoutData(){
  return {
    FACES, BLOCKS, FACE_PARTS, FACE_COMBOS, ANSI_DATA, OEM_DATA
  };
}

const POPOUT_CSS = `
  :root{
    --bg:#0A0E2E; --surface:#131A42; --surface-2:#1B234E;
    --ink:#EDEFF7; --ink-muted:#8B97C7;
    --accent:#F2C94C; --accent-ink:#1A1206; --accent-soft:#232A5C;
    --border:#3A5A95; --border-strong:#5B82C2;
  }
  *{box-sizing:border-box;}
  html,body{height:100%;}
  body{
    margin:0;
    background:var(--bg);
    color:var(--ink);
    font-family:'Archivo',system-ui,-apple-system,Segoe UI,sans-serif;
    display:flex;
    flex-direction:column;
  }
  .p-tabs{
    display:flex;
    flex:none;
    border-bottom:1px solid var(--border);
    background:var(--surface);
  }
  .p-tab{
    flex:1;
    font-family:'Archivo',sans-serif;
    font-weight:600;
    font-size:12px;
    color:var(--ink-muted);
    background:transparent;
    border:none;
    border-bottom:2px solid transparent;
    padding:10px 4px;
    cursor:pointer;
  }
  .p-tab.active{color:var(--accent);border-bottom-color:var(--accent);}
  .p-controls{
    flex:none;
    display:flex;
    gap:6px;
    padding:8px;
    border-bottom:1px solid var(--border);
  }
  .p-search{
    flex:1;
    min-width:0;
    background:var(--surface);
    border:1px solid var(--border-strong);
    border-radius:7px;
    color:var(--ink);
    font-family:'Archivo',sans-serif;
    font-size:12px;
    padding:6px 8px;
  }
  .p-search::placeholder{color:var(--ink-muted);}
  .p-subtabs{
    flex:none;
    display:flex;
    gap:4px;
    padding:0 8px 8px;
  }
  .p-subtab{
    font-family:'Archivo',sans-serif;
    font-weight:600;
    font-size:11px;
    color:var(--ink-muted);
    background:var(--surface);
    border:1px solid var(--border);
    border-radius:999px;
    padding:4px 10px;
    cursor:pointer;
  }
  .p-subtab.active{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);}
  .p-grid{
    flex:1;
    overflow-y:auto;
    display:grid;
    grid-template-columns:repeat(auto-fill,minmax(74px,1fr));
    gap:6px;
    padding:8px;
    align-content:start;
  }
  .p-tile{
    background:var(--surface);
    border:1px solid var(--border);
    border-radius:8px;
    padding:8px 4px 6px;
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:3px;
    cursor:pointer;
    text-align:center;
    min-width:0;
  }
  .p-tile:hover{border-color:var(--accent);}
  .p-tile:active{background:var(--accent-soft);}
  .p-tile .p-glyph{
    font-family:'IBM Plex Mono',monospace;
    font-size:15px;
    line-height:1.2;
    color:var(--ink);
    max-width:100%;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .p-tile .p-glyph.p-ph{
    font-size:8px;
    font-weight:700;
    color:var(--ink-muted);
    border:1px dashed var(--border-strong);
    border-radius:4px;
    padding:2px 4px;
  }
  .p-tile .p-cap{
    font-size:8.5px;
    color:var(--ink-muted);
    line-height:1.15;
    max-width:100%;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .p-empty{
    grid-column:1/-1;
    color:var(--ink-muted);
    font-size:12px;
    text-align:center;
    padding:20px 8px;
  }
  .p-toast{
    position:fixed;
    left:50%;
    bottom:10px;
    transform:translate(-50%,8px);
    background:var(--ink);
    color:var(--bg);
    font-family:'IBM Plex Mono',monospace;
    font-size:11px;
    padding:6px 12px;
    border-radius:7px;
    max-width:88%;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    opacity:0;
    pointer-events:none;
    transition:opacity .15s ease, transform .15s ease;
  }
  .p-toast.show{opacity:1;transform:translate(-50%,0);}
`;

function popoutAnsiCode(code){ return "Alt+0" + String(code).padStart(3, "0"); }
function popoutOemCode(code){ return "Alt+" + code; }

function popoutRows(mainTab, subTab, data){
  if (mainTab === "kaomoji" && subTab === "faces") {
    return data.FACES.map(([content, cat]) => ({ glyph: content, cap: cat, value: content }));
  }
  if (mainTab === "kaomoji" && subTab === "parts") {
    return data.BLOCKS.map(([glyph, name]) => ({ glyph, cap: name, value: glyph }));
  }
  if (mainTab === "face" && subTab === "combos") {
    return data.FACE_COMBOS.map(([content, cat]) => ({ glyph: content, cap: cat, value: content }));
  }
  if (mainTab === "face" && subTab === "parts") {
    return data.FACE_PARTS.map(([glyph, code, name, cat]) => ({ glyph, cap: code, value: glyph }));
  }
  if (mainTab === "alt" && subTab === "ansi") {
    return data.ANSI_DATA.map(([code, glyph, name, cat]) => ({ glyph, cap: popoutAnsiCode(code), value: glyph, ph: PLACEHOLDER_GLYPHS_POPOUT.has(glyph) }));
  }
  if (mainTab === "alt" && subTab === "legacy") {
    return data.OEM_DATA.map(([code, glyph, name, cat]) => ({ glyph, cap: popoutOemCode(code), value: glyph, ph: PLACEHOLDER_GLYPHS_POPOUT.has(glyph) }));
  }
  return [];
}

const POPOUT_SUBTABS = {
  kaomoji: [["faces","Faces"], ["parts","Parts"]],
  face:    [["combos","Combos"], ["parts","Parts"]],
  alt:     [["ansi","ANSI"], ["legacy","Legacy"]]
};
const POPOUT_DEFAULT_SUB = { kaomoji:"faces", face:"combos", alt:"ansi" };

function popoutFallbackCopy(win, text){
  try {
    const doc = win.document;
    const ta = doc.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.setAttribute("readonly", "");
    doc.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = doc.execCommand("copy");
    doc.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

function buildPopoutUI(doc, data){
  const win = doc.defaultView;
  doc.body.innerHTML = "";

  const tabsEl = doc.createElement("div");
  tabsEl.className = "p-tabs";
  const controlsEl = doc.createElement("div");
  controlsEl.className = "p-controls";
  const searchEl = doc.createElement("input");
  searchEl.className = "p-search";
  searchEl.type = "text";
  searchEl.placeholder = "Search…";
  controlsEl.appendChild(searchEl);
  const subtabsEl = doc.createElement("div");
  subtabsEl.className = "p-subtabs";
  const gridEl = doc.createElement("div");
  gridEl.className = "p-grid";
  const toastEl = doc.createElement("div");
  toastEl.className = "p-toast";

  doc.body.appendChild(tabsEl);
  doc.body.appendChild(controlsEl);
  doc.body.appendChild(subtabsEl);
  doc.body.appendChild(gridEl);
  doc.body.appendChild(toastEl);

  const state = { main: "kaomoji", sub: "faces", query: "" };
  let toastTimer = null;

  function showToast(text){
    toastEl.textContent = text;
    toastEl.classList.add("show");
    win.clearTimeout(toastTimer);
    toastTimer = win.setTimeout(() => toastEl.classList.remove("show"), 1400);
  }

  function copyValue(row){
    let value = row.value;
    if (row.ph) value = (row.glyph === "NBSP") ? " " : "­";
    const label = row.ph ? row.glyph : (row.value.length > 14 ? row.value.slice(0,14) + "…" : row.value);
    if (win.isSecureContext && win.navigator.clipboard && win.navigator.clipboard.writeText) {
      win.navigator.clipboard.writeText(value).then(() => {
        showToast("Copied " + label);
      }).catch(() => {
        showToast(popoutFallbackCopy(win, value) ? "Copied " + label : "Copy failed");
      });
    } else {
      showToast(popoutFallbackCopy(win, value) ? "Copied " + label : "Copy failed");
    }
  }

  function renderSubtabs(){
    subtabsEl.innerHTML = "";
    POPOUT_SUBTABS[state.main].forEach(([key, label]) => {
      const b = doc.createElement("button");
      b.className = "p-subtab" + (key === state.sub ? " active" : "");
      b.textContent = label;
      b.addEventListener("click", () => {
        state.sub = key;
        renderSubtabs();
        renderGrid();
      });
      subtabsEl.appendChild(b);
    });
  }

  function renderGrid(){
    const q = state.query.trim().toLowerCase();
    const rows = popoutRows(state.main, state.sub, data).filter(r => {
      if (!q) return true;
      return r.glyph.toLowerCase().includes(q) || (r.cap || "").toLowerCase().includes(q);
    });
    gridEl.innerHTML = "";
    if (rows.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "p-empty";
      empty.textContent = "No matches.";
      gridEl.appendChild(empty);
      return;
    }
    const frag = doc.createDocumentFragment();
    rows.forEach(row => {
      const tile = doc.createElement("div");
      tile.className = "p-tile";
      tile.title = "Click to copy";

      const g = doc.createElement("div");
      g.className = "p-glyph" + (row.ph ? " p-ph" : "");
      g.textContent = row.glyph;

      const cap = doc.createElement("div");
      cap.className = "p-cap";
      cap.textContent = row.cap || "";

      tile.appendChild(g);
      tile.appendChild(cap);
      tile.addEventListener("click", () => copyValue(row));
      frag.appendChild(tile);
    });
    gridEl.appendChild(frag);
  }

  tabsEl.innerHTML = "";
  [["kaomoji","Kaomoji"], ["face","Face Builder"], ["alt","Alt Codes"]].forEach(([key, label]) => {
    const b = doc.createElement("button");
    b.className = "p-tab" + (key === state.main ? " active" : "");
    b.textContent = label;
    b.addEventListener("click", () => {
      state.main = key;
      state.sub = POPOUT_DEFAULT_SUB[key];
      [...tabsEl.children].forEach(el => el.classList.remove("active"));
      b.classList.add("active");
      renderSubtabs();
      renderGrid();
    });
    tabsEl.appendChild(b);
  });

  searchEl.addEventListener("input", (e) => {
    state.query = e.target.value;
    renderGrid();
  });

  renderSubtabs();
  renderGrid();
}

async function openKaomojiPopout(){
  const data = gatherPopoutData();
  if ("documentPictureInPicture" in window) {
    try {
      const pipWin = await documentPictureInPicture.requestWindow({ width: 340, height: 560 });
      pipWin.document.title = "Kaomoji Alt Emporium";
      const link = pipWin.document.createElement("link");
      link.rel = "preconnect";
      link.href = "https://fonts.googleapis.com";
      pipWin.document.head.appendChild(link);
      const fonts = pipWin.document.createElement("link");
      fonts.rel = "stylesheet";
      fonts.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap";
      pipWin.document.head.appendChild(fonts);
      const style = pipWin.document.createElement("style");
      style.textContent = POPOUT_CSS;
      pipWin.document.head.appendChild(style);
      buildPopoutUI(pipWin.document, data);
      return;
    } catch (e) {
      // fall through to plain window
    }
  }
  window.open("popout.html", "kaomojiPopout", "width=360,height=600,resizable=yes");
}
