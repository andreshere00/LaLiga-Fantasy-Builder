# syntax=docker/dockerfile:1

FROM oven/bun:1.3 AS build

WORKDIR /app

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ .
# mappers.ts imports repo-root assets/teams_master.json (../../../assets from src/api).
COPY assets/teams_master.json /assets/teams_master.json
RUN bun run build

FROM nginx:1.27-alpine AS runtime

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/"]

CMD ["nginx", "-g", "daemon off;"]
