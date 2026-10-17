-- MySQL 8.4 / InnoDB. Amounts are integral virtual points, never floating point.
CREATE TABLE users (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
  kind VARCHAR(16) NOT NULL DEFAULT 'HUMAN',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_users_email UNIQUE (email),
  CONSTRAINT ck_users_role CHECK (role IN ('ADMIN','BIDDER')),
  CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE','DISABLED')),
  CONSTRAINT ck_users_kind CHECK (kind IN ('HUMAN','AGENT'))
) ENGINE=InnoDB;

CREATE TABLE wallets (
  user_id BIGINT NOT NULL PRIMARY KEY,
  total_balance BIGINT NOT NULL DEFAULT 0,
  frozen_balance BIGINT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_wallet_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_wallet_balances CHECK (total_balance >= 0 AND frozen_balance >= 0 AND total_balance >= frozen_balance),
  CONSTRAINT ck_wallet_version CHECK (version >= 0)
) ENGINE=InnoDB;

CREATE TABLE auctions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  seed_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  title VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  start_price BIGINT NOT NULL DEFAULT 100,
  current_price BIGINT NOT NULL DEFAULT 100,
  min_increment BIGINT NOT NULL DEFAULT 10,
  duration_seconds INT NOT NULL DEFAULT 180,
  leader_id BIGINT NULL,
  end_at DATETIME(6) NULL,
  extension_count INT NOT NULL DEFAULT 0,
  seq BIGINT NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  created_by BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_auction_seed UNIQUE (seed_key),
  CONSTRAINT fk_auction_leader FOREIGN KEY (leader_id) REFERENCES users(id),
  CONSTRAINT fk_auction_creator FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT ck_auction_status CHECK (status IN ('DRAFT','RUNNING','SETTLING','FINISHED','CANCELLED')),
  CONSTRAINT ck_auction_prices CHECK (start_price >= 0 AND current_price >= start_price AND min_increment > 0),
  CONSTRAINT ck_auction_counters CHECK (extension_count BETWEEN 0 AND 3 AND seq >= 0 AND version >= 0 AND duration_seconds > 0),
  CONSTRAINT ck_auction_deadline CHECK (status NOT IN ('RUNNING','SETTLING','FINISHED') OR end_at IS NOT NULL),
  INDEX ix_auction_due (status,end_at,id)
) ENGINE=InnoDB;

CREATE TABLE auction_participants (
  auction_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  kind VARCHAR(16) NOT NULL,
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (auction_id,user_id),
  CONSTRAINT fk_participant_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT fk_participant_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_participant_kind CHECK (kind IN ('HUMAN','AGENT')),
  INDEX ix_participant_user (user_id,auction_id)
) ENGINE=InnoDB;

CREATE TABLE auction_holds (
  auction_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  amount BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (auction_id,user_id),
  CONSTRAINT fk_hold_participant FOREIGN KEY (auction_id,user_id) REFERENCES auction_participants(auction_id,user_id),
  CONSTRAINT fk_hold_wallet FOREIGN KEY (user_id) REFERENCES wallets(user_id),
  CONSTRAINT ck_hold_amount CHECK (amount >= 0),
  INDEX ix_hold_user (user_id,auction_id)
) ENGINE=InnoDB;

CREATE TABLE bid_requests (
  user_id BIGINT NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  auction_id BIGINT NOT NULL,
  payload_hash BINARY(32) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  result_code VARCHAR(64) NULL,
  response_json JSON NULL,
  received_at DATETIME(6) NOT NULL,
  PRIMARY KEY (user_id,request_id),
  CONSTRAINT fk_request_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_request_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT ck_request_state CHECK (state IN ('PENDING','ACCEPTED','REJECTED')),
  INDEX ix_request_pending (auction_id,state,received_at)
) ENGINE=InnoDB;

CREATE TABLE bids (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  auction_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount BIGINT NOT NULL,
  seq BIGINT NOT NULL,
  received_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_bid_request UNIQUE (user_id,request_id),
  CONSTRAINT uq_bid_seq UNIQUE (auction_id,seq),
  CONSTRAINT fk_bid_participant FOREIGN KEY (auction_id,user_id) REFERENCES auction_participants(auction_id,user_id),
  CONSTRAINT fk_bid_request FOREIGN KEY (user_id,request_id) REFERENCES bid_requests(user_id,request_id),
  CONSTRAINT ck_bid_amount CHECK (amount > 0 AND seq > 0),
  INDEX ix_bid_history (auction_id,id)
) ENGINE=InnoDB;

CREATE TABLE wallet_transactions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  auction_id BIGINT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  effect_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  type VARCHAR(24) NOT NULL,
  delta_total BIGINT NOT NULL,
  delta_frozen BIGINT NOT NULL,
  total_after BIGINT NOT NULL,
  frozen_after BIGINT NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_wallet_effect UNIQUE (effect_key),
  CONSTRAINT fk_transaction_wallet FOREIGN KEY (user_id) REFERENCES wallets(user_id),
  CONSTRAINT fk_transaction_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT ck_transaction_balances CHECK (total_after >= frozen_after AND frozen_after >= 0),
  CONSTRAINT ck_transaction_type CHECK (type IN ('INITIAL_CREDIT','FREEZE','RELEASE','CAPTURE')),
  CONSTRAINT ck_transaction_deltas CHECK (
    (type='INITIAL_CREDIT' AND delta_total>0 AND delta_frozen=0) OR
    (type='FREEZE' AND delta_total=0 AND delta_frozen>0) OR
    (type='RELEASE' AND delta_total=0 AND delta_frozen<0) OR
    (type='CAPTURE' AND delta_total<0 AND delta_total=delta_frozen)
  ),
  INDEX ix_transaction_user (user_id,id),
  INDEX ix_transaction_auction (auction_id,id)
) ENGINE=InnoDB;

CREATE TABLE auction_results (
  auction_id BIGINT NOT NULL PRIMARY KEY,
  winner_id BIGINT NULL,
  price BIGINT NOT NULL,
  reason VARCHAR(16) NOT NULL,
  settled_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_result_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT fk_result_winner FOREIGN KEY (winner_id) REFERENCES users(id),
  CONSTRAINT ck_result_outcome CHECK (
    (reason='SOLD' AND winner_id IS NOT NULL AND price>0) OR
    (reason IN ('NO_BIDS','CANCELLED') AND winner_id IS NULL AND price=0)
  )
) ENGINE=InnoDB;

CREATE TABLE auction_events (
  auction_id BIGINT NOT NULL,
  seq BIGINT NOT NULL,
  type VARCHAR(48) NOT NULL,
  server_time DATETIME(6) NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
  user_id BIGINT NULL,
  payload JSON NOT NULL,
  published_at DATETIME(6) NULL,
  PRIMARY KEY (auction_id,seq),
  CONSTRAINT fk_event_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT fk_event_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_event_seq CHECK (seq > 0),
  CONSTRAINT ck_event_visibility CHECK ((visibility='PUBLIC' AND user_id IS NULL) OR (visibility='PRIVATE' AND user_id IS NOT NULL)),
  INDEX ix_event_pending (published_at,auction_id,seq)
) ENGINE=InnoDB;

CREATE TABLE agent_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  digest BINARY(32) NOT NULL,
  user_id BIGINT NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  revoked_at DATETIME(6) NULL,
  rate_limit INT NOT NULL DEFAULT 60,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT uq_token_digest UNIQUE (digest),
  CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT ck_token_limit CHECK (rate_limit > 0),
  INDEX ix_token_user (user_id,id)
) ENGINE=InnoDB;

CREATE TABLE agent_token_scopes (
  token_id BIGINT NOT NULL,
  auction_id BIGINT NOT NULL,
  permission VARCHAR(24) NOT NULL,
  PRIMARY KEY (token_id,auction_id,permission),
  CONSTRAINT fk_scope_token FOREIGN KEY (token_id) REFERENCES agent_tokens(id),
  CONSTRAINT fk_scope_auction FOREIGN KEY (auction_id) REFERENCES auctions(id),
  CONSTRAINT ck_scope_permission CHECK (permission IN ('auction:read','auction:bid'))
) ENGINE=InnoDB;

CREATE TABLE agent_rate_windows (
  token_id BIGINT NOT NULL,
  window_start DATETIME NOT NULL,
  request_count INT NOT NULL,
  PRIMARY KEY (token_id,window_start),
  CONSTRAINT fk_rate_token FOREIGN KEY (token_id) REFERENCES agent_tokens(id),
  CONSTRAINT ck_rate_count CHECK (request_count >= 0),
  INDEX ix_rate_cleanup (window_start)
) ENGINE=InnoDB;

CREATE TABLE seed_state (
  seed_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  completed_at DATETIME(6) NULL
) ENGINE=InnoDB;
