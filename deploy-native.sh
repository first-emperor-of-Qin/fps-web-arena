#!/usr/bin/env bash
# =============================================================================
# 枪战突击 · COMBAT STRIKE — 国内云「免 Docker」一键部署
# 适用：阿里云 / 腾讯云 / 华为云 免费试用 ECS（1核2G 这类小规格尤其合适）
# 方式：安装 Node.js 22（npmmirror 二进制）+ PM2 守护，无需 Docker，更省内存。
# 用法（在 ECS 上以 root 执行）：
#   bash <(curl -fsSL https://mirror.ghproxy.com/https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy-native.sh)
# 或：
#   curl -fsSL https://mirror.ghproxy.com/https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy-native.sh -o deploy-native.sh && bash deploy-native.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/fps-arena"
REPO="https://github.com/first-emperor-of-Qin/fps-web-arena.git"
BRANCH="zcode"
PORT="3000"
NODE_VER="22.11.0"
ARCH="x64"

echo "==> [1/6] 配置 npm 国内镜像（npmmirror）"
npm config set registry https://registry.npmmirror.com 2>/dev/null || true

echo "==> [2/6] 安装 Node.js ${NODE_VER}（从 npmmirror 二进制，免境外下载）"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | tr -d v | cut -d. -f1)" -lt 22 ]; then
  cd /tmp
  curl -fsSL "https://registry.npmmirror.com/-/binary/node/v${NODE_VER}/node-v${NODE_VER}-linux-${ARCH}.tar.xz" -o node.tar.xz
  tar -xf node.tar.xz
  rm -rf /opt/node22
  mv "node-v${NODE_VER}-linux-${ARCH}" /opt/node22
  ln -sf /opt/node22/bin/node /usr/local/bin/node
  ln -sf /opt/node22/bin/npm  /usr/local/bin/npm
  ln -sf /opt/node22/bin/npx  /usr/local/bin/npx
fi
echo "    node: $(node -v)  npm: $(npm -v)"

echo "==> [3/6] 安装 PM2 进程守护"
npm i -g pm2

echo "==> [4/6] 拉取代码（分支 $BRANCH，优先 ghproxy 国内加速）"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all && git -C "$APP_DIR" checkout "$BRANCH" && git -C "$APP_DIR" pull
else
  MIRROR_REPO="https://mirror.ghproxy.com/${REPO#https://}"
  git clone --depth 1 --branch "$BRANCH" "$MIRROR_REPO" "$APP_DIR" \
    || git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "==> [5/6] 安装依赖（better-sqlite3 预编译走 npmmirror）"
npm config set better_sqlite3_binary_host_mirror https://registry.npmmirror.com/-/binary/better-sqlite3
npm install --omit=dev --no-audit --no-fund

echo "==> [6/6] PM2 启动 + 开机自启 + 放行端口"
mkdir -p "$(dirname "${DB_PATH:-$APP_DIR/data/app.sqlite}")"
pm2 start ecosystem.config.js --env production --update-env
pm2 save
pm2 startup 2>/dev/null | tail -1 || true

if command -v ufw >/dev/null 2>&1; then
  ufw allow "$PORT"/tcp || true
fi

PUB_IP=$(curl -fsSL https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo "--------------------------------------------------------------"
echo " 部署完成！游戏地址（公网 IP 直连，无需域名/备案）："
echo "   http://${PUB_IP}:${PORT}/"
echo " 进程状态： pm2 ls"
echo "--------------------------------------------------------------"
echo " 重要：登录云厂商控制台 → 安全组 → 入站规则放行 TCP ${PORT}，"
echo "       否则外网仍访问不到。（若想用域名+HTTPS，见 DEPLOY.md Nginx 章节）"
echo "--------------------------------------------------------------"
