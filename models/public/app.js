// Secretia · Modelos — front. Todo por fetch relativo (anda bajo /modelos).
const $ = (s, r = document) => r.querySelector(s);
const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtSize = (gb) => gb == null ? "" : gb < 1 ? Math.round(gb * 1000) + " MB" : (gb.toFixed(1).replace(/\.0$/, "")) + " GB";
const fmtBytes = (b) => !b ? "0" : b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : (b / 1e6).toFixed(0) + " MB";

let ME = null, DATA = null, FILTER = "all";

const PENCIL = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;

// ---------- arranque ----------
async function boot() {
  ME = await (await fetch("api/me")).json().catch(() => null);
  el("about-ver").textContent = ME?.version ? "v" + ME.version : "—";
  el("about-auth").textContent = ME?.federated ? "Federado con Lockatus" : "Login local (dios/humano)";

  if (!ME || !ME.user) return showLogin();
  // sesión OK
  el("login").classList.add("hidden");
  el("app").classList.remove("hidden");
  el("menu-user").textContent = `${ME.user.name} · rol ${ME.user.role}`;
  el("ollama-down").classList.toggle("hidden", ME.ollamaOk !== false);
  if (ME.user.role === "dios") { el("pull-any").classList.remove("hidden"); el("add-model").classList.remove("hidden"); }
  await loadModels();
}

function showLogin() {
  el("app").classList.add("hidden");
  el("login").classList.remove("hidden");
  const fed = ME?.federated && !ME?.allowLocal;
  el("login-local").classList.toggle("hidden", fed);
  el("login-sso").classList.toggle("hidden", !ME?.federated);
}

// ---------- login local ----------
el("login-card").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("login-err").textContent = "";
  const r = await fetch("api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: el("pass").value }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { el("login-err").textContent = j.error || "No se pudo entrar."; return; }
  el("pass").value = "";
  boot();
});
el("pass-toggle").addEventListener("click", () => {
  const i = el("pass"); i.type = i.type === "password" ? "text" : "password"; i.focus();
});

// ---------- modelos ----------
async function loadModels() {
  const r = await fetch("api/models");
  if (!r.ok) { const e = await r.json().catch(() => ({})); el("ollama-down").textContent = e.error || "No se pudieron cargar los modelos."; el("ollama-down").classList.remove("hidden"); return; }
  DATA = await r.json();
  renderFilters();
  renderGrid();
}

function renderFilters() {
  const all = [{ id: "all", label: "Todos" }, ...DATA.cats];
  if (DATA.extra?.length) all.push({ id: "otros", label: "Otros instalados" });
  el("filters").innerHTML = all.map((c) => `<button class="chip${FILTER === c.id ? " on" : ""}" data-f="${c.id}">${esc(c.label)}</button>`).join("");
  el("filters").querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => { FILTER = b.dataset.f; renderFilters(); renderGrid(); }));
}

function renderGrid() {
  const models = DATA.models.map((m) => ({ ...m, _incat: true }));
  const extra = (DATA.extra || []).map((m) => ({ ...m, _incat: false }));
  const list = [...models, ...extra].filter((m) => FILTER === "all" ? true : m.cat === FILTER);
  const dios = DATA.role === "dios";
  el("grid").innerHTML = list.map((m) => card(m, dios)).join("");
  // cablear botones
  el("grid").querySelectorAll("[data-pull]").forEach((b) => b.addEventListener("click", () => pull(b.dataset.pull, b.closest(".model-card"))));
  el("grid").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => del(b.dataset.del)));
  el("grid").querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openEditor(findModel(b.dataset.edit))));
  el("grid").querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => openEditor(findModel(b.dataset.add))));
}

function findModel(tag) {
  const inCat = DATA.models.find((m) => m.tag === tag);
  if (inCat) return { ...inCat, __inCatalog: true };
  const ex = (DATA.extra || []).find((m) => m.tag === tag);
  if (ex) return { ...ex, __inCatalog: false };
  return null;
}

function card(m, dios) {
  const meta = [m.params && m.params !== "—" ? m.params : null, m.installedSize ? fmtBytes(m.installedSize) : (m.sizeGB != null ? "~" + fmtSize(m.sizeGB) : null)].filter(Boolean).join(" · ");
  const status = m.installed
    ? `<span class="st ok"><span class="dot"></span>Instalado</span>`
    : `<span class="st no"><span class="dot"></span>No instalado</span>`;
  let actions = "";
  if (dios) {
    const cat = m._incat
      ? `<button class="ghost mini mc-edit" data-edit="${esc(m.tag)}" title="Editar card" aria-label="Editar">${PENCIL}</button>`
      : `<button class="ghost mini" data-add="${esc(m.tag)}" title="Agregar al catálogo">+ Catálogo</button>`;
    const op = m.installed
      ? `<button class="ghost mini" data-del="${esc(m.tag)}">Borrar</button>`
      : `<button class="mini" data-pull="${esc(m.tag)}">Descargar</button>`;
    actions = cat + op;
  }
  return `<div class="model-card" data-tag="${esc(m.tag)}">
    <div class="mc-top">
      <div><div class="mc-name">${esc(m.nombre)}</div><div class="mc-tag">${esc(m.tag)}</div></div>
      <div class="mc-meta">${esc(meta)}</div>
    </div>
    <div class="mc-blurb">${esc(m.blurb || "")}</div>
    <div class="mc-prog hidden"><div class="lbl"><span class="ps">Preparando…</span><span class="pp"></span></div><div class="progress"><i></i></div></div>
    <div class="mc-foot">${status}<div class="mc-actions">${actions}</div></div>
  </div>`;
}

// ---------- descargar (stream de progreso) ----------
async function pull(tag, cardEl) {
  const prog = cardEl ? $(".mc-prog", cardEl) : null;
  const bar = prog ? $(".progress > i", prog) : null;
  const ps = prog ? $(".ps", prog) : null, pp = prog ? $(".pp", prog) : null;
  const acts = cardEl ? $(".mc-actions", cardEl) : null;
  if (acts) acts.innerHTML = "";
  if (prog) prog.classList.remove("hidden");

  try {
    const res = await fetch("api/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tag }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "error " + res.status); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue; let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.error) throw new Error(o.error);
        if (ps) ps.textContent = o.status || "…";
        if (o.total && o.completed != null && bar) {
          const pct = Math.min(100, Math.round((o.completed / o.total) * 100));
          bar.style.width = pct + "%"; if (pp) pp.textContent = pct + "%";
        }
        if (o.status === "success") { bar && (bar.style.width = "100%"); pp && (pp.textContent = "100%"); }
      }
    }
    if (ps) ps.textContent = "Listo";
    setTimeout(loadModels, 600);
  } catch (e) {
    if (ps) { ps.textContent = "Error: " + e.message; }
    if (bar) bar.style.background = "var(--err)";
    if (acts) acts.innerHTML = `<button class="mini" data-pull="${esc(tag)}">Reintentar</button>`;
    el("grid").querySelectorAll("[data-pull]").forEach((b) => b.addEventListener("click", () => pull(b.dataset.pull, b.closest(".model-card"))));
  }
}

async function del(tag) {
  if (!confirm(`¿Borrar el modelo ${tag}? Libera espacio en disco.`)) return;
  const r = await fetch("api/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tag }) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "No se pudo borrar."); return; }
  loadModels();
}

// pull por tag arbitrario (dios)
el("pa-btn").addEventListener("click", async () => {
  const tag = el("pa-input").value.trim(); if (!tag) return;
  // creamos una tarjeta temporal mínima reusando el flujo: descargamos y refrescamos
  el("pa-btn").disabled = true;
  try {
    const res = await fetch("api/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: tag }) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "error " + res.status); }
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
    el("pa-input").value = "Descargando " + tag + "…";
    for (;;) { const { done } = await reader.read(); if (done) break; }
    el("pa-input").value = "";
    loadModels();
  } catch (e) { alert("No se pudo: " + e.message); }
  finally { el("pa-btn").disabled = false; }
});

// ---------- editor de catálogo (solo dios) ----------
// model === null → alta en blanco. model con __inCatalog=true → edición.
// model con __inCatalog=false → promover un instalado (tag fijo, sin borrar).
function openEditor(model) {
  const cats = DATA?.cats || [];
  const editing = !!(model && model.__inCatalog);
  const fromExisting = !!model;
  el("ed-cat").innerHTML = cats.map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join("");
  el("ed-tit").textContent = editing ? "Editar modelo" : (fromExisting ? "Agregar al catálogo" : "Agregar modelo");
  el("ed-tag").value = model?.tag || "";
  el("ed-tag").readOnly = fromExisting;   // el tag es la clave: fijo si viene de algo existente
  el("ed-nombre").value = (model?.nombre && model.nombre !== model?.tag) ? model.nombre : "";
  el("ed-params").value = (model?.params && model.params !== "—") ? model.params : "";
  el("ed-size").value = model?.sizeGB != null ? model.sizeGB : "";
  el("ed-cat").value = (model?.cat && model.cat !== "otros") ? model.cat : (cats[0]?.id || "");
  el("ed-blurb").value = (model?.blurb && model.blurb !== "Instalado en tu Ollama.") ? model.blurb : "";
  el("ed-err").textContent = "";
  el("ed-del").classList.toggle("hidden", !editing);
  el("editor").classList.remove("hidden");
  (fromExisting ? el("ed-nombre") : el("ed-tag")).focus();
}
const closeEditor = () => el("editor").classList.add("hidden");

el("add-model").addEventListener("click", () => openEditor(null));
el("ed-x").addEventListener("click", closeEditor);
el("ed-cancel").addEventListener("click", closeEditor);
el("editor").addEventListener("click", (e) => { if (e.target === el("editor")) closeEditor(); });

el("ed-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("ed-err").textContent = "";
  const payload = {
    tag: el("ed-tag").value.trim(),
    nombre: el("ed-nombre").value.trim(),
    params: el("ed-params").value.trim(),
    sizeGB: el("ed-size").value.trim(),
    cat: el("ed-cat").value,
    blurb: el("ed-blurb").value.trim(),
  };
  if (!payload.tag) { el("ed-err").textContent = "Falta el tag."; return; }
  el("ed-save").disabled = true;
  try {
    const r = await fetch("api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { el("ed-err").textContent = j.error || "No se pudo guardar."; return; }
    closeEditor(); loadModels();
  } catch { el("ed-err").textContent = "Fallo de red."; }
  finally { el("ed-save").disabled = false; }
});

el("ed-del").addEventListener("click", async () => {
  const tag = el("ed-tag").value.trim();
  if (!confirm(`¿Quitar "${tag}" del catálogo?\nNo borra el modelo de Ollama, solo la card.`)) return;
  el("ed-err").textContent = "";
  try {
    const r = await fetch("api/catalog/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { el("ed-err").textContent = j.error || "No se pudo quitar."; return; }
    closeEditor(); loadModels();
  } catch { el("ed-err").textContent = "Fallo de red."; }
});

// ---------- chrome: menú, tema, modal, logout ----------
el("kebab").addEventListener("click", (e) => { e.stopPropagation(); const m = el("menu"); const open = m.classList.toggle("hidden"); el("kebab").setAttribute("aria-expanded", String(!open)); });
document.addEventListener("click", (e) => { if (!el("menu").classList.contains("hidden") && !e.target.closest(".menu-wrap")) el("menu").classList.add("hidden"); });

const themeSw = el("theme-switch");
themeSw.checked = document.documentElement.dataset.theme === "dark";
themeSw.addEventListener("change", () => {
  const dark = themeSw.checked;
  document.documentElement.dataset.theme = dark ? "dark" : "";
  try { localStorage.setItem("secretia-modelos.theme", dark ? "dark" : "light"); } catch {}
});

el("about-open").addEventListener("click", () => { el("about").classList.remove("hidden"); el("menu").classList.add("hidden"); });
el("about-x").addEventListener("click", () => el("about").classList.add("hidden"));
el("about").addEventListener("click", (e) => { if (e.target === el("about")) el("about").classList.add("hidden"); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { el("about").classList.add("hidden"); el("editor").classList.add("hidden"); } });

el("logout").addEventListener("click", async () => {
  await fetch("api/logout", { method: "POST", headers: { "Content-Type": "application/json" } });
  // En federado NO rebotamos al SSO (Lockatus sigue con sesión y reentraría solo):
  // boot() muestra la pantalla de login con el botón "Entrar con Lockatus".
  boot();
});

boot();
