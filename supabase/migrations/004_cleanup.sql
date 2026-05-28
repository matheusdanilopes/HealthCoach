-- ============================================================
-- Migration 004: Database Cleanup — Remove Unused Structures
-- ============================================================
-- Safe to run on existing databases. All removals are guarded
-- with IF EXISTS so the script is idempotent.
--
-- What is removed and why:
--
--   users.target_protein_g / target_carbs_g / target_fat_g
--     → Defined in the original schema but never set by any API
--       route and never read by any page, component, or type.
--       The Profile type in src/types/index.ts omits them entirely.
--
--   idx_weight_logs_user_date
--   idx_body_metrics_user_date
--   idx_body_measurements_user_date
--     → Each table already has UNIQUE(user_id, date/log_date).
--       PostgreSQL creates a unique B-tree index for every UNIQUE
--       constraint, which the planner uses for WHERE lookups just
--       as well as a plain index. The duplicate non-unique indexes
--       waste storage and slow down writes with no query benefit.
--
--   food_logs_user_created_idx  (user_id, created_at)
--     → Legacy index from the old schema block. Every query on
--       food_logs filters by (user_id, log_date), which is already
--       covered by idx_food_logs_user_date. The created_at ordering
--       step is cheap in-memory after the indexed lookup.
--
--   water_logs_user_date_idx / weight_logs_user_date_idx
--     → Legacy indexes that reference a "date" column that was
--       renamed to "log_date" in the current schema. They either
--       failed silently on creation or point to nothing useful.
--
--   public.profiles
--     → Legacy Supabase-Auth table from the old architecture. The
--       current app uses public.users + NextAuth credentials. The
--       profiles table has never been populated by the running app.
--
--   public.handle_new_user() / on_auth_user_created
--     → Trigger function that auto-inserts into public.profiles on
--       auth.users insert. Since the app never writes to auth.users
--       (NextAuth handles its own users table) this trigger has
--       never fired in production.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Remove unused macro-target columns from users
-- ────────────────────────────────────────────────────────────
ALTER TABLE users DROP COLUMN IF EXISTS target_protein_g;
ALTER TABLE users DROP COLUMN IF EXISTS target_carbs_g;
ALTER TABLE users DROP COLUMN IF EXISTS target_fat_g;


-- ────────────────────────────────────────────────────────────
-- 2. Remove redundant indexes superseded by UNIQUE constraints
-- ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_weight_logs_user_date;
DROP INDEX IF EXISTS idx_body_metrics_user_date;
DROP INDEX IF EXISTS idx_body_measurements_user_date;


-- ────────────────────────────────────────────────────────────
-- 3. Remove legacy indexes from the old schema block
-- ────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS food_logs_user_created_idx;
DROP INDEX IF EXISTS water_logs_user_date_idx;
DROP INDEX IF EXISTS weight_logs_user_date_idx;


-- ────────────────────────────────────────────────────────────
-- 4. Remove legacy Supabase Auth objects
-- ────────────────────────────────────────────────────────────
DROP TRIGGER  IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE    IF EXISTS public.profiles;
