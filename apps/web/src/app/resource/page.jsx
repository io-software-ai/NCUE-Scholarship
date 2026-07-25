import ResourcePageClient from './ResourcePageClient';
import { siteConfig } from '@/lib/siteConfig';

export const metadata = {
  title: '相關資源與常見問答',
  description: '彙整常用校外資源連結與獎助學金申請相關的常見問題，包含彰師大獎助學金專區、教育部圓夢助學網等資源。',
  openGraph: {
    title: `相關資源與常見問答 | ${siteConfig.name}`,
    description: '彙整常用校外資源連結與獎助學金申請相關的常見問題。',
  },
};

export default function ResourcePage() {
  return <ResourcePageClient />;
}
