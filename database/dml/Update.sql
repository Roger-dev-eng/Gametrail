-- Atualiza um registro pelo ID em jogos.
-- $1: nome.
-- $2: anoLancamento.
-- $3: desenvolvedora.
-- $4: genero.
-- $5: idJogo.
UPDATE jogos
SET nome = $1, ano_lancamento = $2, desenvolvedora = $3, genero = $4
WHERE id_jogo = $5;

-- Atualiza um registro pelo ID em jogadores.
-- $1: nickname.
-- $2: email.
-- $3: fkJogo.
-- $4: idJogador.
UPDATE jogadores
SET nickname = $1, email = $2, fk_jogo = $3
WHERE id_jogador = $4;

-- Atualiza um registro pelo ID em plataformas.
-- $1: nome.
-- $2: horasJogadas.
-- $3: ultimaSessao.
-- $4: fkJogador.
-- $5: idPlataforma.
UPDATE plataformas
SET nome = $1, horas_jogadas = $2, ultima_sessao = $3, fk_jogador = $4
WHERE id_plataforma = $5;

-- Atualiza um registro pelo ID em avaliacoes.
-- $1: nota.
-- $2: comentario.
-- $3: status.
-- $4: dataAvaliacao.
-- $5: fkJogador.
-- $6: fkJogo.
-- $7: idAvaliacao.
UPDATE avaliacoes
SET nota = $1, comentario = $2, status = $3, data_avaliacao = $4, fk_jogador = $5, fk_jogo = $6
WHERE id_avaliacao = $7;
