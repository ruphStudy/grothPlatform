FROM node:20.19.4-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20.19.4-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node
COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
