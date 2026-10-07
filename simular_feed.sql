-- Limpar conquistas antigas para teste (Opcional, se quiser limpar o feed)
-- DELETE FROM user_badges;

-- Simular conquistas RECENTES de outros motoristas para aparecer no feed
-- OBS: O campo motorista_id deve existir na tabela login.

-- Edinilson (000005) ganhou 'Madrugador' hoje
INSERT INTO user_badges (motorista_id, badge_id, conquistado_em) 
VALUES ('000005', 1, NOW());

-- Cleano (000009) ganhou 'Rei da Rota' há 1 hora
INSERT INTO user_badges (motorista_id, badge_id, conquistado_em) 
VALUES ('000009', 3, DATE_SUB(NOW(), INTERVAL 1 HOUR));

-- Alex (077) ganhou 'Flash' há 2 horas
INSERT INTO user_badges (motorista_id, badge_id, conquistado_em) 
VALUES ('077', 2, DATE_SUB(NOW(), INTERVAL 2 HOUR));

-- Janilson (028) ganhou 'Motorista Exemplar' há 1 dia
INSERT INTO user_badges (motorista_id, badge_id, conquistado_em) 
VALUES ('028', 4, DATE_SUB(NOW(), INTERVAL 1 DAY));
