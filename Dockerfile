# Waste collection dates som container til Familien Sommer hub.
# Én proces: serveren leverer også siderne på samme port. Alt bundles med esbuild, så det færdige image
# ikke har node_modules. Data (den gemte adresse) ligger i /app/data, som monteres som volume.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
# npm, npx, corepack og yarn køres aldrig i drift, men deres pakker gav de fleste fund i sikkerhedsscannet (summer-hub/docs/team/EMNER.md).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/dist \
    TZ=Europe/Copenhagen
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./

RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist-server/server.mjs"]
