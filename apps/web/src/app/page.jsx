import { supabaseServer } from '@/lib/supabase/server';
import HomePageClient from '@/components/HomePageClient';
import JsonLd from '@/components/JsonLd';

export async function generateMetadata({ searchParams }) {
  const { announcement_id } = await searchParams;

  if (!announcement_id) {
    // 只有首頁宣告 canonical，避免 layout 繼承導致全站 canonical 指向首頁
    return { alternates: { canonical: '/' } };
  }

  const { data: announcement } = await supabaseServer
    .from('announcements')
    .select('title, summary')
    .eq('id', announcement_id)
    .single();

  if (!announcement) {
    return {};
  }

  const cleanSummary = announcement.summary
    ? announcement.summary.replace(/<[^>]+>/g, '').substring(0, 160) + '...'
    : '點擊查看公告詳情';

  return {
    title: `${announcement.title}`,
    description: cleanSummary,
    // 深連結（?announcement_id=）與獨立 SSR 頁為同一內容：canonical 指向可爬取的 SSR 頁，避免重複內容
    alternates: { canonical: `/announcement/${announcement_id}` },
    openGraph: {
      title: announcement.title,
      description: cleanSummary,
    },
  };
}

export default async function Home({ searchParams }) {
  const { announcement_id } = await searchParams;
  let announcement = null;

  if (announcement_id) {
    const { data } = await supabaseServer
      .from('announcements')
      .select('*')
      .eq('id', announcement_id)
      .single();
    announcement = data;
  }

  return (
    <>
      {announcement && <JsonLd data={announcement} />}
      <HomePageClient />
    </>
  );
}