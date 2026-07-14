# 枪战突击 · COMBAT STRIKE — 生产镜像（多阶段，国内网络友好）
# 基础镜像 Debian bookworm。阶段1 带编译工具：若 better-sqlite3 预编译二进制
# （来自 GitHub Releases）在国内拉取失败，则就地从源码编译，保证镜像一定可构建。
# 已对 apt / npm / better-sqlite3 预编译全部切换国内镜像（阿里云 / npmmirror），
# 避免 Docker Hub 与 GitHub 在大陆网络拉不动。

# ---------- 构建阶段 ----------
FROM node:22-bookworm AS builder
ENV NODE_ENV=production
# 国内网络优化：apt 走阿里云镜像
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    python3 make g++ build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# npm 与 better-sqlite3 预编译均走 npmmirror 国内镜像
ENV npm_config_registry=https://registry.npmmirror.com
ENV npm_config_better_sqlite3_binary_host_mirror=https://registry.npmmirror.com/-/binary/better-sqlite3
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
