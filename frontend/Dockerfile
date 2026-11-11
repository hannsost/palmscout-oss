ARG NODE_IMAGE
FROM ${NODE_IMAGE} AS base
ARG NODE_IMAGE
RUN node -e 'if (!/^node:24[^@]*-alpine[^@]*@sha256:[a-f0-9]{64}$/.test(process.argv[1]) || process.versions.node.split(".")[0] !== "24") process.exit(1)' "$NODE_IMAGE"
RUN apk add --no-cache gcompat

# ── Dependencies ──────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ARG NEXT_PUBLIC_API_URL=https://api.example.com
ARG NEXT_PUBLIC_APP_URL=https://app.example.com
ARG NEXT_PUBLIC_REGISTRATION_ENABLED=false
ARG NEXT_PUBLIC_EMAIL_ENABLED=false
ARG NEXT_PUBLIC_GOOGLE_MAPS_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_REGISTRATION_ENABLED=$NEXT_PUBLIC_REGISTRATION_ENABLED
ENV NEXT_PUBLIC_EMAIL_ENABLED=$NEXT_PUBLIC_EMAIL_ENABLED
ENV NEXT_PUBLIC_GOOGLE_MAPS_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_KEY
RUN npm run build

# ── Runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER 1001:1001
ARG SOURCE_REVISION
ARG SOURCE_FINGERPRINT
LABEL org.opencontainers.image.title="palmscout Web" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.palmscout.source-fingerprint="${SOURCE_FINGERPRINT}"
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e 'fetch("http://127.0.0.1:" + (process.env.PORT || "3000") + "/healthz", {signal: AbortSignal.timeout(3000)}).then(r => { if (r.status !== 200) process.exit(1); }).catch(() => process.exit(1))'

CMD ["node", "server.js"]
