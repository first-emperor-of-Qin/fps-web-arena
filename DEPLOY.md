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

> 下面两者是**境外 / 近岸**（香港 / 东京）的免费方案，延迟低、无需备案，适合先验证或海外玩家；
> 若你要的是**中国大陆（内地）服务器 + 大陆玩家低延迟**，请直接看上面的「方案六：国内云」。

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

## 方案六：国内云（阿里云 / 腾讯云 / 华为云 免费试用 ECS）★ 面向大陆玩家首选

> 如果你要的是**中国大陆（内地）**服务器、大陆玩家低延迟直连，这是首选。
> 现实（2026）：大陆云**没有永久免费**，只有「新用户试用」（阿里云个人版 300 元额度 / 3 个月；
> 学生认证 1 核 2G / 12 个月免费）。都需**实名认证**（支付宝扫码即可）。
> 关键点：**试用 ECS 不支持 ICP 备案** —— 但这正好，我们直接用**公网 IP 直连**
> `http://<公网IP>:3000`，游戏本就用 `location.host` 同源连接，不需要域名/备案。

### 步骤 1：开一台免费 ECS（以阿里云为例）
1. 注册并登录 [阿里云](https://www.aliyun.com)，完成**个人实名认证**（账号管理 → 实名认证 → 支付宝授权）。
2. 打开 [免费试用中心](https://free.aliyun.com)，筛选「计算 → 云服务器 ECS（个人版）」。
3. 地域选**中国内地**（如 华东 1 杭州 / 华北 2 北京 / 华南 1 深圳），规格选 **2 核 2G / 3M 带宽**即可（免费额度内）。
4. 系统镜像选 **Ubuntu 22.04 LTS**，设置 root 密码或绑定密钥。开通后得到**公网 IP**。
5. 控制台 → 该实例「安全组」→ 入站规则放行 **TCP 3000**（否则外网访问不到）。

> 腾讯云 / 华为云同理：免费试用 → 选内地地域 → 放行 3000 → 拿公网 IP。
> 学生可走「云工开物 / 云+校园」拿 1 核 2G 免费 12 个月。

### 步骤 2：SSH 进服务器，跑一句部署
```bash
# 方式 A（推荐，Docker 版，最省心）：
bash <(curl -fsSL https://mirror.ghproxy.com/https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy.sh)

# 方式 B（免 Docker，更省内存，适合 1核2G 免费机）：
bash <(curl -fsSL https://mirror.ghproxy.com/https://raw.githubusercontent.com/first-emperor-of-Qin/fps-web-arena/zcode/deploy-native.sh)
```
脚本会自动：配置国内镜像（Docker Daocloud 加速 / npm npmmirror）→ 装好运行环境 →
拉 `zcode` 代码 → 装依赖（better-sqlite3 走 npmmirror 预编译）→ 启动并放行端口。
完成后输出 `http://<公网IP>:3000/`，**大陆玩家直接流畅访问**。

### 步骤 3：给我权限，我直接替你部署上线 + 跑线上验证
如果你不想自己跑命令，把以下任一项给我，我可以用同一套脚本**直接 SSH 进去部署并验证**：
- ECS 的 **root 密码 + 公网 IP + 22 端口开放**（临时开放即可，部署完可改回密钥登录）；或
- 你本地能 SSH 的跳板，我给你一条 `ssh ... 'bash -s' < deploy.sh` 形式的命令你来执行。

> 部署后若要长期运行：免费实例重启会重置系统盘 → 数据库丢失。
> 用 `deploy-native.sh` 时 DB 在 `/opt/fps-arena/data/app.sqlite`；
> 若要持久化，挂载云盘并设 `DB_PATH=/mnt/disk/app.sqlite` 后 `pm2 restart fps-arena`。

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
