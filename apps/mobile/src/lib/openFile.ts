/**
 * 以「裝置預設 App」開啟本機檔案（.ics 交給行事曆、.pdf 交給 PDF 閱讀器…）。
 *
 * - Android：把 file:// 轉成 content:// 後直接發 ACTION_VIEW intent（帶讀取授權旗標），
 *   系統會用預設 App 開啟，不會再跳「分享到…」選單。
 * - iOS：平台沒有「直接開預設 App」的 API，系統文件互動面板（＝expo-sharing）就是原生做法。
 *
 * 原生模組未 build 進來、或裝置上沒有可處理該類型的 App 時，會依序退回分享面板；
 * 全部失敗才回傳 false，由呼叫端決定最後的退路。
 */
import { Platform } from 'react-native';

/** 寫一份暫存檔到 cache 目錄，回傳 file:// URI（相容新舊 expo-file-system API） */
export async function writeCacheFile(name: string, contents: string): Promise<string> {
  try {
    const FS: any = await import('expo-file-system/legacy');
    const uri = `${FS.cacheDirectory}${name}`;
    await FS.writeAsStringAsync(uri, contents, { encoding: 'utf8' });
    return uri;
  } catch {
    const FS: any = await import('expo-file-system');
    const file = new FS.File(FS.Paths.cache, name);
    try {
      file.delete();
    } catch {
      /* 檔案不存在可忽略 */
    }
    file.create();
    file.write(contents);
    return file.uri;
  }
}

/** 退路：系統分享／文件互動面板 */
async function shareFile(uri: string, mimeType: string, utiType?: string, dialogTitle?: string): Promise<boolean> {
  try {
    const Sharing: any = await import('expo-sharing');
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType, UTI: utiType, dialogTitle });
    return true;
  } catch {
    return false;
  }
}

export async function openWithDefaultApp({
  uri,
  mimeType,
  utiType,
  dialogTitle,
}: {
  uri: string;
  mimeType: string;
  /** iOS 用的 Uniform Type Identifier（如 com.adobe.pdf） */
  utiType?: string;
  dialogTitle?: string;
}): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const FS: any = await import('expo-file-system/legacy');
      const contentUri = await FS.getContentUriAsync(uri);
      const IntentLauncher: any = await import('expo-intent-launcher');
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        // FLAG_GRANT_READ_URI_PERMISSION：沒有這個旗標，接收端讀不到 content:// 檔案
        flags: 1,
        type: mimeType,
      });
      return true;
    } catch {
      // 沒有可處理此類型的 App，或模組尚未 build 進來 → 退回分享面板
      return shareFile(uri, mimeType, utiType, dialogTitle);
    }
  }

  return shareFile(uri, mimeType, utiType, dialogTitle);
}
