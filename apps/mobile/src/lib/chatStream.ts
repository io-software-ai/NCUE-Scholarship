// @ts-ignore - expo/fetch is provided by Expo environment
import { fetch as expoFetch } from 'expo/fetch';
import { aiKeyHeaders } from './geminiKey';

export interface ChatHandlers {
  onText?: (text: string) => void;
  onThought?: (thought: string) => void;
  onTool?: (event: any) => void;
  onError?: (error: any) => void;
}

export async function streamChat(
  apiBase: string,
  body: object,
  token: string,
  handlers: ChatHandlers,
  /** 可中止串流（使用者按「停止生成」） */
  signal?: AbortSignal,
) {
  try {
    const res = await (expoFetch || fetch)(`${apiBase}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        // 校外使用者選擇「僅存本機」時，金鑰由此附帶（伺服器只在本次請求中使用）
        ...(await aiKeyHeaders()),
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      // 伺服器的說明（例如金鑰失效、額度用盡）要能傳到畫面上，不要吞成狀態碼
      const raw = await res.text().catch(() => '');
      let detail = '';
      try {
        detail = JSON.parse(raw)?.error || '';
      } catch {
        /* 非 JSON 回應 */
      }
      throw new Error(detail || `Chat API error: ${res.status}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      if (signal?.aborted) {
        reader.cancel().catch(() => {});
        break;
      }
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;

        const i = line.indexOf(':');
        if (i === -1) continue;

        const p = line.slice(0, i);
        const dataStr = line.slice(i + 1);

        try {
          const data = JSON.parse(dataStr);
          if (p === '0') handlers.onText?.(data);
          else if (p === '8') handlers.onThought?.(data);
          else if (p === '9') handlers.onTool?.(data);
        } catch (e) {
          console.warn('Failed to parse chat stream line:', line);
        }
      }
    }
  } catch (error: any) {
    // 使用者主動中止不算錯誤，不要顯示錯誤訊息
    if (error?.name === 'AbortError' || signal?.aborted) return;
    console.error('Stream Chat Error:', error);
    handlers.onError?.(error);
  }
}
