import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { DEFAULT_FAQS } from '@/lib/faqSeed';
import { validateFaqBlocks as validateBlocks, sanitizeFaqBlocks as sanitizeBlocks } from '@/lib/faqBlocks';

/** GET：全部 FAQ（含停用） */
export async function GET(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/faqs' });
        if (!authCheck.success) return authCheck.error;

        const { data, error } = await supabaseServer
            .from('faqs')
            .select('*')
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return NextResponse.json({ success: true, faqs: data || [] });
    } catch (error) {
        return handleApiError(error, '/api/admin/faqs');
    }
}

/** POST：新增 FAQ；或 { action: 'import-defaults' } 匯入內建預設內容 */
export async function POST(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/faqs' });
        if (!authCheck.success) return authCheck.error;

        const body = await request.json();

        if (body.action === 'import-defaults') {
            const { count } = await supabaseServer.from('faqs').select('id', { count: 'exact', head: true });
            if (count > 0) return NextResponse.json({ error: '資料庫已有 FAQ，不可重複匯入' }, { status: 400 });
            const rows = DEFAULT_FAQS.map((faq, i) => ({ question: faq.question, answer: faq.answer, display_order: (i + 1) * 10 }));
            const { error } = await supabaseServer.from('faqs').insert(rows);
            if (error) throw error;
            logSuccessAction('FAQ_IMPORT_DEFAULTS', '/api/admin/faqs', { adminId: authCheck.user.id, count: rows.length });
            return NextResponse.json({ success: true, imported: rows.length });
        }

        const { question, answer, displayOrder, isActive } = body;
        if (!question?.trim()) return NextResponse.json({ error: '請填寫問題' }, { status: 400 });
        const blockError = validateBlocks(answer);
        if (blockError) return NextResponse.json({ error: blockError }, { status: 400 });

        const { data, error } = await supabaseServer
            .from('faqs')
            .insert({
                question: question.trim().slice(0, 300),
                answer: sanitizeBlocks(answer),
                display_order: Number.isInteger(displayOrder) ? displayOrder : 0,
                is_active: isActive !== false,
            })
            .select()
            .single();
        if (error) throw error;

        logSuccessAction('FAQ_CREATE', '/api/admin/faqs', { adminId: authCheck.user.id, faqId: data.id });
        return NextResponse.json({ success: true, faq: data });
    } catch (error) {
        return handleApiError(error, '/api/admin/faqs');
    }
}

/** PUT：更新 FAQ（內容 / 排序 / 啟用狀態） */
export async function PUT(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/faqs' });
        if (!authCheck.success) return authCheck.error;

        const { id, question, answer, displayOrder, isActive } = await request.json();
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        const updates = { updated_at: new Date().toISOString() };
        if (question !== undefined) {
            if (!question.trim()) return NextResponse.json({ error: '請填寫問題' }, { status: 400 });
            updates.question = question.trim().slice(0, 300);
        }
        if (answer !== undefined) {
            const blockError = validateBlocks(answer);
            if (blockError) return NextResponse.json({ error: blockError }, { status: 400 });
            updates.answer = sanitizeBlocks(answer);
        }
        if (displayOrder !== undefined) updates.display_order = parseInt(displayOrder, 10) || 0;
        if (isActive !== undefined) updates.is_active = Boolean(isActive);

        const { data, error } = await supabaseServer
            .from('faqs').update(updates).eq('id', id).select().single();
        if (error) throw error;

        logSuccessAction('FAQ_UPDATE', '/api/admin/faqs', { adminId: authCheck.user.id, faqId: id });
        return NextResponse.json({ success: true, faq: data });
    } catch (error) {
        return handleApiError(error, '/api/admin/faqs');
    }
}

/** DELETE：刪除 FAQ */
export async function DELETE(request) {
    try {
        const authCheck = await verifyUserAuth(request, { requireAdmin: true, endpoint: '/api/admin/faqs' });
        if (!authCheck.success) return authCheck.error;

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        const { error } = await supabaseServer.from('faqs').delete().eq('id', id);
        if (error) throw error;

        logSuccessAction('FAQ_DELETE', '/api/admin/faqs', { adminId: authCheck.user.id, faqId: id });
        return NextResponse.json({ success: true });
    } catch (error) {
        return handleApiError(error, '/api/admin/faqs');
    }
}
