import { supabaseServer } from '@/lib/supabase/server';
import { siteConfig } from '@/lib/siteConfig';

export default async function sitemap() {
  const baseUrl = siteConfig.url;

  // Static routes
  const staticRoutes = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/terms-and-privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/resource`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  try {
    // Dynamic routes (Announcements)
    // Fetch all active announcements
    const { data: announcements, error } = await supabaseServer
      .from('announcements')
      .select('id, updated_at')
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Sitemap fetch error:', error);
      return staticRoutes;
    }

    const dynamicRoutes = announcements.map((item) => ({
      url: `${baseUrl}/announcement/${item.id}`,
      lastModified: new Date(item.updated_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...dynamicRoutes];
  } catch (err) {
    console.error('Sitemap generation error:', err);
    return staticRoutes;
  }
}
