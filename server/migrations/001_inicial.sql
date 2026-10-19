-- 001: esquema inicial. Todos os IDs são UUID (texto). Datas em ISO-8601.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  reset_token_hash TEXT,
  reset_expires_at TEXT,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  preferences TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE family_trees (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id TEXT NOT NULL REFERENCES users(id),
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE tree_memberships (
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','editor','contributor','reader')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tree_id, user_id)
);
CREATE INDEX idx_memberships_user ON tree_memberships(user_id);

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  municipality TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  lat REAL,
  lng REAL,
  precision TEXT NOT NULL DEFAULT 'unknown' CHECK (precision IN ('exact','city','region','country','unknown')),
  norm TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX idx_places_norm ON places(norm);

CREATE TABLE persons (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  birth_name TEXT NOT NULL DEFAULT '',
  sex TEXT NOT NULL DEFAULT '' CHECK (sex IN ('','F','M','X')),
  bio TEXT NOT NULL DEFAULT '',
  photo_document_id TEXT,
  living_status TEXT NOT NULL DEFAULT 'unknown' CHECK (living_status IN ('living','deceased','unknown')),
  birth_date TEXT NOT NULL DEFAULT '',
  birth_qual TEXT NOT NULL DEFAULT 'exact' CHECK (birth_qual IN ('exact','about','before','after','estimated')),
  birth_place_id TEXT REFERENCES places(id),
  death_date TEXT NOT NULL DEFAULT '',
  death_qual TEXT NOT NULL DEFAULT 'exact' CHECK (death_qual IN ('exact','about','before','after','estimated')),
  death_place_id TEXT REFERENCES places(id),
  verification TEXT NOT NULL DEFAULT 'declared' CHECK (verification IN ('declared','extracted','documented','confirmed','contested','hypothesis')),
  visibility TEXT NOT NULL DEFAULT 'tree' CHECK (visibility IN ('private','tree')),
  search_norm TEXT NOT NULL DEFAULT '',
  phonetic TEXT NOT NULL DEFAULT '',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX idx_persons_norm ON persons(search_norm);
CREATE INDEX idx_persons_birth ON persons(birth_date);

-- Uma pessoa pode estar em várias árvores sem ser duplicada.
CREATE TABLE tree_persons (
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (tree_id, person_id)
);
CREATE INDEX idx_tree_persons_person ON tree_persons(person_id);

CREATE TABLE person_names (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('previous','nickname','variant')),
  name TEXT NOT NULL,
  norm TEXT NOT NULL
);
CREATE INDEX idx_person_names_person ON person_names(person_id);
CREATE INDEX idx_person_names_norm ON person_names(norm);

-- Identificadores sensíveis: valor criptografado, HMAC para detectar duplicidade, só os últimos dígitos em claro.
CREATE TABLE person_identifiers (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cpf','rg','passport','birth_cert','marriage_cert','death_cert','foreign','other')),
  country TEXT NOT NULL DEFAULT 'BR',
  issuer TEXT NOT NULL DEFAULT '',
  issued_at TEXT NOT NULL DEFAULT '',
  expires_at TEXT NOT NULL DEFAULT '',
  value_enc TEXT NOT NULL,
  value_hmac TEXT NOT NULL,
  last_digits TEXT NOT NULL DEFAULT '',
  document_id TEXT,
  origin TEXT NOT NULL DEFAULT '',
  verification TEXT NOT NULL DEFAULT 'declared',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_identifiers_person ON person_identifiers(person_id);
CREATE INDEX idx_identifiers_hmac ON person_identifiers(value_hmac);

-- Relações: parent = A é genitor/responsável de B. spouse/partner são simétricas.
CREATE TABLE relationships (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  person_a TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  person_b TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('parent','spouse','partner','guardian','sibling','unknown')),
  subtype TEXT NOT NULL DEFAULT 'unknown' CHECK (subtype IN ('biological','legal','adoptive','step','foster','unknown')),
  status TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','extracted','documented','confirmed','contested','hypothesis')),
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  end_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT,
  CHECK (person_a <> person_b)
);
CREATE INDEX idx_rel_tree ON relationships(tree_id);
CREATE INDEX idx_rel_a ON relationships(person_a);
CREATE INDEX idx_rel_b ON relationships(person_b);

CREATE TABLE life_events (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  related_person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('birth','death','marriage','divorce','immigration','emigration','residence','name_change','baptism','burial','military','other')),
  date TEXT NOT NULL DEFAULT '',
  date_qual TEXT NOT NULL DEFAULT 'exact' CHECK (date_qual IN ('exact','about','before','after','estimated')),
  place_id TEXT REFERENCES places(id),
  description TEXT NOT NULL DEFAULT '',
  verification TEXT NOT NULL DEFAULT 'declared',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX idx_events_tree ON life_events(tree_id, date);
CREATE INDEX idx_events_person ON life_events(person_id);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  doc_date TEXT NOT NULL DEFAULT '',
  place_id TEXT REFERENCES places(id),
  institution TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  page TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  accessed_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  transcription TEXT NOT NULL DEFAULT '',
  verification TEXT NOT NULL DEFAULT 'declared',
  access_level TEXT NOT NULL DEFAULT 'tree' CHECK (access_level IN ('tree','editors','owner')),
  storage_key TEXT,
  mime TEXT,
  size INTEGER,
  sha256 TEXT,
  original_name TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX idx_documents_tree ON documents(tree_id);

CREATE TABLE document_links (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  person_id TEXT REFERENCES persons(id) ON DELETE CASCADE,
  relationship_id TEXT REFERENCES relationships(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES life_events(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  CHECK (person_id IS NOT NULL OR relationship_id IS NOT NULL OR event_id IS NOT NULL)
);
CREATE INDEX idx_doclinks_doc ON document_links(document_id);
CREATE INDEX idx_doclinks_person ON document_links(person_id);
CREATE INDEX idx_doclinks_rel ON document_links(relationship_id);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  repository TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  coverage TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);

CREATE TABLE source_citations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  page TEXT NOT NULL DEFAULT '',
  quote TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Grafo de evidências: o que sustenta (ou contradiz) cada pessoa, relação ou evento.
CREATE TABLE evidence_items (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('person','relationship','event')),
  target_id TEXT NOT NULL,
  field TEXT NOT NULL DEFAULT '',
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  citation_id TEXT REFERENCES source_citations(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('declared','extracted','documented','confirmed','contested','hypothesis')),
  stance INTEGER NOT NULL DEFAULT 1 CHECK (stance IN (1,-1)),
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_evidence_target ON evidence_items(target_type, target_id);

CREATE TABLE match_candidates (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  person_a TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  person_b TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  category TEXT NOT NULL,
  factors TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','later','merged')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (tree_id, person_a, person_b)
);

CREATE TABLE match_reviews (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES match_candidates(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  decision TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  justification TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT REFERENCES users(id),
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment','review_request')),
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at TEXT
);
CREATE INDEX idx_comments_target ON comments(target_type, target_id);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('admin','editor','contributor','reader')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  tree_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_audit_tree ON audit_logs(tree_id, created_at);

CREATE TABLE import_jobs (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  format TEXT NOT NULL,
  filename TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  tree_id TEXT NOT NULL REFERENCES family_trees(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id),
  format TEXT NOT NULL,
  options TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
