-- Professionals profile contact fields (staging MVP)
-- Safe additive columns; RLS unchanged.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS phone TEXT
    CHECK (phone IS NULL OR char_length(phone) <= 40),
  ADD COLUMN IF NOT EXISTS email TEXT
    CHECK (email IS NULL OR char_length(email) <= 255),
  ADD COLUMN IF NOT EXISTS address TEXT
    CHECK (address IS NULL OR char_length(address) <= 500),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT
    CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 500),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_professionals_created_by
  ON public.professionals (organization_id, created_by)
  WHERE deleted_at IS NULL AND created_by IS NOT NULL;

COMMENT ON COLUMN public.professionals.phone IS 'Contact phone for the professional profile';
COMMENT ON COLUMN public.professionals.email IS 'Contact email (may differ from auth user email)';
COMMENT ON COLUMN public.professionals.created_by IS 'Admin user who created the professional row';
