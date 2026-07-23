-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ai_knowledge (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  announcement_id uuid NOT NULL UNIQUE,
  title character varying NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  embedding USER-DEFINED,
  CONSTRAINT ai_knowledge_pkey PRIMARY KEY (id),
  CONSTRAINT ai_knowledge_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id)
);
CREATE TABLE public.ai_knowledge_gaps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  topic_key text NOT NULL UNIQUE,
  representative_question text,
  sample_questions jsonb DEFAULT '[]'::jsonb,
  frequency integer NOT NULL DEFAULT 1,
  rationale text,
  suggested_question text,
  suggested_answer jsonb,
  status character varying NOT NULL DEFAULT 'pending'::character varying CHECK (status::text = ANY (ARRAY['pending'::character varying, 'drafted'::character varying, 'dismissed'::character varying, 'published'::character varying]::text[])),
  created_faq_id uuid,
  last_evaluated_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_knowledge_gaps_pkey PRIMARY KEY (id),
  CONSTRAINT ai_knowledge_gaps_created_faq_id_fkey FOREIGN KEY (created_faq_id) REFERENCES public.faqs(id)
);
CREATE TABLE public.ai_message_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id uuid,
  message_key text NOT NULL,
  question text,
  answer text,
  rating character varying NOT NULL CHECK (rating::text = ANY (ARRAY['up'::character varying, 'down'::character varying]::text[])),
  channel character varying DEFAULT 'web'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_message_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT ai_message_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.announcement_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  announcement_id uuid NOT NULL,
  days_before integer NOT NULL DEFAULT 3 CHECK (days_before >= 1 AND days_before <= 14),
  notified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT announcement_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT announcement_subscriptions_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id),
  CONSTRAINT announcement_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.announcement_views (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  announcement_id uuid NOT NULL,
  ip_address inet NOT NULL,
  viewed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT announcement_views_pkey PRIMARY KEY (id),
  CONSTRAINT announcement_views_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id)
);
CREATE TABLE public.announcements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title character varying NOT NULL,
  summary text,
  category character varying,
  application_start_date date,
  application_end_date date,
  target_audience text,
  application_limitations character varying,
  submission_method character varying,
  external_urls text,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  view_count integer NOT NULL DEFAULT 0,
  internal_id character varying,
  CONSTRAINT announcements_pkey PRIMARY KEY (id)
);
CREATE TABLE public.attachments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  announcement_id uuid,
  file_name character varying NOT NULL,
  stored_file_path character varying NOT NULL,
  uploaded_at timestamp with time zone DEFAULT now(),
  file_size integer,
  mime_type character varying,
  display_order integer DEFAULT 0,
  CONSTRAINT attachments_pkey PRIMARY KEY (id),
  CONSTRAINT attachments_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id)
);
CREATE TABLE public.chat_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  session_id uuid DEFAULT uuid_generate_v4(),
  role character varying,
  message_content text,
  timestamp timestamp with time zone DEFAULT now(),
  is_read boolean DEFAULT false,
  CONSTRAINT chat_history_pkey PRIMARY KEY (id),
  CONSTRAINT chat_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.faqs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer jsonb NOT NULL DEFAULT '[]'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT faqs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.fcm_tokens (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  fcm_token text NOT NULL UNIQUE,
  device_type text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT fcm_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT fcm_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.line_bind_codes (
  code character varying NOT NULL,
  line_user_id text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT line_bind_codes_pkey PRIMARY KEY (code),
  CONSTRAINT line_bind_codes_line_user_id_fkey FOREIGN KEY (line_user_id) REFERENCES public.line_users(line_user_id)
);
CREATE TABLE public.line_messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  line_user_id text NOT NULL,
  role character varying NOT NULL CHECK (role::text = ANY (ARRAY['user'::character varying, 'ai'::character varying, 'admin'::character varying]::text[])),
  message_type character varying DEFAULT 'text'::character varying,
  content text,
  created_at timestamp with time zone DEFAULT now(),
  is_read boolean DEFAULT false,
  CONSTRAINT line_messages_pkey PRIMARY KEY (id),
  CONSTRAINT line_messages_line_user_id_fkey FOREIGN KEY (line_user_id) REFERENCES public.line_users(line_user_id)
);
CREATE TABLE public.line_users (
  line_user_id text NOT NULL,
  display_name text,
  picture_url text,
  status_message text,
  bound_user_id uuid,
  is_followed boolean DEFAULT true,
  followed_at timestamp with time zone DEFAULT now(),
  last_message_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  is_pinned boolean DEFAULT false,
  CONSTRAINT line_users_pkey PRIMARY KEY (line_user_id),
  CONSTRAINT line_users_bound_user_id_fkey FOREIGN KEY (bound_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.login_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  login_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  ip_address text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT login_history_pkey PRIMARY KEY (id),
  CONSTRAINT login_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  student_id text UNIQUE,
  username text,
  role text DEFAULT 'user'::text,
  created_at timestamp with time zone DEFAULT now(),
  avatar_url text,
  email text,
  has_agreed_to_terms boolean DEFAULT false,
  last_login_at timestamp with time zone,
  last_login_ip text,
  ai_background text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.school_email_codes (
  user_id uuid NOT NULL,
  email text NOT NULL,
  code character varying NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT school_email_codes_pkey PRIMARY KEY (user_id),
  CONSTRAINT school_email_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.system_settings (
  key text NOT NULL,
  value text,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  CONSTRAINT system_settings_pkey PRIMARY KEY (key),
  CONSTRAINT system_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id)
);