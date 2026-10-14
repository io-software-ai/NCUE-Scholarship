/**
 * 只接受站內相對路徑作為登入後的跳轉目標，防止 ?redirect=https://evil.com 或 //evil.com 的開放式重新導向。
 */
export function safeRedirectPath(value, fallback = '/profile') {
    if (typeof value !== 'string') return fallback;
    const v = value.trim();
    if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || /[\u0000-\u001f\\]/.test(v)) return fallback;
    return v;
}
