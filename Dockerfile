# 1) Export orbit data from the Python engine
FROM python:3.13-slim AS data
WORKDIR /src
COPY pyproject.toml README.md ./
COPY cislunar ./cislunar
RUN pip install --no-cache-dir . && python -c "from cislunar.export import export; print(export('/out'))"

# 2) Build the web app
FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./
COPY cislunar/research_data /cislunar/research_data
COPY cislunar/mission_data /cislunar/mission_data
COPY --from=data /out ./public/data
RUN npm test && npx tsc --noEmit -p . && npx vite build

# 3) Serve static files
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web /web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
