-- Additive migration; run once on Production Neon after taking a snapshot.
BEGIN;
CREATE TABLE IF NOT EXISTS learning_visitors (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(), consent_version text,
 consented_at timestamptz, revoked_at timestamptz
);
-- Compatibility if the earlier consent-based V1 migration was applied.
ALTER TABLE learning_visitors ALTER COLUMN consent_version DROP NOT NULL;
ALTER TABLE learning_visitors ALTER COLUMN consented_at DROP NOT NULL;
ALTER TABLE learning_visitors ALTER COLUMN consented_at DROP DEFAULT;
CREATE TABLE IF NOT EXISTS learning_sessions (
 id uuid PRIMARY KEY, visitor_id uuid NOT NULL REFERENCES learning_visitors(id),
 content_id text NOT NULL REFERENCES contents(id),
 started_at timestamptz NOT NULL DEFAULT now(), last_activity_at timestamptz NOT NULL DEFAULT now(),
 ended_at timestamptz, active_seconds integer NOT NULL DEFAULT 0 CHECK(active_seconds>=0),
 completed boolean NOT NULL DEFAULT false,
 source text NOT NULL DEFAULT 'player' CHECK(source IN ('player','review'))
);
CREATE TABLE IF NOT EXISTS learning_events (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES learning_sessions(id),
 content_id text NOT NULL REFERENCES contents(id), event_type text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 position_seconds integer CHECK(position_seconds>=0),
 duration_seconds integer CHECK(duration_seconds>=0),
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS learning_progress (
 visitor_id uuid NOT NULL REFERENCES learning_visitors(id),
 content_id text NOT NULL REFERENCES contents(id),
 total_active_seconds bigint NOT NULL DEFAULT 0 CHECK(total_active_seconds>=0),
 last_position_seconds integer NOT NULL DEFAULT 0 CHECK(last_position_seconds>=0),
 completed boolean NOT NULL DEFAULT false,
 first_started_at timestamptz NOT NULL DEFAULT now(),
 last_studied_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(visitor_id,content_id)
);
CREATE INDEX IF NOT EXISTS learning_sessions_started_idx ON learning_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS learning_sessions_content_idx ON learning_sessions(content_id,started_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_session_idx ON learning_events(session_id,occurred_at);
CREATE INDEX IF NOT EXISTS learning_progress_recent_idx ON learning_progress(last_studied_at DESC);
CREATE TABLE IF NOT EXISTS learning_page_visits (
 id uuid PRIMARY KEY,
 visitor_id uuid NOT NULL REFERENCES learning_visitors(id),
 visited_at timestamptz NOT NULL DEFAULT now(),
 page text NOT NULL CHECK (page IN ('player','review'))
);
CREATE INDEX IF NOT EXISTS learning_page_visits_time_idx ON learning_page_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS learning_page_visits_visitor_idx ON learning_page_visits(visitor_id,visited_at DESC);
COMMIT;
