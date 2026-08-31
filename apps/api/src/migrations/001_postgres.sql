CREATE TABLE IF NOT EXISTS court_cases (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  symbols_json JSONB NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  initial_capital DOUBLE PRECISION NOT NULL,
  commission_bps DOUBLE PRECISION NOT NULL DEFAULT 0,
  slippage_bps DOUBLE PRECISION NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'draft',
  selected_profile TEXT NOT NULL DEFAULT 'balanced',
  active_version_id TEXT,
  evaluation_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  parent_version_id TEXT REFERENCES strategy_versions(id),
  definition_json JSONB NOT NULL,
  interpretation TEXT NOT NULL,
  source TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  evaluation_informed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (case_id, version_number)
);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  adjustment TEXT NOT NULL,
  feed TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  symbols_json JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  request_json JSONB NOT NULL,
  bars_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS court_runs (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  strategy_version_id TEXT NOT NULL REFERENCES strategy_versions(id),
  data_snapshot_id TEXT REFERENCES market_snapshots(id),
  engine_version TEXT NOT NULL,
  reproducibility_id TEXT,
  profile TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_json JSONB NOT NULL,
  summary TEXT,
  result_json JSONB,
  error_json JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS replay_sessions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  strategy_version_id TEXT NOT NULL REFERENCES strategy_versions(id),
  run_id TEXT NOT NULL REFERENCES court_runs(id),
  reserved_from DATE NOT NULL,
  reserved_to DATE NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  state_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES court_cases(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS indicator_definitions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  formula_json JSONB NOT NULL,
  inputs_json JSONB NOT NULL,
  dependencies_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_type TEXT NOT NULL,
  sharing_state TEXT NOT NULL DEFAULT 'private',
  creator_type TEXT NOT NULL DEFAULT 'user',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  lineage_id TEXT,
  parent_indicator_id TEXT REFERENCES indicator_definitions(id),
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS creator_type TEXT NOT NULL DEFAULT 'user';
ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS lineage_id TEXT;
ALTER TABLE indicator_definitions ADD COLUMN IF NOT EXISTS parent_indicator_id TEXT REFERENCES indicator_definitions(id);

CREATE TABLE IF NOT EXISTS share_tokens (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('report', 'indicator')),
  entity_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  rotated_from_id TEXT REFERENCES share_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS monitoring_evaluations (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  strategy_version_id TEXT NOT NULL REFERENCES strategy_versions(id),
  data_snapshot_id TEXT NOT NULL REFERENCES market_snapshots(id),
  evaluated_date DATE NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS court_cases_owner_idx ON court_cases(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS strategy_versions_case_idx ON strategy_versions(case_id, created_at);
CREATE INDEX IF NOT EXISTS court_runs_case_idx ON court_runs(case_id, created_at);
CREATE INDEX IF NOT EXISTS audit_events_case_idx ON audit_events(case_id, created_at);
CREATE INDEX IF NOT EXISTS indicator_definitions_owner_idx ON indicator_definitions(owner_user_id, name);
CREATE INDEX IF NOT EXISTS indicator_definitions_lineage_idx ON indicator_definitions(owner_user_id, lineage_id, version);
CREATE INDEX IF NOT EXISTS share_tokens_lookup_idx ON share_tokens(token_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS share_tokens_owner_idx ON share_tokens(owner_user_id, entity_type, entity_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS share_tokens_one_active_idx
  ON share_tokens(owner_user_id, entity_type, entity_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS monitoring_evaluations_case_idx
  ON monitoring_evaluations(case_id, strategy_version_id, created_at DESC);

ALTER TABLE court_cases ADD COLUMN IF NOT EXISTS creation_request_id TEXT;
ALTER TABLE court_cases ADD COLUMN IF NOT EXISTS creation_input_hash TEXT;
ALTER TABLE court_cases ADD COLUMN IF NOT EXISTS sample_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS court_cases_creation_request_idx ON court_cases(owner_user_id,creation_request_id) WHERE creation_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS investigation_decisions (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES court_cases(id) ON DELETE CASCADE,
  strategy_version_id TEXT NOT NULL REFERENCES strategy_versions(id),
  run_id TEXT NOT NULL REFERENCES court_runs(id),
  state TEXT NOT NULL CHECK (state IN ('draft','confirmed')),
  fields_json JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('user','agent')),
  creator_user_id TEXT NOT NULL REFERENCES "user"(id),
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT REFERENCES "user"(id),
  supersedes_id TEXT REFERENCES investigation_decisions(id),
  UNIQUE (case_id,request_id)
);
CREATE INDEX IF NOT EXISTS investigation_decisions_run_idx ON investigation_decisions(case_id,run_id,created_at DESC);

CREATE TABLE IF NOT EXISTS prepared_samples (
  id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
