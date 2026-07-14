# 枪战突击 · COMBAT STRIKE — 生产镜像（多阶段，国内网络友好）
# 基础镜像 Debian bookworm。阶段1 带编译工具：若 better-sqlite3 预编译二进制
# （来自 GitHub Releases）在国内拉取失败，则就地从源码编译，保证镜像一定可构建。
# 阶段2 仅拷贝已编译产物，运行镜像保持精简。

# ---------- 构建阶段 ----------
FROM node:22-bookworm AS builder
ENV NODE_ENV=production
WORKDIR /app
# 编译 better-sqlite3 所需工具（预编译拉取失败时兜底）
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    python3 make g++ build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ---------- 运行阶段 ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    DB_PATH=/data/app.sqlite \
    PORT=3000
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server ./server
COPY index.html ./
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "server/index.js"]
