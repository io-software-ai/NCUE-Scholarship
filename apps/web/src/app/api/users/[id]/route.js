import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { supabaseServer } from '@/lib/supabase/server';
import { verifyUserAuth, checkRateLimit, validateRequestData, handleApiError, logSuccessAction } from '@/lib/apiMiddleware';
import { renderAdminPromotionEmail } from '@/lib/emailTemplate';
import { siteConfig } from '@/lib/siteConfig';

export async function PUT(request, { params }) {
  const { id } = await params;
  const endpoint = `/api/users/${id}`;

  try {
    // 1. Rate limiting 檢查
    const rateLimitCheck = checkRateLimit(request, 'users-put', 10, 60000); // 每分鐘10次
    if (!rateLimitCheck.success) {
      return rateLimitCheck.error;
    }

    // 2. 用戶身份驗證（需要管理員權限）
    const authCheck = await verifyUserAuth(request, {
      requireAuth: true,
      requireAdmin: true,
      endpoint
    });
    
    if (!authCheck.success) {
      return authCheck.error;
    }

    // 3. 驗證請求資料
    const body = await request.json();
    const dataValidation = validateRequestData(
      body,
      [], // 沒有必填欄位
      ['role', 'username'] // 可選欄位
    );
    
    if (!dataValidation.success) {
      return dataValidation.error;
    }

    const { role, username } = dataValidation.data;

    // 4. 驗證 id 格式
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: '無效的用戶 ID' },
        { status: 400 }
      );
    }

    // 5. 防止管理員意外移除自己的管理員權限，或變更自己的資料 (應在 Profile 頁面變更)
    if (id === authCheck.user.id) {
        if (role && role !== 'admin') {
            return NextResponse.json({ error: '不能移除自己的管理員權限' }, { status: 400 });
        }
        // 如果只是想透過此 API 變更自己的 username，也可以允許，但通常管理員管理他人
    }

    // 6. 更新用戶資料
    const supabase = supabaseServer;

    // 記錄變更前角色（升級為管理員時需寄送通知信）
    const { data: beforeRow } = await supabase
        .from('profiles').select('role').eq('id', id).maybeSingle();
    const previousRole = beforeRow?.role || 'user';

    const updateData = {};
    if (role !== undefined) {
        if (!['user', 'admin'].includes(role)) {
            return NextResponse.json({ error: '無效的角色權限' }, { status: 400 });
        }
        updateData.role = role;
    }
    if (username !== undefined) {
      updateData.username = username;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '沒有提供要更新的資料' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select('id, student_id, username, role, created_at, avatar_url')
      .single();

    if (error) {
      console.error('Error updating user:', error);
      throw new Error('更新用戶資料失敗');
    }

    // 7. 獲取對應的電子信箱 (從 auth.admin)
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(id);
    const email = authUser?.user?.email || '';

    // 7.5 升級為管理員 → 寄送權限通知信（寄信失敗不影響權限變更結果）
    if (role === 'admin' && previousRole !== 'admin' && email) {
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT, 10),
                secure: process.env.SMTP_PORT === '465',
                auth: { user: process.env.SMTP_USERNAME, pass: process.env.SMTP_PASSWORD },
            });
            const { subject, html } = renderAdminPromotionEmail({ username: data.username });
            await transporter.sendMail({
                from: `"${process.env.SENDER_NAME || siteConfig.shortName}" <${process.env.SENDER_EMAIL}>`,
                to: email,
                subject,
                html,
            });
        } catch (mailErr) {
            console.warn('[users PUT] 管理員通知信寄送失敗:', mailErr.message);
        }
    }

    // 8. 格式化回傳資料
    const formattedUser = {
      id: data.id,
      studentId: data.student_id || '',
      name: data.username || '',
      email: email,
      role: data.role,
      createdAt: data.created_at,
      avatarUrl: data.avatar_url
    };

    // 記錄成功操作
    logSuccessAction('USER_UPDATED', endpoint, {
      adminId: authCheck.user.id,
      targetUserId: id,
      changes: updateData
    });

    return NextResponse.json({
      success: true,
      data: formattedUser,
      message: '使用者資料更新成功'
    });

  } catch (error) {
    return handleApiError(error, endpoint);
  }
}

export async function DELETE(request, { params }) {
    const { id } = await params;
    const endpoint = `/api/users/${id}`;

    try {
        const authCheck = await verifyUserAuth(request, {
            requireAuth: true,
            requireAdmin: true,
            endpoint
        });
        if (!authCheck.success) return authCheck.error;

        // 避免刪除自己
        if (authCheck.user.id === id) {
            return NextResponse.json({ error: '無法刪除目前的登入帳號' }, { status: 403 });
        }

        // 先解除／清理跨表關聯：資料庫多個外鍵缺 ON DELETE 規則
        // （login_history / profiles / system_settings.updated_by 直接參照 auth.users），
        // 不先清理的話 GoTrue 刪除 auth 使用者會被 FK 擋下而回 500。
        const cleanups = [
            ['line_users 解除綁定', supabaseServer.from('line_users').update({ bound_user_id: null }).eq('bound_user_id', id)],
            ['announcement_subscriptions', supabaseServer.from('announcement_subscriptions').delete().eq('user_id', id)],
            ['chat_history', supabaseServer.from('chat_history').delete().eq('user_id', id)],
            ['login_history', supabaseServer.from('login_history').delete().eq('user_id', id)],
            ['system_settings.updated_by 解除關聯', supabaseServer.from('system_settings').update({ updated_by: null }).eq('updated_by', id)],
            ['profiles', supabaseServer.from('profiles').delete().eq('id', id)],
        ];
        for (const [label, query] of cleanups) {
            const { error: cleanupErr } = await query;
            if (cleanupErr) console.warn(`[users DELETE] cleanup ${label} failed:`, cleanupErr.message);
        }

        const { error } = await supabaseServer.auth.admin.deleteUser(id);

        if (error) throw error;

        logSuccessAction('USER_DELETED', endpoint, { adminId: authCheck.user.id, targetUserId: id });

        return NextResponse.json({ success: true, message: '使用者已成功刪除' });

    } catch (err) {
        return handleApiError(err, endpoint);
    }
}
