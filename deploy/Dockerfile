# Удалённый коннектор: `kaiten-mcp serve --http`. Контекст сборки -- корень репо.

FROM node:26.11.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json astro.config.mjs svelte.config.js postcss.config.mjs ./
COPY src ./src
# Сборка: сервер в build/ и страницы Astro в build/public.
RUN npm run build

FROM node:26.11.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=package-lock.json,target=/app/package-lock.json \
    npm ci --omit=dev --omit=optional --no-audit --no-fund
COPY --from=build /app/build ./build
# auth.db с клиентами OAuth лежит в томе. Каталог создаём здесь, чтобы пустой том
# унаследовал владельца node и сервер мог в него писать.
RUN mkdir /data && chown node:node /data
ENV KAITEN_MCP_DATA_DIR=/data PORT=8080
USER node
EXPOSE 8080
CMD ["node", "build/index.js", "serve", "--http"]
