CREATE TABLE IF NOT EXISTS conversations(id text PRIMARY KEY, mode text NOT NULL CHECK(mode IN ('fixture','connected')), created_at timestamptz NOT NULL DEFAULT now(), state jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS messages(id text PRIMARY KEY, conversation_id text REFERENCES conversations(id) ON DELETE CASCADE, role text NOT NULL, text text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS messages_created ON messages(created_at);
CREATE TABLE IF NOT EXISTS outcomes(id text PRIMARY KEY, conversation_id text REFERENCES conversations(id) ON DELETE CASCADE, operation_id text UNIQUE NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS confirmations(id text PRIMARY KEY, binding text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS settings(key text PRIMARY KEY,value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS callbacks(id text PRIMARY KEY,conversation_id text NOT NULL,name text NOT NULL,phone text NOT NULL,message text NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY,role text NOT NULL,staff_grant text,expires_at timestamptz NOT NULL);
