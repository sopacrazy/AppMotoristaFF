-- Tabela para Controle Diário (Paradas do Motorista)
CREATE TABLE IF NOT EXISTS daily_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    motorista_id VARCHAR(50) NOT NULL,
    route_id VARCHAR(50),
    local TEXT NOT NULL,
    status ENUM('pendente', 'concluido') DEFAULT 'pendente',
    hora_inicio TIME NOT NULL,
    hora_fim TIME,
    foto_url TEXT,
    data DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_motorista_data (motorista_id, data)
);
