ALTER TABLE agent_jobs
 ADD COLUMN strategy VARCHAR(16) NOT NULL DEFAULT 'BALANCED',
 ADD CONSTRAINT ck_job_strategy CHECK(strategy IN ('BALANCED','CONSERVATIVE','MONITOR'));

-- Transactional create-and-start receipt. Failed provisioning rolls back this row,
-- the account, initial credit, token and job together; a retry can safely try again.
CREATE TABLE agent_job_creations (
 admin_id BIGINT NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 config_hash BINARY(32) NOT NULL,
 job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 PRIMARY KEY(admin_id,request_id),
 UNIQUE KEY uq_agent_creation_job(job_id),
 FOREIGN KEY(admin_id) REFERENCES users(id),
 FOREIGN KEY(job_id) REFERENCES agent_jobs(id)
) ENGINE=InnoDB;
