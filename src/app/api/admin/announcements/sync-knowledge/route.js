import { NextResponse } from 'next/server';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { syncAnnouncementKnowledge, reconcileKnowledge } from '@/lib/ai/knowledge';

/**
 * POST /api/admin/announcements/sync-knowledge
 *
 * Body:
 *   { id: '<uuid>' }  → 單筆同步（公告建立 / 更新 / 上下架後呼叫）
 *   { all: true }     → 全量校正（upsert 上架公告、移除已刪除/下架的條目）
 */
export async function POST(req) {
    const authResult = await verifyUserAuth(req, { requireAdmin: true, endpoint: 'sync-knowledge' });
    if (!authResult.success) return authResult.error;

    try {
        const { id, all, force } = await req.json();

        if (all === true) {
            // 增量同步：知識條目比公告新者跳過；force=true 才全量重建
            const result = await reconcileKnowledge({ force: force === true });
            if (!result.success) {
                return NextResponse.json({ error: result.error || '知識庫校正失敗' }, { status: 500 });
            }
            const attempted = result.totalActive - (result.skipped || 0);
            if (attempted > 0 && result.upserted === 0) {
                return NextResponse.json({
                    error: `同步失敗：${attempted} 筆公告全部寫入失敗，請確認資料庫 migration 已套用（詳見伺服器日誌）`,
                }, { status: 500 });
            }
            const skippedNote = result.skipped > 0 ? `、略過 ${result.skipped} 筆未變更` : '';
            if (result.upserted < attempted) {
                logSuccessAction('AI_KNOWLEDGE_RECONCILE_PARTIAL', 'sync-knowledge', result);
                return NextResponse.json({
                    success: true,
                    message: `部分完成：${result.upserted}/${attempted} 筆成功${skippedNote}、移除 ${result.removed} 筆，失敗項請見伺服器日誌`,
                    ...result,
                });
            }
            logSuccessAction('AI_KNOWLEDGE_RECONCILE', 'sync-knowledge', result);
            return NextResponse.json({
                success: true,
                message: `知識庫校正完成：更新 ${result.upserted} 筆${skippedNote}、移除 ${result.removed} 筆`,
                ...result,
            });
        }

        if (!id) {
            return NextResponse.json({ error: '未提供公告 ID' }, { status: 400 });
        }

        const result = await syncAnnouncementKnowledge(id);
        if (!result.success) {
            return NextResponse.json({ error: result.error || '知識庫同步失敗' }, { status: 500 });
        }
        logSuccessAction('AI_KNOWLEDGE_SYNC', 'sync-knowledge', { id, action: result.action });
        return NextResponse.json({ success: true, action: result.action });

    } catch (error) {
        return handleApiError(error, 'sync-knowledge');
    }
}

/**
 * GET /api/admin/announcements/sync-knowledge?id=<uuid>
 * 檢視單筆公告目前存於知識庫的 AI 易讀內容（純文字/Markdown）。
 */
export async function GET(req) {
    const authResult = await verifyUserAuth(req, { requireAdmin: true, endpoint: 'sync-knowledge' });
    if (!authResult.success) return authResult.error;

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: '未提供公告 ID' }, { status: 400 });

        const { supabaseServer } = await import('@/lib/supabase/server');
        const { data, error } = await supabaseServer
            .from('ai_knowledge')
            .select('title, content, metadata, updated_at')
            .eq('announcement_id', id)
            .maybeSingle();

        if (error) throw error;
        return NextResponse.json({ success: true, knowledge: data || null });
    } catch (error) {
        return handleApiError(error, 'sync-knowledge');
    }
}
