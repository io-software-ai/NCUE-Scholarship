import ManageClient from './ManageClient';
import { siteConfig } from '@/lib/siteConfig';

export const metadata = {
  title: '管理後台',
  description: `${siteConfig.name}管理後台，管理公告、使用者及系統設定。`,
  robots: {
    index: false,
    follow: false,
  },
};

export default function ManagePage() {
  return <ManageClient />;
}
