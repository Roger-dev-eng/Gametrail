-- Conta o total de registros.
SELECT COUNT(*) AS total
FROM avaliacoes;

-- Calcula a média geral das notas das avaliações.
SELECT AVG(nota) AS media_notas
FROM avaliacoes;

-- Calcula a média das notas e o total de avaliações por jogo.
SELECT j.nome AS jogo_nome, AVG(a.nota) AS media_notas, COUNT(a.id_avaliacao) AS total_avaliacoes
FROM avaliacoes a
INNER JOIN jogos j ON a.fk_jogo = j.id_jogo
GROUP BY j.id_jogo, j.nome
ORDER BY media_notas DESC;

-- Calcula a média das notas e o total de avaliações por jogador.
SELECT jg.nickname, AVG(a.nota) AS media_notas, COUNT(a.id_avaliacao) AS total_avaliacoes
FROM avaliacoes a
INNER JOIN jogadores jg ON a.fk_jogador = jg.id_jogador
GROUP BY jg.id_jogador, jg.nickname
ORDER BY media_notas DESC;

-- Conta quantas avaliações existem para cada nota.
SELECT nota, COUNT(*) AS quantidade
FROM avaliacoes
GROUP BY nota
ORDER BY nota;

-- Lista jogos por quantidade de avaliações, incluindo a média das notas.
SELECT j.nome AS jogo_nome, COUNT(a.id_avaliacao) AS total_avaliacoes, AVG(a.nota) AS media_notas
FROM jogos j
LEFT JOIN avaliacoes a ON j.id_jogo = a.fk_jogo
GROUP BY j.id_jogo, j.nome
HAVING COUNT(a.id_avaliacao) > 0
ORDER BY total_avaliacoes DESC, media_notas DESC;

-- Lista avaliações dos últimos dias informados, com jogo e jogador, da mais recente para a mais antiga.
-- $1: dias.
SELECT a.id_avaliacao, a.nota, j.nome AS jogo_nome, jg.nickname, a.data_avaliacao
FROM avaliacoes a
INNER JOIN jogos j ON a.fk_jogo = j.id_jogo
INNER JOIN jogadores jg ON a.fk_jogador = jg.id_jogador
WHERE a.data_avaliacao >= CURRENT_DATE - ($1 * INTERVAL '1 day')
ORDER BY a.data_avaliacao DESC;
