-- Tabela de Badges (Medalhas)
CREATE TABLE IF NOT EXISTS badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(50) NOT NULL UNIQUE, -- Identificador único para lógica (ex: 'madrugador')
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) NOT NULL, -- Nome do ícone (ex: 'Sunrise', 'Zap')
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Relacionamento (Badges do Usuário)
CREATE TABLE IF NOT EXISTS user_badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  motorista_id VARCHAR(50) NOT NULL, -- Referência ao ZH_MOTOR (login)
  badge_id INT NOT NULL,
  conquistado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (badge_id) REFERENCES badges(id) ON DELETE CASCADE,
  -- Adicionamos um índice para busca rápida por motorista
  INDEX idx_motorista (motorista_id),
  -- Garante que o motorista só ganhe a mesma medalha uma vez
  UNIQUE KEY unique_user_badge (motorista_id, badge_id)
);

-- Inserir Badges Iniciais (Seed)
INSERT IGNORE INTO badges (slug, name, description, icon) VALUES 
('madrugador', 'Madrugador', 'Realizou entregas antes das 8:00h da manhã.', 'Sunrise'),
('flash', 'Flash', 'Concluiu uma entrega em tempo recorde.', 'Zap'),
('rei_da_rota', 'Rei da Rota', 'Completou mais de 50 entregas no total.', 'Crown');
