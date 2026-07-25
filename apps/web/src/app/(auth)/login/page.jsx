import LoginClient from './LoginClient';
import { siteConfig } from '@/lib/siteConfig';

export const metadata = {
  title: '登入',
  description: `登入${siteConfig.name}，獲取最新的獎助學金資訊與 AI 助手服務。`,
};

export default function LoginPage() {
  return <LoginClient />;
}
