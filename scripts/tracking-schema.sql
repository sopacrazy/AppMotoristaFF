-- Tracking timestamps are stored in UTC. Apply before deploying the tracking API.
CREATE TABLE IF NOT EXISTS tracking_tokens (
  token_hash BINARY(32) NOT NULL PRIMARY KEY,
  motorista VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  KEY idx_tracking_tokens_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tracking_positions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  point_id CHAR(36) NOT NULL,
  session_id CHAR(36) NOT NULL,
  motorista VARCHAR(64) NOT NULL,
  codigo_rota VARCHAR(64) NULL,
  captured_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m FLOAT NULL,
  speed_mps FLOAT NULL,
  heading_degrees FLOAT NULL,
  UNIQUE KEY uq_tracking_point (point_id),
  KEY idx_tracking_motorista_time (motorista, captured_at),
  KEY idx_tracking_retention (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tracking_latest (
  motorista VARCHAR(64) NOT NULL PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  codigo_rota VARCHAR(64) NULL,
  captured_at DATETIME(3) NOT NULL,
  received_at DATETIME(3) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m FLOAT NULL,
  speed_mps FLOAT NULL,
  heading_degrees FLOAT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  stopped_at DATETIME(3) NULL,
  KEY idx_tracking_latest_retention (captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
