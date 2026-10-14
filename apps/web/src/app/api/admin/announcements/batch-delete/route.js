import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import fs from 'fs/promises';
import path from 'path';

const ATTACHMENTS_DIR = path.resolve(process.cwd(), 'public', 'storage', 'attachments');

export async function POST(req) {
  const authResult = await verifyUserAuth(req, { requireAdmin: true, endpoint: 'batch_delete' });
  if (!authResult.success) return authResult.error;

  try {
    const { ids } = await req.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: '未提供 ID列表' }, { status: 400 });
    }

    // 1. Get attachments
    const { data: attachments, error: attError } = await supabaseServer
        .from('attachments')
        .select('stored_file_path')
        .in('announcement_id', ids);

    // 2. 附件實體檔存在本機 public/storage/attachments（不是 Supabase Storage），於 DB 刪除後清除（見步驟 4）
    const filePaths = !attError ? [...new Set((attachments || []).map(a => a.stored_file_path).filter(Boolean))] : [];

    // 3. Delete DB records (Manual Cascade)
    //    ai_knowledge 由外鍵 ON DELETE CASCADE 自動移除，這裡再明確清一次以保險
    await supabaseServer.from('ai_knowledge').delete().in('announcement_id', ids);
    await supabaseServer.from('attachments').delete().in('announcement_id', ids);
    await supabaseServer.from('announcement_views').delete().in('announcement_id', ids);
    
    const { error: delError } = await supabaseServer
        .from('announcements')
        .delete()
        .in('id', ids);

    if (delError) throw delError;

    // 4. 刪除不再被任何公告引用的實體檔（否則刪除公告後附件仍可公開下載）
    if (filePaths.length > 0) {
        const { data: stillUsed } = await supabaseServer
            .from('attachments').select('stored_file_path').in('stored_file_path', filePaths);
        const keep = new Set((stillUsed || []).map(r => r.stored_file_path));
        await Promise.all(filePaths.filter(p => !keep.has(p)).map(async (p) => {
            const abs = path.resolve(process.cwd(), 'public', String(p).replace(/^\/+/, ''));
            if (!abs.startsWith(ATTACHMENTS_DIR + path.sep)) return;
            await fs.unlink(abs).catch(err => { if (err.code !== 'ENOENT') console.error('[batch_delete] unlink failed:', abs, err.message); });
        }));
    }

    logSuccessAction('BATCH_DELETE', 'batch_delete', { count: ids.length, ids });

    return NextResponse.json({ message: `成功刪除 ${ids.length} 筆公告` });

  } catch (error) {
    return handleApiError(error, 'batch_delete');
  }
}
