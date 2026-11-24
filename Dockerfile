# Build: install every dependency, compile, then keep only what the bot needs at run time.
FROM node:24-bookworm-slim AS build

# better-sqlite3 is a native module. Its prebuilt binary is used when one matches; otherwise it compiles with these.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.1.2

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

# Run: the compiled bot and its production dependencies, as an unprivileged user.
FROM node:24-bookworm-slim

ENV NODE_ENV=production
# Each server's database, plus app.db, is kept here. Mount a volume so they survive new images.
ENV DATA_DIR=/data

WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data

# DISCORD_TOKEN must be set when the container runs. PayMe only connects out to Discord, so no port is exposed.
CMD ["node", "dist/index.js"]
