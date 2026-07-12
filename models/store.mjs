// Secretia · Modelos — store del catálogo editable, persistido en disco.
//
// El catálogo dejó de ser estático: ahora vive en un JSON dentro de un volumen
// (MODELS_CATALOG_PATH, por defecto /data/catalog.json). Así el rol "dios" puede
// agregar/editar/quitar cards desde la web SIN redeploy y sobrevive reinicios.
//
// La primera vez (archivo inexistente) se SIEMBRA con el catálogo curado de
// catalog.mjs, para no perder lo que ya venía listo de fábrica.
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { CATALOG as SEED } from "./catalog.mjs";

const PATH = process.env.MODELS_CATALOG_PATH || "/data/catalog.json";
const VALID_TAG = /^[a-zA-Z0-9._:\/-]{1,120}$/;

let MODELS = [];

// Normaliza y valida una entrada venida del front. Tira Error con mensaje claro.
export function normalizeEntry(raw, validCats) {
  const tag = String(raw?.tag || "").trim();
  if (!VALID_TAG.test(tag)) throw new Error("Tag inválido (usá algo como phi4:14b).");
  const nombre = String(raw?.nombre || "").trim().slice(0, 80) || tag;
  const params = String(raw?.params || "").trim().slice(0, 16) || "—";
  const cat = validCats.includes(raw?.cat) ? raw.cat : validCats[0];
  const blurb = String(raw?.blurb || "").trim().slice(0, 240);
  let sizeGB = null;
  if (raw?.sizeGB != null && String(raw.sizeGB).trim() !== "") {
    const n = Number(raw.sizeGB);
    if (Number.isFinite(n) && n >= 0 && n < 10000) sizeGB = Math.round(n * 100) / 100;
  }
  return { tag, nombre, params, sizeGB, cat, blurb };
}

// Escritura atómica: escribe a .tmp y renombra (no deja el JSON a medias).
async function persistList(list) {
  const tmp = PATH + ".tmp";
  await mkdir(dirname(PATH), { recursive: true }).catch(() => {});
  await writeFile(tmp, JSON.stringify({ models: list }, null, 2), "utf8");
  await rename(tmp, PATH);
}

export async function initStore() {
  try {
    const j = JSON.parse(await readFile(PATH, "utf8"));
    MODELS = Array.isArray(j?.models) ? j.models : [];
    console.log(`[modelos] catálogo: ${MODELS.length} modelos desde ${PATH}`);
  } catch {
    // No existe (o está corrupto) → sembrar con lo curado de fábrica.
    MODELS = SEED.map((m) => ({ ...m }));
    try {
      await persistList(MODELS);
      console.log(`[modelos] catálogo inicial sembrado en ${PATH} (${MODELS.length} modelos)`);
    } catch (e) {
      console.warn(`[modelos] OJO: no pude escribir ${PATH} (¿falta montar un volumen en /data?): ${e.message}. El catálogo será EFÍMERO: los cambios se pierden al reiniciar.`);
    }
  }
}

export function listCatalog() { return MODELS; }

// Alta o edición (upsert por tag). Persiste ANTES de commitear en memoria:
// si falla el disco, el estado no cambia y el error sube limpio.
export async function upsertEntry(entry) {
  const next = MODELS.filter((m) => m.tag !== entry.tag);
  next.push(entry);
  await persistList(next);
  MODELS = next;
  return entry;
}

// Quita una card del catálogo. NO borra el modelo de Ollama, solo la tarjeta.
export async function removeEntry(tag) {
  const next = MODELS.filter((m) => m.tag !== tag);
  if (next.length === MODELS.length) return false; // no estaba
  await persistList(next);
  MODELS = next;
  return true;
}
