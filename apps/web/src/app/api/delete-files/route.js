import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { verifyUserAuth } from '@/lib/apiMiddleware';

const ATTACHMENTS_DIR = path.resolve(process.cwd(), 'public', 'storage', 'attachments');

export async function POST(request) {
  // 1. 安全性檢查：確保只有已登入的管理員可以呼叫此 API
  const authCheck = await verifyUserAuth(request, {
    requireAuth: true,
    requireAdmin: true,
  });
  if (!authCheck.success) {
    return authCheck.error;
  }

  try {
    const body = await request.json();
    const { filePaths } = body; // 接收一個檔案路徑的陣列

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return NextResponse.json({ error: '未提供有效的檔案路徑' }, { status: 400 });
    }

    const deletionResults = {
      success: [],
      failed: [],
    };
    
    // 2. 迭代處理每一個要刪除的檔案路徑
    for (const relativePath of filePaths) {
      // 3. 建構檔案在伺服器上的絕對路徑
      // process.cwd() 會取得專案的根目錄
      // 只允許刪除附件目錄內的檔案（防 ../ 路徑穿越刪除 .env.local 等任意檔案）
      const absolutePath = typeof relativePath === 'string'
        ? path.resolve(process.cwd(), 'public', relativePath.replace(/^\/+/, ''))
        : '';
      if (!absolutePath.startsWith(ATTACHMENTS_DIR + path.sep)) {
        deletionResults.failed.push({ path: String(relativePath), error: '不允許的路徑' });
        continue;
      }

      try {
        // 4. 使用 Node.js 的 fs 模組來檢查檔案是否存在並刪除
        await fs.unlink(absolutePath);
        console.log(`成功刪除檔案: ${absolutePath}`);
        deletionResults.success.push(relativePath);
      } catch (err) {
        // 如果檔案不存在 (ENOENT)，我們也視為成功，因為目標已經達成
        if (err.code !== 'ENOENT') {
          console.error(`刪除檔案失敗: ${absolutePath}`, err);
          deletionResults.failed.push({ path: relativePath, error: '刪除失敗' });
        } else {
            console.log(`檔案不存在，無需刪除: ${absolutePath}`);
            deletionResults.success.push(relativePath);
        }
      }
    }
    
    if (deletionResults.failed.length > 0) {
        return NextResponse.json({ 
            message: '部分檔案刪除失敗', 
            details: deletionResults 
        }, { status: 207 }); // 207 Multi-Status
    }

    return NextResponse.json({ success: true, message: '所有指定檔案已成功刪除', details: deletionResults });

  } catch (err) {
    console.error('[API ERROR: /api/delete-files]', err);
    return NextResponse.json({ error: '處理刪除請求時發生錯誤' }, { status: 500 });
  }
}