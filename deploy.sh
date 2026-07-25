#!/bin/bash
# 根目錄部署腳本（monorepo）：維持既有伺服器流程 —— 在 repo 根目錄執行 ./deploy.sh
# 實際建置的是 apps/web（透過根 package.json 的 build/start 代理腳本）。

set -e

# 0. 安裝相依（workspaces；packages/core 會由 prepare 自動建置）
npm ci

# 1. 專案編譯（→ apps/web）
npm run build

# 2. 停止目前的 PM2 程序
pm2 stop ncue-scholarship || true
pm2 delete ncue-scholarship || true

# 3. 啟動新程序（→ apps/web 的 next start）
pm2 start npm --name "ncue-scholarship" -- run start

# 4. 儲存 PM2 列表以便重開機自動啟動
pm2 save

echo "部署完成！"
