# Secretia · Modelos — servicio Node. En EasyPanel: App → Source = repo →
# Build = Dockerfile (context = models/). El nginx de branding lo enruta en /modelos.
FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORT=8090
EXPOSE 8090
CMD ["node", "server.mjs"]
