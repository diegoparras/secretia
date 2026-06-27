# Secretia

**La IA de la familia Escriba.** Un repo "listo para cocinar" que junta:

- **[Ollama](https://ollama.com)** — el motor que corre los modelos de lenguaje en tu propio servidor.
- **[Open WebUI](https://openwebui.com)** — el front de chat.
- Una capa **nginx** que le pone el **branding Escriba** (nombre, logo, acento) e inyecta el CSS de marca.
- **Federación con [Lockatus](https://lockatus.go.websiteonline.org)** (login único de la Suite, vía OIDC).

> ### ⚠️ Transparencia: Secretia es un *fork / distribución*
> Secretia **no reescribe** Open WebUI: lo **envuelve** y le aplica branding.
> Todo el mérito del front es de [Open WebUI](https://github.com/open-webui/open-webui)
> y el del motor de modelos de [Ollama](https://github.com/ollama/ollama).
> Respetamos sus licencias y atribución (ver [Atribución](#atribución)).
> "Secretia" es solo el empaquetado + identidad Escriba sobre ambos.

---

## Arquitectura

```
                 ┌──────────────────────────────────────────────────┐
   Internet ───► │  web (nginx)  :8080  ← dominio público            │
                 │   • branding Escriba · inyecta secretia.css       │
                 │   • /         → chat   · /modelos → descargador    │
                 └──────┬──────────────────────────┬─────────────────┘
                 proxy /│                proxy /modelos│
          ┌─────────────▼──────────┐      ┌──────────▼───────────────┐
          │  open-webui  :8080      │      │  models  :8090            │
          │   • chat, OIDC          │      │   • catálogo + descarga   │
          │   • login Lockatus      │      │   • roles dios/humano     │
          └─────────────┬──────────┘      └──────────┬───────────────┘
                        │  http://ollama:11434        │
                        └─────────────┬───────────────┘
                            ┌─────────▼──────────┐
                            │  ollama  :11434     │
                            │   • modelos locales │
                            └─────────────────────┘
```

- **Solo `web` es público.** `open-webui`, `models` y `ollama` quedan internos (sin puertos publicados).
- Otras apps de la Suite pueden usar el mismo Ollama apuntando a `http://ollama:11434`
  **si están en el mismo proyecto de EasyPanel**.

---

## Deploy en EasyPanel (paso a paso)

1. **Subí este repo** a tu GitHub (Diego crea el remote, como con las otras apps de la Suite).
2. En EasyPanel: **+ Service → Compose**, conectalo a este repo (rama `main`).
3. **Variables de entorno:** copiá `.env.example` → `.env` y completá:
   - `WEBUI_URL` y `OPENID_REDIRECT_URI` con tu dominio real.
   - `WEBUI_SECRET_KEY` con una cadena larga aleatoria (`openssl rand -hex 32`).
   - Los `OAUTH_*` / `OPENID_*` (ver [Federar con Lockatus](#federar-con-lockatus)).
4. **Dominio:** asigná tu dominio público (p.ej. `secretia.go.websiteonline.org`)
   al servicio **`web`**, puerto **`8080`**.
5. **Deploy.** La primera vez Open WebUI inicializa su base; tardá un minuto.
6. **Modelos:** descargá al menos uno (ver [Modelos](#modelos-de-ollama)).

> Ollama necesita **salida a internet** para `ollama pull`. Una vez bajados los
> modelos, queda todo local.

---

## Deploy SIN Compose — 4 servicios separados (recomendado en EasyPanel)

> **Guía operativa con checklist y troubleshooting: [DEPLOY.md](DEPLOY.md).**

EasyPanel se lleva mejor con servicios sueltos que con un Compose. Creá un
**proyecto** (p.ej. `secretia`) y dentro **4 servicios** (el de Modelos es opcional
pero recomendado):

### 1) `ollama` — motor de modelos (interno)
- **App → desde imagen:** `ollama/ollama:latest`
- **Volumen:** monto `/root/.ollama` (para que los modelos sobrevivan reinicios).
- **Sin dominio** (queda interno). Necesita salida a internet para `ollama pull`.

### 2) `open-webui` — front (interno)
- **App → desde imagen:** `ghcr.io/open-webui/open-webui:main`
- **Volumen:** monto `/app/backend/data`.
- **Variables de entorno:**
  ```
  OLLAMA_BASE_URL=http://ollama:11434
  WEBUI_NAME=Secretia
  WEBUI_URL=https://TU-DOMINIO
  WEBUI_SECRET_KEY=<openssl rand -hex 32>
  ENABLE_SIGNUP=false
  # Federación con Lockatus (ver sección siguiente)
  ENABLE_OAUTH_SIGNUP=true
  OAUTH_PROVIDER_NAME=Lockatus
  OAUTH_CLIENT_ID=secretia
  OAUTH_CLIENT_SECRET=<el de Lockatus>
  OPENID_PROVIDER_URL=https://lockatus.go.websiteonline.org/.well-known/openid-configuration
  OPENID_REDIRECT_URI=https://TU-DOMINIO/oauth/oidc/callback
  ```
- **Sin dominio** (lo expone el servicio de branding).

### 3) `models` — página de descarga de modelos (interno)
- **App → Source = este repo**, **Build = Dockerfile**, **build context = `models/`**.
- **Variables de entorno:**
  ```
  OLLAMA_BASE_URL=http://ollama:11434
  MODELS_SESSION_SECRET=<openssl rand -hex 32>
  # Acceso local por contraseña (rol). Dejalas vacías si federás con Lockatus.
  DIOS_PASSWORD=<clave para descargar/borrar>
  HUMANO_PASSWORD=<clave para solo mirar>
  # — o — federación con Lockatus (ver sección siguiente):
  # MODELS_LOCKATUS_ISSUER=https://lockatus.go.websiteonline.org
  # MODELS_PUBLIC_URL=https://TU-DOMINIO/modelos
  ```
- **Sin dominio** (lo expone `secretia` en `/modelos`).

### 4) `secretia` — branding + ruteo (público)
- **App → Source = este repo de GitHub** (`diegoparras/secretia`), **Build = Dockerfile**.
  (Construye una `nginx` que proxya a Open WebUI, inyecta el CSS de acento y enruta `/modelos`.)
- **Variables de entorno:** `OPEN_WEBUI_UPSTREAM=open-webui:8080` y `MODELS_UPSTREAM=models:8090`
  (apuntan a los servicios 2 y 3; si el hostname interno difiere, usá el que muestre EasyPanel).
- **Dominio:** asigná tu dominio público → puerto **`8080`**.

> Los hostnames internos (`ollama`, `open-webui`, `models`) funcionan si nombrás los
> servicios así dentro del MISMO proyecto. Si EasyPanel usa otro hostname interno,
> ajustá `OLLAMA_BASE_URL`, `OPEN_WEBUI_UPSTREAM` y `MODELS_UPSTREAM`.

**¿Querés lo más simple posible?** Salteá el servicio 3 y ponéle el dominio
directo a `open-webui` (puerto 8080). Perdés el acento CSS, pero te queda el
nombre "Secretia" y la federación. El acento Escriba lo da el servicio de branding.

---

## Federar con Lockatus

Open WebUI trae OIDC nativo. Para que el login pase por Lockatus:

1. **Registrá la app `secretia` en Lockatus** (panel de admin → Apps), con:
   - `redirect_uri` = `https://secretia.go.websiteonline.org/oauth/oidc/callback`
     (la MISMA que pongas en `OPENID_REDIRECT_URI`).
   - Agregá `secretia` a la **matriz de accesos** para los roles que correspondan.
2. **Asigná un rol** a tu usuario en la columna `secretia` de la matriz de Lockatus
   (sin rol asignado → `access_denied`).
3. **Completá las variables en el servicio `open-webui`** (NO en el de branding):
   ```
   ENABLE_OAUTH_SIGNUP=true
   ENABLE_SIGNUP=false
   OAUTH_PROVIDER_NAME=Lockatus
   OAUTH_CLIENT_ID=secretia
   OAUTH_CLIENT_SECRET=<cualquier valor no vacío>   # Lockatus lo ignora (cliente público)
   OPENID_PROVIDER_URL=https://lockatus.go.websiteonline.org/.well-known/openid-configuration
   OPENID_REDIRECT_URI=https://secretia.go.websiteonline.org/oauth/oidc/callback
   OAUTH_SCOPES=openid email profile
   OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true
   OAUTH_CODE_CHALLENGE_METHOD=S256       # ← OBLIGATORIO: Lockatus exige PKCE
   ```
4. **Re-deploy.** En el login de Secretia aparece **"Continuar con Lockatus"**.
5. (Opcional) Para mostrar **solo** ese botón y ocultar el login local por email/clave:
   `ENABLE_LOGIN_FORM=false` — hacelo **recién** cuando confirmes que el SSO entra.

> **Gotchas reales (esto nos costó — leelos):**
> - **`OAUTH_CODE_CHALLENGE_METHOD=S256` es obligatorio**: Lockatus exige PKCE; sin esto el
>   login falla (`access_denied` en `/authorize` o `invalid_grant` en `/token`).
> - Necesitás **Lockatus ≥ v0.1.3**: versiones previas solo leían el `client_id` del body y
>   daban `invalid_grant` con clientes confidenciales (authlib/Open WebUI lo manda por **HTTP
>   Basic auth**). v0.1.3 lo acepta de ambos lados.
> - El `redirect_uri` debe ser **idéntico** carácter por carácter en `OPENID_REDIRECT_URI` y en
>   la app de Lockatus, y es `…/oauth/oidc/callback` (la ruta de Open WebUI).
> - Si tu email de Lockatus ya existe como **cuenta local** de Open WebUI →
>   `OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true` (si no, "email or password incorrect", engañoso).
> - El `OAUTH_CLIENT_SECRET` puede ser **cualquier valor no vacío** (Lockatus es público + PKCE;
>   la prueba de posesión es el `code_verifier`, no el secret).

---

## Descargar modelos

Tres formas, las dos primeras desde la web (sin terminal):

### 1) Página "Modelos" de Secretia (estilo LM Studio) — servicio `models`
Entrá a **`https://TU-DOMINIO/modelos`**: un catálogo curado (chat, razonamiento,
código, visión, embeddings) con tamaños y un botón **Descargar** con barra de
progreso, más "instalado/no instalado" y borrado. Acceso por **rol**:

- **dios** → descarga y borra modelos.
- **humano** → solo mira.

El acceso es por **contraseña local** (`DIOS_PASSWORD` / `HUMANO_PASSWORD`) o
**federado con Lockatus** (registrá `secretia-modelos`; ver abajo). ¿Otro modelo?
Pegá cualquier tag de [ollama.com/library](https://ollama.com/library).

### 2) Open WebUI (lo que ya trae el chat)
En el chat: avatar → **Admin Settings → Models → "Pull a model from Ollama.com"**.

### 3) Por terminal (opcional)
EasyPanel → servicio `ollama` → Terminal:

```bash
ollama pull llama3.1:8b        # chat general, liviano
ollama pull qwen2.5:7b         # alternativa muy capaz
ollama pull llava:7b           # multimodal (texto + imágenes)
```

Los modelos aparecen solos en el selector de Open WebUI.

> Pesos aproximados: un modelo 7–8B ronda **4–5 GB**. Sumá RAM/VRAM acorde.

---

## Branding (estilo Escriba)

El branding es **nivel marca**, no un re-skin total (Open WebUI es su propia app):

- **Nombre:** `WEBUI_NAME=Secretia` (env).
- **Acento + fuente Inter:** `web/secretia.css`, inyectado por nginx.
  El acento (`--secretia-accent: #b23a8c`, magenta/fucsia) se ajusta ahí.
  Se eligió en función de la familia: es el hueco libre del arco de acentos de
  marca y no pisa el verde/ámbar/rojo semánticos (`--ok`/`--warn`/`--err`).
- **Logo / favicon:** `web/logo.svg` y `web/favicon.svg` (servidos en `/secretia/`).

> El CSS es **best-effort**: si una actualización de Open WebUI cambia su HTML,
> algún selector puede dejar de pegar. Los toques seguros (fuente, acento de
> links/foco/selección, barra superior) son estables; recolorear botones
> primarios requiere ajustar selectores a tu versión (ver el bloque comentado
> al final de `secretia.css`).

Para un re-skin **100% canónico** habría que forkear la UI de Open WebUI y
mantenerla a mano (caro, se rompe en cada update). No lo recomendamos salvo que
quieras una experiencia totalmente propia: en ese caso conviene construir un
front nuestro, no pelear con el de un tercero.

---

## Seguridad

- `ENABLE_SIGNUP=false`: no hay alta local; el alta entra por Lockatus.
- `WEBUI_SECRET_KEY` larga y secreta; **nunca** commitees `.env`.
- `ollama` y `open-webui` sin puertos públicos: solo `web` mira a internet.
- Mantené las imágenes al día (`open-webui:main`, `ollama:latest`) y re-deployá.

---

## Atribución

Secretia es una **distribución** que combina software de terceros, con branding Escriba:

- **Open WebUI** — © Open WebUI contributors — https://github.com/open-webui/open-webui
- **Ollama** — © Ollama — https://github.com/ollama/ollama

Sus marcas y licencias pertenecen a sus autores. Consultá los repos de origen
para los términos de uso. El branding y el empaquetado "Secretia" son parte de la
familia Escriba.

---

## Licencia

El **empaquetado y branding de Secretia** (este repo: compose, nginx, CSS, logos,
documentación) se publica bajo licencia **MIT** — ver [LICENSE](LICENSE).

Esto cubre **solo** lo propio de este repo. **Open WebUI** y **Ollama** se
distribuyen como sus imágenes oficiales y conservan **sus propias licencias**;
no los redistribuimos ni los modificamos (los orquestamos vía Docker). Si pensás
desplegar a gran escala, revisá los términos de marca de Open WebUI en su repo.
