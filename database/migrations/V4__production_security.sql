ALTER TABLE auth_sessions ADD COLUMN revoked_at DATETIME(6) NULL,
 ADD COLUMN revoke_reason VARCHAR(32) NULL,
 ADD INDEX ix_session_user(user_id,revoked_at);
CREATE TABLE security_bootstrap (
 id TINYINT PRIMARY KEY,
 digest BINARY(32) NULL,
 expires_at DATETIME(6) NULL,
 consumed_at DATETIME(6) NULL,
 CONSTRAINT ck_bootstrap_singleton CHECK(id=1)
) ENGINE=InnoDB;
INSERT INTO security_bootstrap(id) VALUES(1);
CREATE TABLE login_windows (
 bucket BINARY(32) PRIMARY KEY,
 window_start DATETIME(6) NOT NULL,
 attempts INT NOT NULL,
 INDEX ix_login_expiry(window_start)
) ENGINE=InnoDB;
CREATE TABLE security_audit (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 type VARCHAR(40) NOT NULL,
 actor_id BIGINT NULL,
 target_id BIGINT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX ix_security_created(created_at),
 FOREIGN KEY(actor_id) REFERENCES users(id),
 FOREIGN KEY(target_id) REFERENCES users(id)
) ENGINE=InnoDB;
