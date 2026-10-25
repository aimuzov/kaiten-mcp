# Удалённый коннектор: `kaiten-mcp serve --http`. Контекст сборки -- корень репо.

FROM node:26.11.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json astro.config.mjs svelte.config.js postcss.config.mjs ./
COPY src ./src
# Сборка: сервер в build/ и страницы Astro в build/public.
# Astro и Svelte -- devDependencies, после prune в образ они не попадают.
RUN npm run build && npm prune --omit=dev

FROM node:26.11.1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# auth.db с клиентами OAuth лежит в томе. Каталог создаём здесь, чтобы пустой том
# унаследовал владельца node и сервер мог в него писать.
RUN mkdir /data && chown node:node /data
ENV KAITEN_MCP_DATA_DIR=/data PORT=8080
USER node
EXPOSE 8080
CMD ["node", "build/index.js", "serve", "--http"]
