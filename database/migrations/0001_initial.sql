PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, discord_id TEXT NOT NULL UNIQUE, username TEXT NOT NULL, avatar_url TEXT,
 locale TEXT NOT NULL DEFAULT 'ru',
 site_role TEXT NOT NULL DEFAULT 'user' CHECK(site_role IN ('user','moderator','chief_moderator','admin','owner')),
 rules_accepted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS servers (
 id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES users(id), discord_guild_id TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', invite_url TEXT, category TEXT NOT NULL DEFAULT 'other',
 tags_json TEXT NOT NULL DEFAULT '[]', member_count INTEGER NOT NULL DEFAULT 0, partner_count INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','hidden','closed')),
 partnership_open INTEGER NOT NULL DEFAULT 1, contact_dm INTEGER NOT NULL DEFAULT 0, contact_bot INTEGER NOT NULL DEFAULT 0,
 contact_server INTEGER NOT NULL DEFAULT 0, vip_until TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS partnership_requests (
 id TEXT PRIMARY KEY, server_id TEXT NOT NULL REFERENCES servers(id), requester_user_id TEXT NOT NULL REFERENCES users(id),
 message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id), server_id TEXT NOT NULL REFERENCES servers(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,server_id));
CREATE TABLE IF NOT EXISTS reports (
 id TEXT PRIMARY KEY, reporter_user_id TEXT NOT NULL REFERENCES users(id), target_type TEXT NOT NULL CHECK(target_type IN ('server','user')),
 target_id TEXT NOT NULL, reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', evidence_url TEXT,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','confirmed','dismissed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), type TEXT NOT NULL, title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '', read_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS achievements (id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL, threshold INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS user_achievements (user_id TEXT NOT NULL REFERENCES users(id), achievement_id TEXT NOT NULL REFERENCES achievements(id), awarded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,achievement_id));
CREATE TABLE IF NOT EXISTS admin_audit_log (id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL, target_type TEXT, target_id TEXT, details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_servers_status_created ON servers(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_servers_category ON servers(category);
CREATE INDEX IF NOT EXISTS idx_requests_server_status ON partnership_requests(server_id,status);
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status,created_at DESC);
INSERT OR IGNORE INTO achievements(id,code,title,description,threshold) VALUES
('ach_first_server','first_server','Первый сервер','Добавьте первый сервер',1),
('ach_5_partners','partners_5','5 партнёрств','Подтвердите 5 успешных партнёрств',5),
('ach_10_partners','partners_10','10 партнёрств','Подтвердите 10 успешных партнёрств',10),
('ach_25_partners','partners_25','25 партнёрств','Подтвердите 25 успешных партнёрств',25),
('ach_50_partners','partners_50','50 партнёрств','Подтвердите 50 успешных партнёрств',50),
('ach_project_help','project_helper','Помощник проекта','Помогите проекту Metro New',1),
('ach_activity','active_member','Активный участник','Будьте активны на сайте',1),
('ach_invites','inviter','Приглашайте друзей','Пригласите новых пользователей',1);
