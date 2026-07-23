import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/faqs — 公開端點：啟用中的 FAQ，依 display_order 排序
 * （資料表尚未建立或為空時回傳空陣列，前台以內建預設內容後備）
 */
export async function GET() {
    try {
        const { data, error } = await supabaseServer
            .from('faqs')
            .select('id, question, answer, display_order')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true });

        if (error) {
            console.warn('[faqs] fetch failed (table may not exist yet):', error.message);
            return NextResponse.json({ success: true, faqs: [] });
        }
        return NextResponse.json({ success: true, faqs: data || [] });
    } catch (error) {
        return NextResponse.json({ success: true, faqs: [] });
    }
}
