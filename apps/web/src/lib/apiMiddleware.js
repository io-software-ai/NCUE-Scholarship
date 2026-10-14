import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { rateLimit, logSecurityEvent, validateUserInput, sanitizeUserData } from '@/lib/security';

/**
 * API 安全中間件
 * 提供統一的身份驗證、授權和安全檢查
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 取出可信的用戶端 IP。
 *
 * nginx 設定 real_ip_header CF-Connecting-IP + set_real_ip_from（僅信任 Cloudflare 網段），
 * 並以 proxy_set_header X-Real-IP $remote_addr 傳給 Next —— 這是唯一由 nginx 覆寫、用戶端無法偽造的值。
 * cf-connecting-ip 與 x-forwarded-for 第一段都是原樣轉送的用戶端標頭（可直連 origin 時能偽造），不可採信。
 */
export function getClientIp(request) {
	const real = request.headers.get('x-real-ip');
	if (real) return real.trim();

	const xff = request.headers.get('x-forwarded-for');
	if (xff) {
		const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
		if (parts.length) return parts[parts.length - 1];
	}
	return 'unknown';
}

/**
 * 從 Bearer token 取出 sub（用戶 ID），僅用於速率限制分桶。
 *
 * 以 JWT_SECRET 在本機驗 HS256 簽章與到期時間（不需呼叫 Supabase Auth）；
 * 驗不過就視為未登入、改用 IP 計次 —— 避免偽造 token 換桶繞過額度，或冒用他人 sub 把對方鎖住。
 */
function getTokenSubject(request) {
	const authHeader = request.headers.get('authorization');
	if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
	const secret = process.env.JWT_SECRET;
	if (!secret) return null;

	try {
		const [header, payload, signature] = authHeader.slice(7).split('.');
		if (!header || !payload || !signature) return null;
		const alg = JSON.parse(Buffer.from(header, 'base64url').toString()).alg;
		if (alg !== 'HS256') return null;
		const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
		const given = Buffer.from(signature, 'base64url');
		if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
		const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
		if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
		return typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
	} catch {
		return null;
	}
}

// 已登入者以「使用者」計次；IP 僅作為濫用防護的粗略上限，倍率放寬以免整個
// 校園 NAT 後面的人共用同一個額度。
const IP_LIMIT_MULTIPLIER = 25;

/**
 * 驗證用戶身份並檢查權限
 * @param {Request} request - HTTP 請求對象
 * @param {Object} options - 配置選項
 * @param {boolean} options.requireAuth - 是否需要登入驗證
 * @param {boolean} options.requireAdmin - 是否需要管理員權限
 * @param {string} options.endpoint - API 端點名稱（用於日誌）
 * @returns {Object} { success: boolean, error?: NextResponse, user?: Object, profile?: Object }
 */
export async function verifyUserAuth(request, options = {}) {
	const {
		requireAuth = true,
		requireAdmin = false,
		endpoint = 'unknown'
	} = options;

	try {
		const ip = getClientIp(request);

		// 如果不需要驗證，直接返回成功
		if (!requireAuth) {
			return { success: true };
		}

		// 1. 檢查是否有 Authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			logSecurityEvent('UNAUTHORIZED_ACCESS', { ip, endpoint, reason: 'no_auth_header' });
			return {
				success: false,
				error: NextResponse.json(
					{ error: '未授權：請先登入' },
					{ status: 401 }
				)
			};
		}

		const token = authHeader.replace('Bearer ', '');
		const supabase = supabaseServer;

		// 2. 驗證 JWT Token
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);

		if (authError || !user) {
			logSecurityEvent('INVALID_TOKEN', { ip, endpoint, error: authError?.message });
			return {
				success: false,
				error: NextResponse.json(
					{ error: '未授權：無效的驗證令牌' },
					{ status: 401 }
				)
			};
		}

		// 3. 獲取用戶資料
		const { data: userProfile, error: profileError } = await supabase
			.from('profiles')
			.select('id, student_id, username, role, created_at')
			.eq('id', user.id)
			.single();

		if (profileError || !userProfile) {
			logSecurityEvent('PROFILE_NOT_FOUND', { ip, endpoint, userId: user.id });
			return {
				success: false,
				error: NextResponse.json(
					{ error: '用戶資料不存在' },
					{ status: 404 }
				)
			};
		}

		// 4. 檢查管理員權限
		if (requireAdmin && userProfile.role !== 'admin' && userProfile.role !== 'super_admin') {
			logSecurityEvent('INSUFFICIENT_PERMISSIONS', {
				ip,
				endpoint,
				userId: user.id,
				role: userProfile.role
			});
			return {
				success: false,
				error: NextResponse.json(
					{ error: '權限不足：需要管理員權限' },
					{ status: 403 }
				)
			};
		}

		return {
			success: true,
			user,
			profile: userProfile
		};

	} catch (error) {
		console.error('Auth verification error:', error);
		logSecurityEvent('AUTH_ERROR', { endpoint, error: error.message });
		return {
			success: false,
			error: NextResponse.json(
				{ error: '驗證過程發生錯誤' },
				{ status: 500 }
			)
		};
	}
}

/**
 * API Rate Limiting 檢查
 * @param {Request} request - HTTP 請求對象
 * @param {string} endpoint - API 端點名稱
 * @param {number} limit - 限制次數
 * @param {number} windowMs - 時間窗口（毫秒）
 * @returns {Object} { success: boolean, error?: NextResponse }
 */
export function checkRateLimit(request, endpoint, limit = 60, windowMs = 60000) {
	const ip = getClientIp(request);
	const sub = getTokenSubject(request);

	// 主要額度：已登入者依使用者計次，未登入者才退回依 IP。
	// （原本一律用 IP，導致校園 NAT 後面所有人共用同一個額度而互相排擠。）
	const primaryKey = sub ? `${endpoint}-u:${sub}` : `${endpoint}-ip:${ip}`;
	if (!rateLimit(primaryKey, limit, windowMs)) {
		logSecurityEvent('RATE_LIMIT_EXCEEDED', { ip, endpoint, limit, windowMs, scope: sub ? 'user' : 'ip' });
		return {
			success: false,
			error: NextResponse.json(
				{ error: '請求過於頻繁，請稍後再試' },
				{ status: 429 }
			)
		};
	}

	// 濫用防護：同一 IP 的總量上限。額度放得很寬，正常共用出口不會踩到，
	// 但可擋住偽造 token 換桶的洗請求手法。
	if (sub && !rateLimit(`${endpoint}-ip:${ip}`, limit * IP_LIMIT_MULTIPLIER, windowMs)) {
		logSecurityEvent('RATE_LIMIT_EXCEEDED', { ip, endpoint, limit: limit * IP_LIMIT_MULTIPLIER, windowMs, scope: 'ip-guard' });
		return {
			success: false,
			error: NextResponse.json(
				{ error: '請求過於頻繁，請稍後再試' },
				{ status: 429 }
			)
		};
	}

	return { success: true };
}

/**
 * 驗證和清理請求資料
 * @param {Object} data - 請求資料
 * @param {Array} requiredFields - 必填欄位
 * @param {Array} optionalFields - 可選欄位
 * @returns {Object} { success: boolean, error?: NextResponse, data?: Object }
 */
export function validateRequestData(data, requiredFields = [], optionalFields = []) {
	try {
		// 檢查必填欄位
		for (const field of requiredFields) {
			if (!data[field] && data[field] !== 0 && data[field] !== false) {
				return {
					success: false,
					error: NextResponse.json(
						{ error: `缺少必填欄位：${field}` },
						{ status: 400 }
					)
				};
			}
		}

		// 過濾允許的欄位
		const allowedFields = [...requiredFields, ...optionalFields];
		const filteredData = {};

		for (const field of allowedFields) {
			if (data[field] !== undefined) {
				filteredData[field] = data[field];
			}
		}

		// 驗證資料格式
		const validationErrors = validateUserInput(filteredData);
		if (validationErrors.length > 0) {
			return {
				success: false,
				error: NextResponse.json(
					{ error: validationErrors.join(', ') },
					{ status: 400 }
				)
			};
		}

		// 清理資料
		const sanitizedData = sanitizeUserData(filteredData);

		return {
			success: true,
			data: sanitizedData
		};

	} catch (error) {
		console.error('Data validation error:', error);
		return {
			success: false,
			error: NextResponse.json(
				{ error: '資料驗證失敗' },
				{ status: 400 }
			)
		};
	}
}

/**
 * 統一的錯誤處理
 * @param {Error} error - 錯誤對象
 * @param {string} endpoint - API 端點名稱
 * @returns {NextResponse} 錯誤回應
 */
export function handleApiError(error, endpoint) {
	console.error(`API Error in ${endpoint}:`, error);
	logSecurityEvent('API_ERROR', { endpoint, error: error.message });

	return NextResponse.json(
		{ error: '伺服器錯誤，請稍後再試' },
		{ status: 500 }
	);
}

/**
 * 記錄成功的 API 操作
 * @param {string} action - 操作類型
 * @param {string} endpoint - API 端點
 * @param {Object} details - 詳細資訊
 */
export function logSuccessAction(action, endpoint, details = {}) {
	logSecurityEvent('API_SUCCESS', {
		action,
		endpoint,
		timestamp: new Date().toISOString(),
		...details
	});
}
