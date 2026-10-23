-- Conta o total de registros.
SELECT COUNT(*) AS total_jogo
FROM jogos;

-- Conta jogos agrupados por gênero.
SELECT genero, COUNT(*) AS total
FROM jogos
GROUP BY genero;

-- Conta jogos agrupados por ano de lançamento.
SELECT ano_lancamento, COUNT(*) AS total
FROM jogos
GROUP BY ano_lancamento;

-- Conta jogos agrupados por desenvolvedora.
SELECT desenvolvedora, COUNT(*) AS total
FROM jogos
GROUP BY desenvolvedora;

-- Lista jogos por quantidade de avaliações, incluindo a média das notas.
SELECT j.nome, COUNT(a.id_avaliacao) AS total_avaliacoes, AVG(a.nota) AS media_notas
FROM jogos j
LEFT JOIN avaliacoes a ON j.id_jogo = a.fk_jogo
GROUP BY j.id_jogo, j.nome
ORDER BY total_avaliacoes DESC;
