import Database from 'better-sqlite3';

export function createMemoryDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE layout_presets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      layout_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE managed_hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      hostname TEXT NOT NULL,
      user TEXT,
      port INTEGER NOT NULL DEFAULT 22,
      identity_file TEXT,
      auth_method TEXT NOT NULL DEFAULT 'key',
      group_name TEXT NOT NULL DEFAULT 'Other',
      is_local INTEGER NOT NULL DEFAULT 0,
      connection_type TEXT NOT NULL DEFAULT 'ssh',
      docker_container TEXT,
      gateway_host_id INTEGER,
      enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_test_status TEXT,
      last_test_at TEXT,
      tmux_available INTEGER,
      last_test_error TEXT,
      last_test_steps_json TEXT,
      last_test_os TEXT,
      last_test_os_id TEXT,
      last_test_tmux_version TEXT,
      last_test_install_command TEXT,
      last_test_duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT,
      FOREIGN KEY (gateway_host_id) REFERENCES managed_hosts(id) ON DELETE SET NULL
    );

    CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE session_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      process_name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7688',
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE workspace_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      layout_json TEXT NOT NULL,
      pane_count INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      target_name TEXT,
      status TEXT NOT NULL DEFAULT 'ok',
      details_json TEXT,
      error TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}
