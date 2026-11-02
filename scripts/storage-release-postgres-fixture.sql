\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000010'::uuid $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.organizations(id uuid PRIMARY KEY);
CREATE FUNCTION public.get_user_organization_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION public.has_permission(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','cancelled','expired');
CREATE TYPE public.feature_value_type AS ENUM ('boolean','limit');
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (char_length(key) BETWEEN 2 AND 64),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  -- Internal/migration plans must never appear in public selectors.
  is_internal BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (char_length(key) BETWEEN 2 AND 120),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description TEXT,
  feature_type public.feature_value_type NOT NULL DEFAULT 'boolean',
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  default_limit NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- When true, feature may be used with increment_feature_usage / try_consume_feature_usage.
  usage_metered BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  limit_value NUMERIC,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_id)
);
CREATE TABLE public.organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.organization_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled BOOLEAN,
  limit_value NUMERIC,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (char_length(key) BETWEEN 2 AND 64),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_public BOOLEAN NOT NULL DEFAULT true,
  display_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.addon_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  limit_value NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (addon_id, feature_id)
);
CREATE TABLE public.organization_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES public.addons(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  reason TEXT,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated,service_role;
GRANT ALL ON storage.objects TO authenticated,service_role;
INSERT INTO public.organizations VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
\ir ../supabase/ops/storage-production-bootstrap.sql
\ir ../supabase/migrations/20261102151820_organization_storage_release_readiness.sql
INSERT INTO public.features(key,name,feature_type,default_enabled,default_limit) VALUES ('storage.max_mb','Storage','limit',true,0);
INSERT INTO public.plans(key,name) VALUES ('basic','Basic'),('pro','Pro'),('internal','Internal');
INSERT INTO public.plan_features(plan_id,feature_id,enabled,limit_value) SELECT p.id,f.id,true,CASE p.key WHEN 'basic' THEN 1024 WHEN 'pro' THEN 10240 ELSE null END FROM public.plans p CROSS JOIN public.features f;
INSERT INTO public.organization_subscriptions(organization_id,plan_id,status) SELECT o.id,p.id,'active' FROM public.organizations o CROSS JOIN public.plans p WHERE p.key='basic';
UPDATE storage_control.write_enforcement SET sync_entitlements=true,enabled=true;
SELECT storage_control.refresh_quota(id) FROM public.organizations;
DO $$ BEGIN
 IF (SELECT quota_bytes FROM public.organization_storage_quotas LIMIT 1) <> 1073741824 THEN RAISE EXCEPTION 'basic quota wrong'; END IF;
END $$;
UPDATE public.organization_subscriptions SET plan_id=(SELECT id FROM public.plans WHERE key='pro');
SELECT storage_control.refresh_quota(id) FROM public.organizations;
DO $$ BEGIN
 IF (SELECT quota_bytes FROM public.organization_storage_quotas LIMIT 1) <> 10737418240 THEN RAISE EXCEPTION 'upgraded quota wrong'; END IF;
END $$;
UPDATE public.organization_subscriptions SET status='expired';
SELECT storage_control.refresh_quota(id) FROM public.organizations;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.organization_storage_quotas WHERE quota_bytes<>0) THEN RAISE EXCEPTION 'expired quota wrong'; END IF;
END $$;
INSERT INTO public.organization_feature_overrides(organization_id,feature_id,enabled,limit_value) SELECT o.id,f.id,true,100.0/1048576 FROM public.organizations o CROSS JOIN public.features f;
SELECT storage_control.refresh_quota(id) FROM public.organizations;
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.organization_storage_quotas WHERE quota_bytes<>100) THEN RAISE EXCEPTION 'override quota wrong'; END IF;
END $$;

