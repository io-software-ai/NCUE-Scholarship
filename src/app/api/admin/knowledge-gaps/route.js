import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { validateFaqBlocks, sanitizeFaqBlocks } from '@/lib/faqBlocks';
import { runQualityEvaluation, generateFaqDraft } from '@/lib/ai/qualityEval';

const ENDPOINT = '/api/admin/knowledge-gaps';

/** GET：知識缺口清單（預設隱藏已忽略） */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: ENDPOINT });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const includeDismissed = searchParams.get('all') === '1';

        let query = supabaseServer
            .from('ai_knowledge_gaps')
            .select('*')
            .order('status', { ascending: true })
            .order('frequency', { ascending: false })
            .order('updated_at', { ascending: false });
        if (!includeDismissed) query = query.neq('status', 'dismissed');

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json({ success: true, gaps: data || [] });
    } catch (error) {
        return handleApiError(error, ENDPOINT);
    }
}

/**
 * POST：管理員操作
 *  { action: 'evaluate' }            → 立即執行知識缺口評估
 *  { action: 'draft', id }           → 為某缺口產生 / 重新產生 FAQ 草稿
 *  { action: 'dismiss', id }         → 忽略缺口
 *  { action: 'restore', id }         → 還原被忽略的缺口
 *  { action: 'publish', id, question, answer } → 審核後發佈為正式 FAQ
 */
export async function POST(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: ENDPOINT });
        if (!authCheck.success) return authCheck.error;
        const adminId = authCheck.user.id;

        const body = await request.json();
        const { action, id } = body;

        if (action === 'evaluate') {
            const result = await runQualityEvaluation({ days: 30 });
            logSuccessAction('KNOWLEDGE_GAP_EVALUATE', ENDPOINT, { adminId, ...result });
            return NextResponse.json(result);
        }

        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        if (action === 'dismiss' || action === 'restore') {
            const status = action === 'dismiss' ? 'dismissed' : 'pending';
            const { data, error } = await supabaseServer
                .from('ai_knowledge_gaps')
                .update({ status, updated_at: new Date().toISOString() })
                .eq('id', id).select().single();
            if (error) throw error;
            return NextResponse.json({ success: true, gap: data });
        }

        if (action === 'draft') {
            const { data: gap, error: gErr } = await supabaseServer
                .from('ai_knowledge_gaps').select('*').eq('id', id).single();
            if (gErr) throw gErr;

            const draft = await generateFaqDraft(gap);
            if (!draft.success) return NextResponse.json({ error: draft.error }, { status: 422 });

            const { data, error } = await supabaseServer
                .from('ai_knowledge_gaps')
                .update({
                    suggested_question: draft.question,
                    suggested_answer: draft.answer,
                    status: gap.status === 'published' ? 'published' : 'drafted',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id).select().single();
            if (error) throw error;
            logSuccessAction('KNOWLEDGE_GAP_DRAFT', ENDPOINT, { adminId, id });
            return NextResponse.json({ success: true, gap: data });
        }

        if (action === 'publish') {
            const { question, answer } = body;
            if (!question?.trim()) return NextResponse.json({ error: '請填寫問題' }, { status: 400 });
            const blockError = validateFaqBlocks(answer);
            if (blockError) return NextResponse.json({ error: blockError }, { status: 400 });

            // 置於 FAQ 列表末端
            const { data: last } = await supabaseServer
                .from('faqs').select('display_order')
                .order('display_order', { ascending: false }).limit(1).maybeSingle();
            const nextOrder = (last?.display_order || 0) + 10;

            const { data: faq, error: faqErr } = await supabaseServer
                .from('faqs')
                .insert({
                    question: question.trim().slice(0, 300),
                    answer: sanitizeFaqBlocks(answer),
                    display_order: nextOrder,
                    is_active: true,
                })
                .select().single();
            if (faqErr) throw faqErr;

            const { data: gap, error: gapErr } = await supabaseServer
                .from('ai_knowledge_gaps')
                .update({ status: 'published', created_faq_id: faq.id, updated_at: new Date().toISOString() })
                .eq('id', id).select().single();
            if (gapErr) throw gapErr;

            logSuccessAction('KNOWLEDGE_GAP_PUBLISH', ENDPOINT, { adminId, id, faqId: faq.id });
            return NextResponse.json({ success: true, gap, faq });
        }

        return NextResponse.json({ error: '未知的操作' }, { status: 400 });
    } catch (error) {
        return handleApiError(error, ENDPOINT);
    }
}

/** DELETE：永久刪除缺口紀錄 */
export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: ENDPOINT });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        const { error } = await supabaseServer.from('ai_knowledge_gaps').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, ENDPOINT);
    }
}
