-- Add chapter merging configuration
-- This allows admin to enable/disable automatic merging of multi-file chapter downloads into single M4B

-- Insert default configuration for chapter merging (disabled by default)
INSERT INTO configuration (id, key, value, encrypted, category, description, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'chapter_merging_enabled',
  'false',
  false,
  'automation',
  'Automatically merge multi-file chapter downloads into a single M4B audiobook with chapter markers. Improves playback experience and library organization.',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;
