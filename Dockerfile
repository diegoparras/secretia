# Secretia — capa de branding (nginx) como servicio INDEPENDIENTE.
# En EasyPanel: App → Source = este repo de GitHub → Build = Dockerfile.
# Es la pieza pública: proxya a Open WebUI e inyecta el CSS de marca.
FROM nginx:alpine

# A dónde proxyear Open WebUI (host:puerto internos en EasyPanel).
# Sobrescribilo con la variable de entorno del servicio si tu host es otro.
ENV OPEN_WEBUI_UPSTREAM=open-webui:8080
# Sustituí SOLO esa variable en la plantilla (no toca las $vars de nginx).
ENV NGINX_ENVSUBST_FILTER=OPEN_WEBUI_UPSTREAM

# Plantilla de nginx → la imagen oficial la procesa con envsubst al arrancar.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
# Assets de marca (CSS de acento, logo, favicon, fuente Inter).
COPY web/ /usr/share/nginx/secretia/

EXPOSE 8080
