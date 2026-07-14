// PM2 进程守护配置（无 Docker 时的备选方案）
// 用法（VPS 已装 Node 22 + npm install 后）：
//   npm install -g pm2 && pm2 start ecosystem.config.js --env production && pm2 save
module.exports = {
  apps: [
    {
      name: 'fps-arena',
      script: 'server/index.js',
      cwd: '/opt/fps-arena',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        DB_PATH: '/opt/fps-arena/data/app.sqlite',
      },
    },
  ],
};
