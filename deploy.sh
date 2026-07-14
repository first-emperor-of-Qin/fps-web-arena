#!/usr/bin/env bash
# =============================================================================
# 枪战突击 · COMBAT STRIKE — 国内部署一键引导脚本
# 适用：腾讯云 / 阿里云 / 华为云 / 任意国内 Linux VPS（Ubuntu / Debian）
# 作用：安装 Docker → 拉取代码（zcode 分支）→ 构建镜像 → 启动容器 → 放行端口
# 用法（在 VPS 上以 root 执行）：
#   bash <(curl -fsSL https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy.sh)
# 或：
#   curl -fsSL https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy.sh -o deploy.sh && bash deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="/opt/fps-arena"
REPO="https://github.com/first-emperor-of-Qin/fps-web-arena.git"
BRANCH="zcode"
PORT="3000"

echo "==> [1/5] 安装 Docker（使用 Daocloud 国内镜像，境外可改用 https://get.docker.com）"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.daocloud.io/docker | bash
  # 让 docker 命令立即可用
  systemctl enable --now docker 2>/dev/null || true
else
  echo "    Docker 已存在，跳过安装"
fi

# 确保 compose 插件可用
if ! docker compose version >/dev/null 2>&1; then
  echo "    docker compose 插件缺失，尝试安装..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin || true
fi

echo "==> [2/5] 拉取代码（分支 $BRANCH）"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --all && git -C "$APP_DIR" checkout "$BRANCH" && git -C "$APP_DIR" pull
else
  # 国内 GitHub 拉取较慢/偶发不稳时的镜像加速（可注释掉改用原地址）
  MIRROR_REPO="https://mirror.ghproxy.com/${REPO#https://}"
  git clone --depth 1 --branch "$BRANCH" "$MIRROR_REPO" "$APP_DIR" \
    || git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP_DIR"
fi

echo "==> [3/5] 构建并启动容器"
cd "$APP_DIR"
docker compose up -d --build

echo "==> [4/5] 放行防火墙端口 $PORT"
if command -v ufw >/dev/null 2>&1; then
  ufw allow "$PORT"/tcp || true
fi

echo "==> [5/5] 完成"
PUB_IP=$(curl -fsSL https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
echo "--------------------------------------------------------------"
echo " 部署完成！游戏地址："
echo "   http://${PUB_IP}:${PORT}/"
echo "   （若用域名 + HTTPS，参见 DEPLOY.md 的 Nginx 反代章节）"
echo " 容器状态："
docker compose ps
echo "--------------------------------------------------------------"
echo " 注意：若用云厂商（腾讯云/阿里云），还需在控制台「安全组」"
echo "       入站规则放行 TCP ${PORT} 端口，否则外网仍访问不到。"
echo "--------------------------------------------------------------"
