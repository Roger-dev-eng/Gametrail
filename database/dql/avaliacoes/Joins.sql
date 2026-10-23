-- Relaciona avaliações aos jogadores, jogos e gêneros.
SELECT a.id_avaliacao, a.nota, a.comentario, a.status, jg.nickname, j.nome AS jogo_nome, j.genero
FROM avaliacoes a
INNER JOIN jogadores jg ON a.fk_jogador = jg.id_jogador
INNER JOIN jogos j ON a.fk_jogo = j.id_jogo;
