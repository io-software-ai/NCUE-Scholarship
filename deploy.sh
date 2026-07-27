#!/bin/bash
# 根目錄部署腳本（monorepo）：維持既有伺服器流程 —— 在 repo 根目錄執行 ./deploy.sh
# 實際建置的是 apps/web（透過根 package.json 的 build/start 代理腳本）。

set -euo pipefail

APP_NAME="ncue-scholarship"
HEALTH_URL="http://localhost:3000/"
HEALTH_TIMEOUT=30

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 0. 確保 apps/web 讀得到根目錄的 .env.local
#    Next.js 只讀「自己專案目錄」下的 .env.local，而建置的 cwd 是 apps/web。
#    根目錄那份同時是自架 Supabase 的 docker env，所以用 symlink 共用而非搬移。
if [ ! -e apps/web/.env.local ]; then
	ln -s ../../.env.local apps/web/.env.local
	echo "→ 已建立 apps/web/.env.local symlink"
fi

# 1. 安裝相依（workspaces；packages/core 會由 prepare 自動建置）
npm ci

# 2. 專案編譯（→ apps/web）
#    set -e 保證編譯失敗就中止，線上程序完全不受影響。
npm run build

# 3. 重啟：已存在就 restart（停機僅約 1～2 秒），不存在才首次啟動
if pm2 describe "$APP_NAME" > /dev/null 2>&1; then
	echo "→ 重啟既有程序"
	pm2 restart "$APP_NAME" --update-env
else
	echo "→ 首次啟動"
	pm2 start npm --name "$APP_NAME" -- run start
fi

# 4. 健康檢查：等到真的能服務再宣告完成，避免「部署完成」但實際還在 523
printf "→ 等待服務就緒 "
code=""
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
	code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$HEALTH_URL" || true)"
	if [ "$code" = "200" ]; then
		echo "✓ (${i}s)"
		pm2 save
		echo "部署完成！"
		exit 0
	fi
	printf "."
	sleep 1
done

echo ""
echo "✗ 健康檢查失敗：${HEALTH_TIMEOUT} 秒內未回 200（最後狀態碼：${code:-無回應}）"
echo "--- 最近的錯誤日誌 ---"
pm2 logs "$APP_NAME" --err --lines 20 --nostream || true
exit 1
