# Desplegar Secretia en EasyPanel (sin Compose)

Guía operativa con checklist. EasyPanel se lleva mejor con **servicios sueltos**
que con un Compose, así que Secretia se arma con **3 servicios** dentro de un
mismo **proyecto**.

```
                          ┌──────────────────────────────┐
   Internet  ───────────► │  secretia   (nginx, PÚBLICO)  │   :8080  ← tu dominio
   (login Lockatus)       │  branding + CSS de acento     │
                          └───────────────┬──────────────┘
                                          │ proxy interno
                          ┌───────────────▼──────────────┐
                          │  open-webui  (interno)        │   :8080
                          │  chat, usuarios, OIDC         │
                          └───────────────┬──────────────┘
                                          │ http://ollama:11434
                          ┌───────────────▼──────────────┐
                          │  ollama      (interno)        │   :11434
                          │  modelos locales              │
                          └───────────────────────────────┘
```

> **Regla de oro de EasyPanel:** dentro de un mismo proyecto, un servicio llega a
> otro usando **el nombre del servicio como hostname**. Por eso conviene
> nombrarlos exactamente `ollama`, `open-webui` y `secretia`.

---

## 0) Antes de empezar — checklist

- [ ] Un **proyecto** nuevo en EasyPanel (ej. `secretia`).
- [ ] Un **dominio/subdominio** apuntando a tu EasyPanel (ej. `secretia.tudominio.com`).
- [ ] **Lockatus** corriendo y accesible (vas a registrar la app `secretia`).
- [ ] Una clave de sesión a mano: en cualquier consola, `openssl rand -hex 32`.
- [ ] RAM/CPU suficientes para el modelo que vayas a usar (un 7–8B ≈ 4–5 GB).

---

## 1) Servicio `ollama` — motor de modelos (interno)

| Campo | Valor |
|---|---|
| Tipo | **App** |
| Source | **Docker Image** → `ollama/ollama:latest` |
| Mount (volume) | contenedor: `/root/.ollama` |
| Dominio | **ninguno** (interno) |

Checklist:
- [ ] Servicio nombrado **`ollama`**.
- [ ] Volumen montado en `/root/.ollama` (si no, perdés los modelos al reiniciar).
- [ ] Tiene **salida a internet** (la necesita para `ollama pull`).
- [ ] Deploy → queda corriendo.

---

## 2) Servicio `open-webui` — el front (interno)

| Campo | Valor |
|---|---|
| Tipo | **App** |
| Source | **Docker Image** → `ghcr.io/open-webui/open-webui:main` |
| Mount (volume) | contenedor: `/app/backend/data` |
| Dominio | **ninguno** (lo expone `secretia`) |

**Environment** (reemplazá `TU-DOMINIO` y los secretos):

```
OLLAMA_BASE_URL=http://ollama:11434
WEBUI_NAME=Secretia
WEBUI_URL=https://TU-DOMINIO
WEBUI_SECRET_KEY=PEGÁ-UNA-CADENA-LARGA-ALEATORIA
ENABLE_SIGNUP=false
ENABLE_OAUTH_SIGNUP=true
OAUTH_PROVIDER_NAME=Lockatus
OAUTH_CLIENT_ID=secretia
OAUTH_CLIENT_SECRET=EL-MISMO-QUE-REGISTRES-EN-LOCKATUS
OPENID_PROVIDER_URL=https://lockatus.go.websiteonline.org/.well-known/openid-configuration
OPENID_REDIRECT_URI=https://TU-DOMINIO/oauth/oidc/callback
OAUTH_SCOPES=openid email profile
OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true
```

Checklist:
- [ ] Servicio nombrado **`open-webui`**.
- [ ] `OLLAMA_BASE_URL` apunta al servicio del paso 1.
- [ ] `WEBUI_URL` y `OPENID_REDIRECT_URI` usan **tu dominio real** (https).
- [ ] `WEBUI_SECRET_KEY` es larga, aleatoria y **secreta**.
- [ ] Deploy → la primera vez tarda ~1 min en inicializar su base.

---

## 3) Servicio `secretia` — branding/acento (PÚBLICO)

| Campo | Valor |
|---|---|
| Tipo | **App** |
| Source | **GitHub** → `diegoparras/secretia`, rama `main` |
| Build | **Dockerfile** (EasyPanel lo detecta solo) |
| Environment | `OPEN_WEBUI_UPSTREAM=open-webui:8080` · `MODELS_UPSTREAM=models:8090` |
| Dominio | **tu dominio público** → Port **`8080`** |

Checklist:
- [ ] Servicio nombrado **`secretia`**.
- [ ] Build = **Dockerfile** (no Nixpacks).
- [ ] `OPEN_WEBUI_UPSTREAM` apunta al servicio del paso 2 (`open-webui:8080`).
- [ ] `MODELS_UPSTREAM` apunta al servicio de Modelos (`models:8090`) si lo usás.
- [ ] Dominio asignado al **puerto 8080**.
- [ ] Deploy → entrás a `https://TU-DOMINIO` y ves Open WebUI con el acento Secretia.

---

## 3·b) Servicio `models` — descargá modelos desde la web (interno, opcional)

Una página estilo LM Studio en **`/modelos`** para bajar modelos sin terminal, con
roles **dios** (descarga/borra) y **humano** (solo mira).

| Campo | Valor |
|---|---|
| Tipo | **App** |
| Source | **GitHub** → `diegoparras/secretia`, **build context `models/`** |
| Build | **Dockerfile** |
| Dominio | **ninguno** (lo expone `secretia` en `/modelos`) |
| Mount (volume) | contenedor: **`/data`** (catálogo editable persistido) |

> **Puerto:** el server escucha en **8090** (`ENV PORT=8090`). Si EasyPanel te
> inyecta otro puerto, agregá `PORT=8090` al Environment, **o** ajustá
> `MODELS_UPSTREAM` del servicio `secretia` al puerto real. Tienen que coincidir.

**Environment** (acceso local por contraseña):
```
OLLAMA_BASE_URL=http://ollama:11434
MODELS_SESSION_SECRET=<openssl rand -hex 32>
DIOS_PASSWORD=<clave para descargar/borrar>
HUMANO_PASSWORD=<clave para solo mirar>
```

O **federado con Lockatus** (en vez de las contraseñas):
```
OLLAMA_BASE_URL=http://ollama:11434
MODELS_SESSION_SECRET=<openssl rand -hex 32>
MODELS_LOCKATUS_ISSUER=https://lockatus.go.websiteonline.org
MODELS_PUBLIC_URL=https://TU-DOMINIO/modelos
MODELS_LOCKATUS_CLIENT_ID=secretia-modelos
```

Checklist:
- [ ] Servicio nombrado **`models`**, build context `models/`.
- [ ] **Volumen montado en `/data`** (si no, el catálogo editable es efímero y se
      pierde al reiniciar; el server avisa en el log).
- [ ] `MODELS_SESSION_SECRET` largo y secreto.
- [ ] O bien `DIOS_PASSWORD`/`HUMANO_PASSWORD`, **o bien** los `MODELS_LOCKATUS_*`.
- [ ] El servicio `secretia` (paso 3) tiene `MODELS_UPSTREAM=models:8090`.
- [ ] Probá `https://TU-DOMINIO/modelos`.

**Catálogo editable:** el rol **dios** agrega/edita/quita cards desde la propia
página (botón *Agregar modelo* y el lápiz de cada card), sin redeploy. Se guarda
en `/data/catalog.json`. La primera vez se siembra con el catálogo curado de
fábrica (`models/catalog.mjs`). "Quitar del catálogo" saca la card pero **no**
borra el modelo de Ollama.

---

## 4) Registrar `secretia` en Lockatus

En el admin de Lockatus → **Apps**:

- [ ] Alta de app `secretia`.
- [ ] `redirect_uri` = `https://TU-DOMINIO/oauth/oidc/callback` (idéntica a `OPENID_REDIRECT_URI`).
- [ ] `client_id` = `secretia`; `client_secret` = el mismo que pusiste en `OAUTH_CLIENT_SECRET`.
- [ ] Sumar `secretia` a la **matriz de accesos** para los roles que correspondan.

**¿Federaste también la página de Modelos?** Registrá una segunda app:
- [ ] Alta de app `secretia-modelos`.
- [ ] `redirect_uri` = `https://TU-DOMINIO/modelos/auth/callback`.
- [ ] Matriz de accesos: quien tenga rol **dios/god/admin/superadmin** podrá descargar/borrar; el resto solo mira.

---

## 5) Bajar un modelo

EasyPanel → servicio **`ollama`** → **Terminal**:

```bash
ollama pull llama3.1:8b      # chat general liviano
# o:  ollama pull qwen2.5:7b    (alternativa muy capaz)
# o:  ollama pull llava:7b      (multimodal: texto + imágenes)
```

- [ ] Al menos un modelo descargado (aparece solo en el selector de Secretia).

---

## 6) Primer admin

- [ ] Entrar a `https://TU-DOMINIO` y loguear por **Lockatus**.
- [ ] El **primer** usuario suele quedar como admin. Si no: en Open WebUI →
      Settings → **Users** lo promovés a admin.

---

## Verificación final

- [ ] El login muestra **"Continuar con Lockatus"** y entra sin pedir alta local.
- [ ] La barra superior tiene el **acento magenta** de Secretia (si pusiste el servicio 3).
- [ ] El chat responde con el modelo que bajaste.
- [ ] Reiniciar `ollama` **no** borra los modelos (volumen OK).

---

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Open WebUI no ve modelos | hostname interno mal | revisá `OLLAMA_BASE_URL`; usá el hostname interno que muestre EasyPanel para `ollama`. |
| 502 / no carga el front | upstream mal en el branding | revisá `OPEN_WEBUI_UPSTREAM` (debe ser `open-webui:8080` o el hostname real). |
| OIDC: "redirect_uri mismatch" | la URL no coincide | `OPENID_REDIRECT_URI` y la registrada en Lockatus deben ser **idénticas** (mismo dominio, https, `/oauth/oidc/callback`). |
| OIDC redirige a `http://` | proxy sin proto | ya lo maneja la plantilla nginx (pasa `X-Forwarded-Proto`); asegurate de que `WEBUI_URL` sea **https**. |
| No se ve el acento | falta el servicio 3 | el acento lo inyecta `secretia` (nginx). Si pusiste el dominio directo a `open-webui`, no hay acento. |
| El chat tarda muchísimo | modelo grande en CPU | usá un modelo más chico (7–8B) o sumá GPU/RAM. |

---

## Variante mínima (2 servicios, sin acento)

Si querés lo más simple posible: armá solo `ollama` + `open-webui` y poné el
**dominio directo a `open-webui`** (puerto 8080). Funciona igual con login
Lockatus y nombre "Secretia", pero **perdés el acento CSS** (eso lo aporta el
servicio de branding del paso 3).

---

> Secretia es un **fork/distribución** de [Open WebUI](https://github.com/open-webui/open-webui)
> + [Ollama](https://github.com/ollama/ollama) con branding Escriba. Ver
> [README](README.md) → "Atribución" y "Licencia".
