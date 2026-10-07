-- ============================================
-- QUERY PARA ADICIONAR COLUNA NA TABELA OCORRENCIAS
-- ============================================
-- Esta query adiciona uma coluna para identificar se a ocorrência
-- foi adicionada pelo app do motorista ("S") ou por outro sistema (NULL)
-- ============================================

-- Adiciona a coluna 'adicionado_pelo_app' na tabela ocorrencias
-- Tipo: VARCHAR(1) - aceita 'S' ou NULL
-- Default: NULL (para ocorrências já existentes e do outro sistema)
ALTER TABLE ocorrencias 
ADD COLUMN adicionado_pelo_app VARCHAR(1) NULL 
COMMENT 'Indica se foi adicionado pelo app do motorista: S = Sim, NULL = Não';

-- ============================================
-- VERIFICAÇÃO (Opcional)
-- ============================================
-- Para verificar se a coluna foi criada corretamente:
-- DESCRIBE ocorrencias;

-- Para ver todas as ocorrências adicionadas pelo app:
-- SELECT * FROM ocorrencias WHERE adicionado_pelo_app = 'S';

-- ============================================
-- NOTA IMPORTANTE
-- ============================================
-- O backend (server.js) já foi atualizado para inserir 'S' 
-- automaticamente quando uma ocorrência é criada pelo app do motorista.
-- Ocorrências criadas por outros sistemas devem deixar este campo como NULL.

