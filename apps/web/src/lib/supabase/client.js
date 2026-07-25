import { createBrowserClient } from '@supabase/ssr';
import { createRetryFetch } from './retryFetch';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration:', {
    url: supabaseUrl,
    hasAnonKey: !!supabaseAnonKey
  });
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

// global.fetch 換成帶指數退避重試的版本，吸收 Cloudflare 前置偶發的 5xx
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createRetryFetch() },
});
