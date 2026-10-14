/**
 * SSRF 安全的對外 HTTP 抓取（僅限伺服器端）。
 *
 * 伺服器可連到 Kong(:8000)、PostgREST、本機服務與校內網段，因此任何「抓使用者給的網址」
 * 都必須走這支，而不是直接 fetch()：
 *   - 只允許 http/https 與 80/443 埠
 *   - DNS 解析後逐一檢查所有 IP（擋 loopback / 私有 / link-local / CGNAT / IPv4-mapped IPv6 …），
 *     並把「檢查過的 IP」直接交給 socket 連線，避免 DNS rebinding 的檢查後換 IP
 *   - 重新導向改為手動，每一跳都重新檢查
 *   - 逾時與回應大小上限
 */
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';

const blockList = new net.BlockList();
for (const [ip, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blockList.addSubnet(ip, prefix, 'ipv4');
for (const [ip, prefix] of [
    // 注意：不可加入 ::ffff:0:0/96 —— Node BlockList 會把所有 IPv4 當成 mapped 位址比對而全數命中；
    // IPv4-mapped / IPv4-compatible 位址改由 embeddedIPv4() 取出內嵌 IPv4 再檢查。
    ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64],
    ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) blockList.addSubnet(ip, prefix, 'ipv6');

const ALLOWED_PORTS = new Set(['', '80', '443']);

/** 將 IPv6 展開成 8 組 16-bit 數字（支援尾端內嵌 IPv4 寫法） */
function expandIPv6(addr) {
    let a = addr.toLowerCase().split('%')[0];
    const v4 = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) {
        const o = v4[1].split('.').map(Number);
        a = a.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
    }
    const [head, tail] = a.split('::');
    const h = head ? head.split(':') : [];
    const t = tail !== undefined && tail ? tail.split(':') : [];
    const fill = a.includes('::') ? Array(8 - h.length - t.length).fill('0') : [];
    return [...h, ...fill, ...t].map(x => parseInt(x || '0', 16));
}

/** ::ffff:a.b.c.d（mapped）或 ::a.b.c.d（compatible）→ 回傳內嵌 IPv4，否則 null */
function embeddedIPv4(addr) {
    const g = expandIPv6(addr);
    if (g.length !== 8 || g.slice(0, 5).some(x => x !== 0) || (g[5] !== 0xffff && g[5] !== 0)) return null;
    if (g[5] === 0 && g[6] === 0) return null; // :: 與 ::1 交給 BlockList
    return [g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff].join('.');
}

export function isPublicIp(address) {
    const family = net.isIP(address);
    if (!family) return false;
    if (family === 6) {
        const v4 = embeddedIPv4(address);
        if (v4) return isPublicIp(v4);
        return !blockList.check(address, 'ipv6');
    }
    return !blockList.check(address, 'ipv4');
}

/** 同步的字面檢查（不做 DNS），供快速拒絕；真正的防護在 safeFetch 連線時 */
export function isAllowedUrlSyntax(raw) {
    let u;
    try { u = new URL(String(raw)); } catch { return false; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (!ALLOWED_PORTS.has(u.port)) return false;
    const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (net.isIP(host) && !isPublicIp(host)) return false;
    return true;
}

export class UnsafeUrlError extends Error {
    constructor(message = '不允許的網址') { super(message); this.name = 'UnsafeUrlError'; }
}

/** 給 http.request 用的 lookup：解析後全部是公開 IP 才放行 */
function guardedLookup(hostname, options, callback) {
    if (typeof options === 'function') { callback = options; options = {}; }
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
        if (err) return callback(err);
        if (!addresses?.length || addresses.some(a => !isPublicIp(a.address))) {
            return callback(new UnsafeUrlError('目標位址不是公開網路'));
        }
        if (options?.all) return callback(null, addresses);
        return callback(null, addresses[0].address, addresses[0].family);
    });
}

function requestOnce(url, { headers, timeoutMs, maxBytes, signal }) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const host = u.hostname.replace(/^\[|\]$/g, '');
        if (net.isIP(host) && !isPublicIp(host)) return reject(new UnsafeUrlError('目標位址不是公開網路'));

        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request(u, {
            method: 'GET',
            headers: { 'Accept-Encoding': 'gzip, deflate, br', ...headers },
            lookup: guardedLookup,
            timeout: timeoutMs,
            signal,
        }, (res) => {
            const status = res.statusCode || 0;
            const resHeaders = res.headers;
            if (status >= 300 && status < 400 && resHeaders.location) {
                res.resume();
                return resolve({ status, headers: resHeaders, redirect: new URL(resHeaders.location, u).toString() });
            }

            const enc = String(resHeaders['content-encoding'] || '').toLowerCase();
            let stream = res;
            if (enc === 'gzip' || enc === 'x-gzip') stream = res.pipe(zlib.createGunzip());
            else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
            else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());

            const chunks = [];
            let size = 0;
            let truncated = false;
            stream.on('data', (chunk) => {
                if (truncated) return;
                size += chunk.length;
                if (size > maxBytes) {
                    chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
                    truncated = true;
                    req.destroy();
                    finish();
                    return;
                }
                chunks.push(chunk);
            });
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve({ status, headers: resHeaders, body: Buffer.concat(chunks), truncated });
            };
            stream.on('end', finish);
            stream.on('error', (e) => (truncated ? finish() : reject(e)));
        });
        req.on('timeout', () => req.destroy(new Error('請求逾時')));
        req.on('error', (e) => reject(e));
        req.end();
    });
}

/**
 * @returns {Promise<{ ok:boolean, status:number, url:string, headers:object, contentType:string, body:Buffer, truncated:boolean, text:(enc?:string)=>string }>}
 * @throws {UnsafeUrlError} 網址或其任一重新導向指向非公開網路
 */
export async function safeFetch(rawUrl, { headers = {}, timeoutMs = 8000, maxBytes = 2 * 1024 * 1024, maxRedirects = 5 } = {}) {
    let url = String(rawUrl || '').trim();
    const controller = new AbortController();
    const overall = setTimeout(() => controller.abort(), timeoutMs);
    try {
        for (let hop = 0; hop <= maxRedirects; hop++) {
            if (!isAllowedUrlSyntax(url)) throw new UnsafeUrlError();
            const res = await requestOnce(url, { headers, timeoutMs, maxBytes, signal: controller.signal });
            if (res.redirect) { url = res.redirect; continue; }
            const contentType = String(res.headers['content-type'] || '');
            return {
                ok: res.status >= 200 && res.status < 300,
                status: res.status,
                url,
                headers: res.headers,
                contentType,
                body: res.body,
                truncated: res.truncated,
                text(encoding) {
                    const cs = (encoding || contentType.match(/charset=([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
                    try { return new TextDecoder(cs).decode(res.body); } catch { return res.body.toString('utf8'); }
                },
            };
        }
        throw new Error('重新導向次數過多');
    } finally {
        clearTimeout(overall);
    }
}
