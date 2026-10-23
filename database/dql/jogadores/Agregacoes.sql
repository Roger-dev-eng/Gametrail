-- Conta o total de registros.
SELECT COUNT(*) AS total
FROM jogadores;

-- Conta jogadores por jogo, mostrando apenas jogos com jogadores.
SELECT j.nome as jogo_nome, COUNT(jg.id_jogador) AS total_jogadores
FROM jogos j
INNER JOIN jogadores jg ON j.id_jogo = jg.fk_jogo
GROUP BY j.id_jogo, j.nome;
