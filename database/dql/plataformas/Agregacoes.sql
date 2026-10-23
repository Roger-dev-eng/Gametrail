-- Conta o total de registros.
SELECT COUNT(*) AS total
FROM plataformas;

-- Calcula a média de horas jogadas nas plataformas.
SELECT AVG(horas_jogadas) AS media_horas_jogadas
FROM plataformas;

-- Soma as horas das plataformas de cada jogador.
SELECT jg.id_jogador, jg.nickname, SUM(horas_jogadas) AS total_horas
FROM plataformas p
INNER JOIN jogadores jg ON p.fk_jogador = jg.id_jogador
GROUP BY jg.id_jogador, jg.nickname;
