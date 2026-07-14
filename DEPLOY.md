# 部署说明 · DEPLOY

枪战突击 · COMBAT STRIKE 联机版 — Node.js 全栈部署指南。

## 本地开发 / 运行

### 前置条件
- **Node.js 22.x**（已在 `package.json` 锁定 `engines.node`）
- npm（随 Node.js 附带）

### 启动
```bash
# 进入项目根目录
cd fps-web-arena

# 安装依赖（仅首次）
npm install

# 启动服务
npm start
```

启动后访问 **[http://localhost:3000](http://localhost:3000)**。

### 说明
- 首次启动自动创建数据库，默认位于 `server/data/app.sqlite`。
- 如需将数据库放到挂载的持久盘（避免免费实例重启丢库），可设置环境变量 `DB_PATH` 指向持久盘路径，例如 `DB_PATH=/var/data/app.sqlite`。
- 前后端在**同一端口**提供（Express 静态托管 + WebSocket），**无 CORS 问题**。
- 停止：终端按 `Ctrl+C`。

---

## 生产环境部署

### 方案一：Render（推荐，免费额度可用）

[Render](https://render.com) 提供免费 Web Service，支持 Node.js。

1. 将仓库推送到 GitHub。
2. 在 Render Dashboard → **New Web Service** → 连接仓库。
3. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server/index.js`
   - **Environment Variable**: `PORT` 自动注入（无需手动设置）
4. 点击 **Deploy**。部署完成后的 URL 形如 `https://xxxx.onrender.com`。

> ⚠️ 免费实例 15 分钟无请求会休眠，再次访问需约 30 秒冷启动。**节点在美国，国内访问偏慢**——若面向大陆玩家，优先看下方「免费 + 国内流畅访问」的 Fly.io（香港）/ Oracle（东京）方案。

### 方案二：Railway

[Railway](https://railway.app) 对 Node.js 有良好支持。

1. 推送仓库到 GitHub。
2. Railway → New Project → Deploy from GitHub。
3. Railway 自动检测 `package.json` 的 `start` 脚本。
4. 无需额外配置，部署完成即可通过分配域名访问。

### 方案三：自托管 VPS

```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 克隆仓库
git clone <仓库地址> /opt/fps-web-arena
cd /opt/fps-web-arena

# 安装 & 启动
npm install
npm start
```

推荐用 **pm2** 守护进程：`npm install -g pm2 && pm2 start server/index.js --name fps-arena && pm2 save`

配合 **Nginx 反向代理 + SSL**（可选）：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 免费 + 国内流畅访问（重点）

> 现实（2026）：腾讯云 / 阿里云 / 华为云 只有 **1–3 个月新用户试用**、需实名，**不叫真免费**；
> 真正「永久免费 + 离大陆最近 + 完整支持 Node/WebSocket/SQLite 持久盘」的是下面两者。

### 方案四：Fly.io 香港节点（★ 推荐：免费 + 延迟最低）

[Fly.io](https://fly.io) 有 **香港（hkg）** 节点，离大陆最近 → 国内延迟最低、最流畅。
免费档为 `shared-cpu-1x / 256MB`，够跑这个轻量后端；支持 Docker / WebSocket / 持久卷（SQLite）。

1. 本地安装 `flyctl`（需用自己的信用卡验证，但免费档 **0 费用**）：
   ```bash
   # macOS
   brew install flyctl
   # 其它系统见 https://fly.io/docs/hands-on/installing/
   ```
2. 登录并部署（仓库根已有 `fly.toml`，已锁定 hkg 区域）：
   ```bash
   flyctl auth login
   flyctl launch --no-deploy     # 首次：生成 app 并绑定配置
   flyctl deploy                  # 构建镜像并上线
   ```
3. 部署完成后得到 `https://<app>.fly.dev`，**WebSocket 自动走 wss://，国内可直接流畅访问**。
4. 之后改了代码：`git push` 后跑一次 `flyctl deploy` 即可。

> ⚠️ 免费档在无流量时会自动停机（省钱），**首次访问有数秒冷启动**；256MB 内存偏紧，
> 若玩家多/OOM，升级付费档或改用方案五。

### 方案五：Oracle Cloud 永久免费（东京，更充裕）

[Oracle Cloud Always Free](https://www.oracle.com/cloud/free/) 在 **东京（ap-tokyo-1）/ 首尔** 提供
**永久免费** ARM 实例（4 OCPU / 24GB）或 2 台 AMD 实例，**永不休眠**、资源充裕，
东京到大陆延迟约 40–70ms（够流畅）。需信用卡验证（不扣费），部分地区注册有名额限制可换区域重试。

1. 注册 Oracle Cloud，创建 **Always Free** 实例（系统选 Ubuntu 22.04，区域选东京/首尔）。
2. 安全列表入站放行 **TCP 3000**（或 80/443 若配 Nginx）。
3. SSH 进实例，直接复用本仓库的 VPS 方式：
   ```bash
   curl -fsSL https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy.sh | bash
   # 或手动：git clone -b zcode … && docker compose up -d --build
   ```
4. 访问 `http://<实例公网IP>:3000/`。

### 国内「真·永久免费」小厂（不推荐游戏后端）

阿贝云 / 丰云等自称永久免费（1核1G），但条款**禁止对外提供公共服务（API/代理等）**，
游戏后端属于公开服务、可能被回收；且每 5 天需手动续期、配置极低。仅适合练手，**不建议用于本游戏**。

---

## 项目结构

```
fps-web-arena/
├── index.html                 # 前端单体（30k+ 行，含联机UI + 网络层）
├── server/
│   ├── index.js               # Express + ws 启动入口
│   ├── db.js                  # SQLite 数据层（自动建表）
│   ├── auth.js                # 注册/登录/注销/JWT会话
│   ├── social.js              # 好友系统 REST
│   ├── realtime.js            # WebSocket 实时层（聊天/匹配/组队/对局同步）
│   └── data/                  # 运行时生成的数据库文件（不入库）
│       └── app.sqlite
├── package.json               # Node.js 项目配置
├── DEPLOY.md                  # 本文件
├── README.md                  # 项目说明
└── (其他原有文件)
```

---

## 技术要点

| 组件 | 选择 | 说明 |
|------|------|------|
| Web 框架 | Express | 托管静态 + REST API |
| 实时通信 | ws（原生 WebSocket） | 聊天 / 匹配 / 对局同步 |
| 数据库 | SQLite（better-sqlite3） | 文件型、零配置、自动建表 |
| 密码加密 | bcryptjs | 纯 JS、跨平台 |
| 会话 | 随机 token + httpOnly cookie | 30 天有效期 |
| 游戏引擎 | Three.js v0.152 | 已有、保留 |

---

## 常见问题

**Q: 为什么 GitHub Pages 不行？**
A: GitHub Pages 是纯静态托管，不能运行 Node.js 进程（WebSocket / REST API）。使用上述 Render/Railway/VPS 方案即可。

**Q: 每次部署数据库会被清空吗？**
A: Render / Railway 免费实例的磁盘是临时的，每次冷启动会丢失数据库。如需持久化，建议使用付费实例或挂载持久卷，或改为 PostgreSQL 替代 SQLite。

**Q: WebSocket 连接失败 "auth_error"？**
A: 前端访问的域名必须与后端一致（同源），否则 session cookie 不会发送到 ws 握手。请确保通过 `http://localhost:3000` 或统一的部署域名访问。
