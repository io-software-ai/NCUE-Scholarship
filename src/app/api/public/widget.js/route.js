import { siteConfig } from '@/lib/siteConfig';

export const dynamic = 'force-dynamic';

/**
 * 嵌入式 Widget 載入器（純 JavaScript，第三方站台可直接引用）
 *
 * 用法（貼在任何網站）：
 *   <div id="ncue-scholarship-widget"></div>
 *   <script src="https://<站台>/api/public/widget.js" async
 *           data-limit="5" data-category="" data-title="最新獎助學金"></script>
 *
 * 特性：
 *  - 自 data-* 讀取設定；自 script src 推導 API 來源，跨網域可用（CORS 已開放）。
 *  - 全程 inline style，避免與宿主站台 CSS 互相汙染。
 *  - 支援 data-theme="dark"。
 */
export async function GET() {
    const fallbackBase = siteConfig.url;
    const js = `(function () {
  var s = document.currentScript;
  if (!s) { var all = document.getElementsByTagName('script'); s = all[all.length - 1]; }
  var base = '${fallbackBase}';
  try { base = new URL(s.src).origin; } catch (e) {}

  var limit = parseInt(s.getAttribute('data-limit'), 10) || 5;
  var category = s.getAttribute('data-category') || '';
  var title = s.getAttribute('data-title') || '最新獎助學金公告';
  var dark = (s.getAttribute('data-theme') || '').toLowerCase() === 'dark';
  var targetId = s.getAttribute('data-target') || 'ncue-scholarship-widget';

  var C = dark
    ? { bg: '#10151B', card: '#1A2129', line: '#2A333D', ink: '#E7ECF1', soft: '#9BA6B2', accent: '#4C9BE0' }
    : { bg: '#FFFFFF', card: '#FFFFFF', line: '#E6EAEF', ink: '#1C2B3A', soft: '#5B6B7B', accent: '#005A9C' };

  function el(tag, style, text) {
    var e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(container, items) {
    container.innerHTML = '';
    container.style.cssText = 'font-family:system-ui,-apple-system,\"Noto Sans TC\",sans-serif;max-width:520px;border:1px solid ' + C.line + ';border-radius:14px;overflow:hidden;background:' + C.bg + ';';

    var head = el('div', 'padding:14px 16px;border-bottom:1px solid ' + C.line + ';display:flex;align-items:center;gap:8px;');
    var dot = el('span', 'width:8px;height:8px;border-radius:50%;background:' + C.accent + ';display:inline-block;');
    var h = el('span', 'font-weight:700;font-size:15px;color:' + C.ink + ';', title);
    head.appendChild(dot); head.appendChild(h);
    container.appendChild(head);

    if (!items.length) {
      container.appendChild(el('div', 'padding:18px 16px;color:' + C.soft + ';font-size:14px;', '目前沒有公告'));
    }

    items.forEach(function (a) {
      var link = document.createElement('a');
      link.href = a.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.style.cssText = 'display:block;padding:12px 16px;border-bottom:1px solid ' + C.line + ';text-decoration:none;background:' + C.card + ';';
      link.onmouseover = function () { link.style.background = dark ? '#222b35' : '#F5F7FA'; };
      link.onmouseout = function () { link.style.background = C.card; };

      var t = el('div', 'font-size:14px;font-weight:600;color:' + C.ink + ';line-height:1.4;margin-bottom:4px;', a.title);
      link.appendChild(t);

      var meta = el('div', 'font-size:12px;color:' + C.soft + ';');
      var parts = [];
      if (a.category_name) parts.push(a.category_name);
      if (a.application_end_date) parts.push('截止 ' + a.application_end_date);
      meta.textContent = parts.join(' · ');
      link.appendChild(meta);
      container.appendChild(link);
    });

    var foot = document.createElement('a');
    foot.href = base; foot.target = '_blank'; foot.rel = 'noopener noreferrer';
    foot.style.cssText = 'display:block;padding:10px 16px;text-align:center;font-size:12px;font-weight:600;color:' + C.accent + ';text-decoration:none;';
    foot.textContent = '查看全部公告 →';
    container.appendChild(foot);
  }

  function mount() {
    var container = document.getElementById(targetId);
    if (!container) { container = el('div'); s.parentNode.insertBefore(container, s.nextSibling); }
    var qs = 'limit=' + limit + (category ? '&category=' + encodeURIComponent(category) : '');
    fetch(base + '/api/public/announcements?' + qs)
      .then(function (r) { return r.json(); })
      .then(function (d) { render(container, (d && d.data) || []); })
      .catch(function () { container.textContent = '無法載入獎助學金公告'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();`;

    return new Response(js, {
        headers: {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
    });
}
