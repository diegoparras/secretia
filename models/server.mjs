// Secretia · Modelos — servicio para descargar/gestionar modelos de Ollama desde
// una interfaz web de la familia Escriba, con roles dios/humano y federación
// opcional con Lockatus (OIDC). Habla con Ollama por su API interna.
//
// Seguridad: el endpoint de Ollama NO se expone; este servicio es el único que
// le pega, y solo el rol "dios" puede descargar/borrar. Sesión por cookie firmada.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize } from "node:path";
import { createLockatusClient } from "./lockatus-client.mjs";
import { CATS } from "./catalog.mjs";
import { initStore, listCatalog, upsertEntry, removeEntry, normalizeEntry } from "./store.mjs";

const CAT_IDS = CATS.map((c) => c.id);

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, "public");
const pkg = JSON.parse(await readFile(join(__dir, "package.json"), "utf8"));

// ---- Config -----------------------------------------------------------------
const PORT = Number(process.env.PORT || 8090);
const OLLAMA = (process.env.OLLAMA_BASE_URL || "http://ollama:11434").replace(/\/$/, "");
const DIOS = process.env.DIOS_PASSWORD || "";
const HUMANO = process.env.HUMANO_PASSWORD || "";
const SECURE = String(process.env.COOKIE_SECURE ?? "true") !== "false";

// Federación Lockatus (opcional)
const ISSUER = (process.env.LOCKATUS_ISSUER || "").replace(/\/$/, "");
const FEDERATED = !!ISSUER;
const CLIENT_ID = process.env.LOCKATUS_CLIENT_ID || "secretia-modelos";
const PUBLIC_URL = (process.env.MODELS_PUBLIC_URL || "").replace(/\/$/, ""); // p.ej. https://dominio/modelos
const ALLOW_LOCAL = String(process.env.MODELS_ALLOW_LOCAL_LOGIN ?? "false") === "true";

// Secreto de sesión: requerido. Si falta, generamos uno efímero (sesiones no
// sobreviven a un reinicio) y avisamos.
let SECRET = process.env.MODELS_SESSION_SECRET || "";
if (!SECRET) { SECRET = randomBytes(32).toString("hex"); console.warn("[modelos] MODELS_SESSION_SECRET sin definir: uso uno efímero (las sesiones se pierden al reiniciar)."); }

const lk = FEDERATED
  ? createLockatusClient({ issuer: ISSUER, clientId: CLIENT_ID, redirectUri: (PUBLIC_URL || "") + "/auth/callback", secret: SECRET, sessionCookie: "sm_session", secure: SECURE, postLogin: (PUBLIC_URL ? new URL(PUBLIC_URL).pathname : "") + "/" })
  : null;

// ---- Sesión local (mismo formato/HMAC que el cliente OIDC, misma cookie) -----
const signSession = (obj) => {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return body + "." + createHmac("sha256", SECRET).update(body).digest("base64url");
};
const unsign = (token) => {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const exp = createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac), e = Buffer.from(exp);
  if (a.length !== e.length || !timingSafeEqual(a, e)) return null;
  try { const o = JSON.parse(Buffer.from(body, "base64url").toString()); if (o.exp && o.exp < Date.now()) return null; return o; } catch { return null; }
};
const parseCookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => {
  const i = c.indexOf("="); return i < 0 ? [c.trim(), ""] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1).trim())];
}).filter((x) => x[0]));
const setCookie = (name, val, { maxAge = 12 * 3600, clear = false } = {}) =>
  `${name}=${clear ? "" : val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : maxAge}${SECURE ? "; Secure" : ""}`;

// "dios" = puede descargar/borrar; cualquier otro rol logueado = "humano" (solo ve).
const DIOS_ROLES = new Set(["dios", "god", "admin", "superadmin", "owner"]);
const normRole = (r) => (DIOS_ROLES.has(String(r || "").toLowerCase()) ? "dios" : "humano");

function getUser(req) {
  const s = unsign(parseCookies(req).sm_session);
  if (!s) return null;
  return { name: s.name || s.email || "usuario", email: s.email || null, role: normRole(s.role), via: s.via || (FEDERATED ? "lockatus" : "local") };
}

// ---- Anti-fuerza-bruta del login local --------------------------------------
const tries = new Map(); // ip -> {n, until}
function rateOk(ip) {
  const t = tries.get(ip);
  if (t && t.until > Date.now()) return false;
  return true;
}
function rateBump(ip, ok) {
  if (ok) { tries.delete(ip); return; }
  const t = tries.get(ip) || { n: 0, until: 0 };
  t.n++; if (t.n >= 5) { t.until = Date.now() + 60_000; t.n = 0; }
  tries.set(ip, t);
}
const ctEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// ---- Helpers HTTP -----------------------------------------------------------
const sendJSON = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok) => { let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e6) req.destroy(); }); req.on("end", () => ok(d)); });
// CSRF: las mutaciones exigen Origin del mismo host (un form cross-site no lo puede falsear).
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true; // fetch same-origin a veces no manda Origin en GET; en POST sí
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon" };
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
async function serveStatic(req, res, urlPath) {
  let rel = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  if (rel === "/" || rel === "\\" || rel === "") rel = "/index.html";
  const file = join(PUB, rel);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end("forbidden"); }
  try {
    const buf = await readFile(file);
    const ext = file.slice(file.lastIndexOf("."));
    const h = { "Content-Type": TYPES[ext] || "application/octet-stream" };
    if (ext === ".html") { h["Content-Security-Policy"] = CSP; h["X-Content-Type-Options"] = "nosniff"; h["Referrer-Policy"] = "no-referrer"; h["Cache-Control"] = "no-store"; }
    else if (ext === ".woff2") h["Cache-Control"] = "public, max-age=604800, immutable";
    res.writeHead(200, h); res.end(buf);
  } catch { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); }
}

// ---- Ollama -----------------------------------------------------------------
async function ollamaTags() {
  try { const r = await fetch(OLLAMA + "/api/tags"); if (!r.ok) return null; const j = await r.json(); return j.models || []; }
  catch { return null; }
}

// ---- Rutas ------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://local");
  const path = u.pathname;
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

  // ----- OIDC (solo en federado) -----
  if (FEDERATED && path === "/login/lockatus" && req.method === "GET") return lk.beginLogin(req, res);
  if (FEDERATED && path === "/auth/callback" && req.method === "GET") { await lk.handleCallback(req, res); return; }

  // ----- Logout -----
  if (path === "/logout" || path === "/api/logout") {
    res.writeHead(req.method === "GET" ? 302 : 200, { "Set-Cookie": setCookie("sm_session", "", { clear: true }), ...(req.method === "GET" ? { Location: "./" } : { "Content-Type": "application/json" }) });
    return res.end(req.method === "GET" ? "" : JSON.stringify({ ok: true }));
  }

  // ----- Login local (AJAX) -----
  if (path === "/api/login" && req.method === "POST") {
    if (FEDERATED && !ALLOW_LOCAL) return sendJSON(res, 403, { error: "Esta instancia usa Lockatus. Entrá por Lockatus." });
    if (!sameOrigin(req)) return sendJSON(res, 403, { error: "origen inválido" });
    if (!rateOk(ip)) return sendJSON(res, 429, { error: "Demasiados intentos. Esperá un minuto." });
    const body = JSON.parse((await readBody(req)) || "{}");
    const pass = String(body.password || "");
    let role = null;
    if (DIOS && ctEq(pass, DIOS)) role = "dios";
    else if (HUMANO && ctEq(pass, HUMANO)) role = "humano";
    rateBump(ip, !!role);
    if (!role) return sendJSON(res, 401, { error: "Contraseña incorrecta." });
    const sess = signSession({ name: role === "dios" ? "Dios (local)" : "Humano (local)", role, via: "local", exp: Date.now() + 12 * 3600e3 });
    res.writeHead(200, { "Set-Cookie": setCookie("sm_session", sess), "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, role }));
  }

  // ----- /api/me (estado de sesión + config del front) -----
  if (path === "/api/me") {
    const user = getUser(req);
    const tags = user ? await ollamaTags() : null;
    return sendJSON(res, 200, {
      version: pkg.version, federated: FEDERATED, allowLocal: ALLOW_LOCAL,
      hasLocal: !!(DIOS || HUMANO), ollamaOk: tags !== null,
      user: user ? { name: user.name, role: user.role, via: user.via } : null,
    });
  }

  // A partir de acá: requiere sesión.
  const user = getUser(req);

  // ----- Catálogo (cualquier usuario logueado) -----
  if (path === "/api/models" && req.method === "GET") {
    if (!user) return sendJSON(res, 401, { error: "no autenticado" });
    const tags = await ollamaTags();
    if (tags === null) return sendJSON(res, 502, { error: "No se puede contactar a Ollama." });
    const byName = new Map(tags.map((m) => [m.name, m]));
    const inCatalog = new Set();
    const models = listCatalog().map((m) => {
      const hit = byName.get(m.tag) || byName.get(m.tag + ":latest");
      if (hit) inCatalog.add(hit.name);
      return { ...m, installed: !!hit, installedSize: hit ? hit.size : null };
    });
    const extra = tags.filter((m) => !inCatalog.has(m.name)).map((m) => ({ tag: m.name, nombre: m.name, params: "—", sizeGB: m.size ? m.size / 1e9 : null, cat: "otros", blurb: "Instalado en tu Ollama.", installed: true, installedSize: m.size }));
    return sendJSON(res, 200, { cats: CATS, models, extra, role: user.role });
  }

  // ----- Descargar un modelo (SOLO dios) — stream de progreso -----
  if (path === "/api/pull" && req.method === "POST") {
    if (!user) return sendJSON(res, 401, { error: "no autenticado" });
    if (user.role !== "dios") return sendJSON(res, 403, { error: "Solo el rol dios puede descargar modelos." });
    if (!sameOrigin(req)) return sendJSON(res, 403, { error: "origen inválido" });
    const body = JSON.parse((await readBody(req)) || "{}");
    const name = String(body.name || "").trim();
    if (!/^[a-zA-Z0-9._:\/-]{1,120}$/.test(name)) return sendJSON(res, 400, { error: "nombre de modelo inválido" });
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    try {
      const orr = await fetch(OLLAMA + "/api/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, stream: true }) });
      if (!orr.ok || !orr.body) { res.end(JSON.stringify({ error: "Ollama rechazó la descarga (" + orr.status + ")" }) + "\n"); return; }
      for await (const chunk of orr.body) res.write(chunk); // ndjson de Ollama, tal cual
    } catch (e) { try { res.write(JSON.stringify({ error: "Fallo de red con Ollama" }) + "\n"); } catch {} }
    return res.end();
  }

  // ----- Borrar un modelo (SOLO dios) -----
  if (path === "/api/delete" && req.method === "POST") {
    if (!user) return sendJSON(res, 401, { error: "no autenticado" });
    if (user.role !== "dios") return sendJSON(res, 403, { error: "Solo el rol dios puede borrar modelos." });
    if (!sameOrigin(req)) return sendJSON(res, 403, { error: "origen inválido" });
    const body = JSON.parse((await readBody(req)) || "{}");
    const name = String(body.name || "").trim();
    if (!name) return sendJSON(res, 400, { error: "falta el modelo" });
    try {
      const dr = await fetch(OLLAMA + "/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      return sendJSON(res, dr.ok ? 200 : 502, dr.ok ? { ok: true } : { error: "Ollama no pudo borrarlo (" + dr.status + ")" });
    } catch { return sendJSON(res, 502, { error: "Fallo de red con Ollama" }); }
  }

  // ----- Catálogo: alta/edición de una card (SOLO dios) -----
  if (path === "/api/catalog" && req.method === "POST") {
    if (!user) return sendJSON(res, 401, { error: "no autenticado" });
    if (user.role !== "dios") return sendJSON(res, 403, { error: "Solo el rol dios puede editar el catálogo." });
    if (!sameOrigin(req)) return sendJSON(res, 403, { error: "origen inválido" });
    let entry;
    try { entry = normalizeEntry(JSON.parse((await readBody(req)) || "{}"), CAT_IDS); }
    catch (e) { return sendJSON(res, 400, { error: e.message || "datos inválidos" }); }
    try { await upsertEntry(entry); return sendJSON(res, 200, { ok: true, entry }); }
    catch (e) { return sendJSON(res, 500, { error: "No se pudo guardar el catálogo (¿volumen en /data?): " + e.message }); }
  }

  // ----- Catálogo: quitar una card (SOLO dios) — NO borra el modelo de Ollama -----
  if (path === "/api/catalog/delete" && req.method === "POST") {
    if (!user) return sendJSON(res, 401, { error: "no autenticado" });
    if (user.role !== "dios") return sendJSON(res, 403, { error: "Solo el rol dios puede editar el catálogo." });
    if (!sameOrigin(req)) return sendJSON(res, 403, { error: "origen inválido" });
    const body = JSON.parse((await readBody(req)) || "{}");
    const tag = String(body.tag || "").trim();
    if (!tag) return sendJSON(res, 400, { error: "falta el tag" });
    try { const ok = await removeEntry(tag); return sendJSON(res, 200, { ok }); }
    catch (e) { return sendJSON(res, 500, { error: "No se pudo actualizar el catálogo: " + e.message }); }
  }

  // ----- Estáticos / SPA -----
  if (req.method === "GET") return serveStatic(req, res, path);
  res.writeHead(405, { "Content-Type": "text/plain" }); res.end("method not allowed");
});

await initStore();

server.listen(PORT, () => {
  console.log(`[modelos] Secretia · Modelos en :${PORT} — Ollama=${OLLAMA} — ${FEDERATED ? "federado con Lockatus" : "login local"}${(!FEDERATED && !DIOS && !HUMANO) ? " (OJO: sin DIOS_PASSWORD/HUMANO_PASSWORD, nadie puede entrar)" : ""}`);
});
