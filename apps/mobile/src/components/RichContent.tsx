/**
 * 原生 HTML 內文渲染器（純 JS，無需重 build）。
 * 正確呈現：表格、清單（用圓點/序號 icon，非 emoji）、標題、粗體/斜體、連結、
 * 換行、分隔線、圖片，並解碼 HTML 實體（&nbsp; 等）。
 * 來源為 TinyMCE 產生的公告 HTML。
 */
import React, { useState } from 'react';
import { View, Image, ScrollView, Linking } from 'react-native';
import { Text } from 'react-native-paper';
import { parse } from 'node-html-parser';
import { useAppTheme, type AppTheme } from '../theme';
import { usePagerLock } from '../lib/pagerLock';

const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", hellip: '…',
  middot: '·', ndash: '–', mdash: '—', times: '×', deg: '°', copy: '©', reg: '®',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', trade: '™',
};
function decode(s: string): string {
  if (!s) return '';
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isNaN(code) ? m : String.fromCodePoint(code);
    }
    return NAMED[e] ?? m;
  });
}

const INLINE = new Set(['strong', 'b', 'em', 'i', 'u', 'a', 'span', 'code', 'sub', 'sup', 'br', 'mark', 'small', 'font', 'abbr']);
const isEl = (n: any) => n?.nodeType === 1;
const isText = (n: any) => n?.nodeType === 3;
const tagOf = (n: any) => (n?.rawTagName || '').toLowerCase();

/** 解析 inline style 的顏色標記（TinyMCE 的 color / background-color），對齊網頁版標色。 */
function parseColorStyle(node: any): { color?: string; backgroundColor?: string } {
  const raw = typeof node?.getAttribute === 'function' ? node.getAttribute('style') : null;
  const out: { color?: string; backgroundColor?: string } = {};
  if (raw) {
    for (const decl of String(raw).split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const key = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim();
      if (!val) continue;
      if (key === 'color') out.color = val;
      else if (key === 'background-color' || key === 'background') out.backgroundColor = val;
    }
  }
  // <font color="..."> 舊語法
  const fontColor = typeof node?.getAttribute === 'function' ? node.getAttribute('color') : null;
  if (fontColor && !out.color) out.color = fontColor;
  return out;
}

/* ── 顏色標記的明暗適配 ──────────────────────────
 * TinyMCE 的顏色是針對網頁「淺色」背景挑的；直接套到 App 深色模式會不可讀
 * （如深藍字落在深色面板 → 隱形）。因此：淺色照用；深色下若與底色對比不足，
 * 保留色相往白色提亮；套了底色一定配上可讀的文字色。 */
function parseCssRgb(s?: string): { r: number; g: number; b: number } | null {
  if (!s) return null;
  const str = s.trim().toLowerCase();
  if (str[0] === '#') {
    let h = str.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  const m = str.match(/^rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length >= 3 && !Number.isNaN(p[0]) && !Number.isNaN(p[1]) && !Number.isNaN(p[2])) {
      const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
      return { r: c(p[0]), g: c(p[1]), b: c(p[2]) };
    }
  }
  return null;
}
const chan = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const relLum = (rgb: { r: number; g: number; b: number }) => 0.2126 * chan(rgb.r) + 0.7152 * chan(rgb.g) + 0.0722 * chan(rgb.b);
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const toHex = (rgb: { r: number; g: number; b: number }) =>
  '#' + [rgb.r, rgb.g, rgb.b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
const mixWhite = (rgb: { r: number; g: number; b: number }, t: number) => ({
  r: rgb.r + (255 - rgb.r) * t,
  g: rgb.g + (255 - rgb.g) * t,
  b: rgb.b + (255 - rgb.b) * t,
});

function resolveColors(parsed: { color?: string; backgroundColor?: string }, theme: AppTheme): { color?: string; backgroundColor?: string } {
  const dark = theme.dark;
  const surfLum = relLum(parseCssRgb(dark ? '#171E26' : '#FFFFFF')!);
  const bgRgb = parsed.backgroundColor ? parseCssRgb(parsed.backgroundColor) : null;
  if (bgRgb) {
    const bgLum = relLum(bgRgb);
    let text: string | undefined;
    if (parsed.color) {
      const cRgb = parseCssRgb(parsed.color);
      if (cRgb && contrast(relLum(cRgb), bgLum) >= 3) text = parsed.color;
    }
    if (!text) text = bgLum > 0.4 ? '#1C2B3A' : '#F2F5F8'; // 底色上一定給可讀文字色
    return { backgroundColor: parsed.backgroundColor, color: text };
  }
  if (parsed.color) {
    const cRgb = parseCssRgb(parsed.color);
    if (!cRgb) return {}; // 無法解析 → 沿用主題文字色
    if (!dark) return { color: parsed.color }; // 淺色模式：網頁色照用
    if (contrast(relLum(cRgb), surfLum) >= 3) return { color: parsed.color }; // 深色下對比足夠
    return { color: toHex(mixWhite(cRgb, 0.6)) }; // 太暗 → 保留色相提亮到可讀
  }
  return {};
}

type Ctx = { theme: AppTheme; k: string; depth?: number };

/* ── 清單層級樣式：各階層用不同項目符號，階層一眼分得出 ──
 * 無序：① 實心圓點 → ② 空心圈 → ③ 短橫線 → ④ 實心方塊
 * 有序：① 1. → ② a. → ③ i. （並逐層縮小、降低彩度） */
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii'];
function orderedLabel(index: number, depth: number): string {
  if (depth <= 0) return `${index + 1}.`;
  if (depth === 1) return `${String.fromCharCode(97 + (index % 26))}.`;
  return `${ROMAN[index] ?? index + 1}.`;
}

function inlineStyle(tag: string, theme: AppTheme) {
  switch (tag) {
    case 'strong':
    case 'b':
      return { fontWeight: '700' as const };
    case 'em':
    case 'i':
      return { fontStyle: 'italic' as const };
    case 'u':
      return { textDecorationLine: 'underline' as const };
    case 'code':
      return { fontFamily: 'monospace' as const, color: theme.tokens.primary };
    case 'small':
      return { fontSize: 13 };
    default:
      return {};
  }
}

/** 把一段行內節點（text / strong / a …）渲染成可放進 <Text> 的內容 */
function renderInline(node: any, ctx: Ctx): React.ReactNode {
  if (isText(node)) return decode(node.rawText);
  if (!isEl(node)) return null;
  const tag = tagOf(node);
  if (tag === 'br') return '\n';
  const children = node.childNodes.map((c: any, i: number) => renderInline(c, { ...ctx, k: `${ctx.k}.${i}` }));
  const color = resolveColors(parseColorStyle(node), ctx.theme); // 顏色標記（明暗適配後）
  if (tag === 'a') {
    const href = node.getAttribute('href');
    return (
      <Text
        key={ctx.k}
        style={[{ color: ctx.theme.colors.primary, textDecorationLine: 'underline' }, color]}
        onPress={href ? () => Linking.openURL(href).catch(() => {}) : undefined}
      >
        {children}
      </Text>
    );
  }
  if (tag === 'mark') {
    // 螢光標記：沿用 HTML 指定的底色，否則用預設高亮（深淺色皆用深字保證可讀）
    return (
      <Text key={ctx.k} style={{ backgroundColor: color.backgroundColor || '#FDE68A', color: color.color || '#1C2B3A' }}>
        {children}
      </Text>
    );
  }
  return (
    <Text key={ctx.k} style={[inlineStyle(tag, ctx.theme), color]}>
      {children}
    </Text>
  );
}

/** 走訪容器子節點：連續行內併成一個 <Text>，區塊各自渲染 */
function renderContainer(node: any, ctx: Ctx, base?: any): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let run: React.ReactNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const hasText = run.some((r) => (typeof r === 'string' ? r.trim() : true));
    if (hasText) {
      out.push(
        <Text key={`${ctx.k}.t${out.length}`} style={[{ color: ctx.theme.colors.onSurface, fontSize: 15, lineHeight: 24 }, base]}>
          {run}
        </Text>,
      );
    }
    run = [];
  };
  node.childNodes.forEach((child: any, i: number) => {
    const cctx = { ...ctx, k: `${ctx.k}.${i}` };
    if (isText(child)) {
      run.push(decode(child.rawText));
    } else if (isEl(child)) {
      const tag = tagOf(child);
      if (INLINE.has(tag)) run.push(renderInline(child, cctx));
      else {
        flush();
        out.push(renderBlock(child, cctx));
      }
    }
  });
  flush();
  return out;
}

/* ── 表格欄寬估算 ──────────────────────────────
 * 固定欄寬會讓內容少的表格擠成一直換行的窄柱；改成依「各欄最長內容」估寬：
 * 總寬放得下就撐滿容器（盡量寬、少換行），放不下則維持自然寬度並可橫向捲動。 */
const CELL_PAD = 10;
const MIN_COL_W = 76;
const MAX_COL_W = 260;
const CJK_RE = /[\u1100-\u115F\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/** 以字元寬度估算一格文字的視覺長度（CJK 約全形、其餘半形） */
function textWidthOf(node: any): number {
  const raw = decode(String(node?.text ?? '')).replace(/\s+/g, ' ').trim();
  let w = 0;
  for (const ch of raw) w += CJK_RE.test(ch) ? 13.5 : 7.4;
  return w;
}

function Table({ node, ctx }: { node: any; ctx: Ctx }) {
  const { theme } = ctx;
  const setPagerScroll = usePagerLock();
  const [availW, setAvailW] = useState(0);

  const rows: any[] = node
    .querySelectorAll('tr')
    .filter((tr: any) => tr.childNodes.some((c: any) => isEl(c) && (tagOf(c) === 'td' || tagOf(c) === 'th')));
  if (rows.length === 0) return null;

  const cellsOf = (tr: any): any[] => tr.childNodes.filter((c: any) => isEl(c) && (tagOf(c) === 'td' || tagOf(c) === 'th'));
  const spanOf = (cell: any) => Math.max(1, parseInt(cell.getAttribute('colspan') || '1', 10) || 1);

  const colCount = Math.max(1, ...rows.map((tr) => cellsOf(tr).reduce((s, c) => s + spanOf(c), 0)));

  // 1) 各欄理想寬 = 該欄最長內容（跨欄格平均分攤），夾在 MIN/MAX 之間
  const ideal = new Array(colCount).fill(MIN_COL_W);
  for (const tr of rows) {
    let ci = 0;
    for (const cell of cellsOf(tr)) {
      const span = spanOf(cell);
      const per = textWidthOf(cell) / span + CELL_PAD * 2;
      for (let k = 0; k < span && ci + k < colCount; k++) {
        ideal[ci + k] = Math.max(ideal[ci + k], Math.min(MAX_COL_W, per));
      }
      ci += span;
    }
  }

  // 2) 放得下就等比放大撐滿容器；放不下就維持自然寬（可橫向捲動）
  const naturalW = ideal.reduce((a, b) => a + b, 0);
  const scale = availW > 0 && naturalW < availW ? availW / naturalW : 1;
  const colW = ideal.map((w) => w * scale);
  const tableW = colW.reduce((a, b) => a + b, 0);
  const scrollable = availW > 0 && tableW > availW + 1;

  // 欄位對齊：每格寬 = 所跨欄寬總和（禁 grow/shrink），內容再長只會換行增高 → 跨列直行必對齊
  const widthOfCell = (start: number, span: number) => {
    let w = 0;
    for (let k = 0; k < span && start + k < colCount; k++) w += colW[start + k];
    return w;
  };

  // 表格可橫向捲動時，觸控期間先關掉外層換頁分頁器，避免水平手勢被搶走
  const lock = scrollable ? () => setPagerScroll(false) : undefined;
  const unlock = scrollable ? () => setPagerScroll(true) : undefined;

  return (
    <View style={{ marginVertical: 10 }} onLayout={(e) => setAvailW(Math.round(e.nativeEvent.layout.width))}>
      <ScrollView
        horizontal
        scrollEnabled={scrollable}
        showsHorizontalScrollIndicator={scrollable}
        persistentScrollbar={scrollable}
        onTouchStart={lock}
        onTouchEnd={unlock}
        onTouchCancel={unlock}
        onMomentumScrollEnd={unlock}
      >
        <View style={{ width: tableW || undefined, borderWidth: 1, borderColor: theme.colors.outlineVariant, borderRadius: 12, overflow: 'hidden' }}>
          {rows.map((tr: any, ri: number) => {
            const cells = cellsOf(tr);
            const isHead = ri === 0 || cells.some((c) => tagOf(c) === 'th');
            let colCursor = 0;
            return (
              <View
                key={ri}
                style={{
                  flexDirection: 'row',
                  backgroundColor: isHead ? theme.colors.surfaceVariant : ri % 2 ? theme.colors.surface : theme.tokens.surfaceHover + '55',
                  borderTopWidth: ri === 0 ? 0 : 1,
                  borderTopColor: theme.colors.outlineVariant,
                }}
              >
                {cells.map((cell: any, ci: number) => {
                  const span = spanOf(cell);
                  const start = colCursor;
                  colCursor += span;
                  return (
                    <View
                      key={ci}
                      style={{
                        width: widthOfCell(start, span),
                        flexGrow: 0,
                        flexShrink: 0,
                        overflow: 'hidden',
                        padding: CELL_PAD,
                        borderLeftWidth: ci === 0 ? 0 : 1,
                        borderLeftColor: theme.colors.outlineVariant,
                      }}
                    >
                      {renderContainer(cell, { ...ctx, k: `${ctx.k}.${ri}.${ci}` }, {
                        fontSize: 13.5,
                        lineHeight: 20,
                        fontWeight: isHead ? '700' : '400',
                        color: isHead ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                      })}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function ListBlock({ node, ordered, ctx }: { node: any; ordered: boolean; ctx: Ctx }) {
  const { theme } = ctx;
  const depth = ctx.depth ?? 0;
  const items: any[] = node.childNodes.filter((c: any) => isEl(c) && tagOf(c) === 'li');
  // 逐層降低強調：第 1 層主色、之後轉為次要色
  const markerColor = depth === 0 ? theme.colors.primary : depth === 1 ? theme.colors.primary + 'B3' : theme.colors.onSurfaceVariant;

  const Marker = () => {
    if (depth === 0) return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: markerColor }} />;
    if (depth === 1) return <View style={{ width: 6.5, height: 6.5, borderRadius: 3.25, borderWidth: 1.5, borderColor: markerColor }} />;
    if (depth === 2) return <View style={{ width: 7, height: 1.8, borderRadius: 1, backgroundColor: markerColor }} />;
    return <View style={{ width: 5, height: 5, backgroundColor: markerColor }} />;
  };

  return (
    <View style={{ marginVertical: 6, gap: 6 }}>
      {items.map((li: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 22, alignItems: 'center', paddingTop: ordered ? 2 : 8 }}>
            {ordered ? (
              <Text style={{ color: markerColor, fontSize: depth === 0 ? 13 : 12.5, fontWeight: depth === 0 ? '800' : '700' }}>
                {orderedLabel(i, depth)}
              </Text>
            ) : (
              <Marker />
            )}
          </View>
          {/* 子層 depth+1：巢狀清單自動換成下一階的符號 */}
          <View style={{ flex: 1 }}>{renderContainer(li, { ...ctx, k: `${ctx.k}.li${i}`, depth: depth + 1 })}</View>
        </View>
      ))}
    </View>
  );
}

function renderBlock(node: any, ctx: Ctx): React.ReactNode {
  const { theme } = ctx;
  const tag = tagOf(node);
  switch (tag) {
    case 'table':
      return <Table key={ctx.k} node={node} ctx={ctx} />;
    case 'ul':
      return <ListBlock key={ctx.k} node={node} ordered={false} ctx={ctx} />;
    case 'ol':
      return <ListBlock key={ctx.k} node={node} ordered ctx={ctx} />;
    case 'hr':
      return <View key={ctx.k} style={{ height: 1, backgroundColor: theme.colors.outlineVariant, marginVertical: 14 }} />;
    case 'br':
      return null;
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const size = ({ h1: 22, h2: 20, h3: 18, h4: 16.5, h5: 15.5, h6: 15 } as Record<string, number>)[tag] ?? 17;
      return (
        <View key={ctx.k} style={{ marginTop: 16, marginBottom: 6 }}>
          <Text style={{ color: theme.colors.onSurface, fontSize: size, fontWeight: '800', lineHeight: size + 8 }}>
            {node.childNodes.map((c: any, i: number) => renderInline(c, { ...ctx, k: `${ctx.k}.${i}` }))}
          </Text>
        </View>
      );
    }
    case 'blockquote':
      return (
        <View
          key={ctx.k}
          style={{ borderLeftWidth: 3, borderLeftColor: theme.colors.primary, paddingLeft: 12, marginVertical: 8 }}
        >
          {renderContainer(node, ctx, { color: theme.colors.onSurfaceVariant, fontStyle: 'italic' })}
        </View>
      );
    case 'img': {
      const src = node.getAttribute('src');
      if (!src) return null;
      return (
        <Image
          key={ctx.k}
          source={{ uri: src }}
          resizeMode="contain"
          style={{ width: '100%', height: 200, marginVertical: 8, borderRadius: 10 }}
        />
      );
    }
    case 'li':
      // 落單的 li（非 ul/ol 內）當普通段落
      return (
        <View key={ctx.k} style={{ marginBottom: 8 }}>
          {renderContainer(node, ctx)}
        </View>
      );
    default: {
      // p / div / section / figure … 一般區塊（支援區塊層級的顏色標記，明暗適配後）
      const c = resolveColors(parseColorStyle(node), theme);
      const base = c.color || c.backgroundColor ? c : undefined;
      return (
        <View key={ctx.k} style={{ marginBottom: 10 }}>
          {renderContainer(node, ctx, base)}
        </View>
      );
    }
  }
}

export function RichContent({ html }: { html?: string | null }) {
  const theme = useAppTheme();
  if (!html || !html.trim()) {
    return <Text style={{ color: theme.colors.onSurfaceVariant }}>無詳細內容</Text>;
  }
  try {
    const root = parse(html, { blockTextElements: { script: false, style: false } });
    const nodes = renderContainer(root, { theme, k: 'r' });
    return <View>{nodes}</View>;
  } catch {
    // 解析失敗：退回純文字（仍解碼實體、去標籤）
    const plain = decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return <Text style={{ color: theme.colors.onSurface, fontSize: 15, lineHeight: 24 }}>{plain}</Text>;
  }
}
