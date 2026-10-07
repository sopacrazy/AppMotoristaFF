-- All timestamps are UTC. Reports remain available after a new prestation starts.
CREATE TABLE IF NOT EXISTS expense_reports (
  id CHAR(36) NOT NULL PRIMARY KEY,
  motorista VARCHAR(64) NOT NULL,
  codigo_rota VARCHAR(64) NULL,
  motorista_nome VARCHAR(160) NULL,
  destino VARCHAR(255) NOT NULL,
  valor_recebido DECIMAL(12,2) NOT NULL,
  valor_gasto DECIMAL(12,2) NOT NULL DEFAULT 0,
  saldo DECIMAL(12,2) NOT NULL DEFAULT 0,
  saida_texto VARCHAR(40) NULL,
  retorno_texto VARCHAR(40) NULL,
  iniciada_em DATETIME(3) NULL,
  finalizada_em DATETIME(3) NULL,
  status VARCHAR(16) NOT NULL,
  client_revision BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  KEY idx_expense_reports_driver_created (motorista, created_at),
  KEY idx_expense_reports_created (created_at),
  KEY idx_expense_reports_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS expense_items (
  report_id CHAR(36) NOT NULL,
  item_id VARCHAR(64) NOT NULL,
  data_despesa DATE NOT NULL,
  fornecedor VARCHAR(255) NULL,
  categoria VARCHAR(120) NOT NULL,
  categoria_personalizada VARCHAR(120) NULL,
  valor DECIMAL(12,2) NOT NULL,
  comprovante_url TEXT NULL,
  comprovante_pendente TINYINT(1) NOT NULL DEFAULT 0,
  excluida_em DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (report_id, item_id),
  KEY idx_expense_items_date (data_despesa),
  CONSTRAINT fk_expense_items_report FOREIGN KEY (report_id) REFERENCES expense_reports(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
