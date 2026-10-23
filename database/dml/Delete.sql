-- Exclui um registro pelo ID de jogos.
-- $1: idJogo.
DELETE
FROM jogos
WHERE id_jogo = $1;

-- Exclui um registro pelo ID de jogadores.
-- $1: idJogador.
DELETE
FROM jogadores
WHERE id_jogador = $1;

-- Exclui um registro pelo ID de plataformas.
-- $1: idPlataforma.
DELETE
FROM plataformas
WHERE id_plataforma = $1;

-- Exclui um registro pelo ID de avaliacoes.
-- $1: idAvaliacao.
DELETE
FROM avaliacoes
WHERE id_avaliacao = $1;
