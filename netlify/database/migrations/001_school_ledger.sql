CREATE TABLE IF NOT EXISTS ledger (
 id text PRIMARY KEY,
 version integer NOT NULL DEFAULT 0,
 data text NOT NULL
);
CREATE TABLE IF NOT EXISTS backups (
 id text PRIMARY KEY,
 version integer NOT NULL,
 data text NOT NULL,
 created text NOT NULL,
 reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS backups_version ON backups(version DESC);
