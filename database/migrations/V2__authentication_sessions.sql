CREATE TABLE auth_sessions (
 digest BINARY(32) NOT NULL PRIMARY KEY,
 user_id BIGINT NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_session_user FOREIGN KEY(user_id) REFERENCES users(id),
 INDEX ix_session_expiry(expires_at)
) ENGINE=InnoDB;
