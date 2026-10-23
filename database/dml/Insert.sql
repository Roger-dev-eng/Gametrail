-- Insere um registro em jogos.
-- $1: nome.
-- $2: anoLancamento.
-- $3: desenvolvedora.
-- $4: genero.
INSERT INTO jogos (nome, ano_lancamento, desenvolvedora, genero)
VALUES ($1, $2, $3, $4);

-- Insere um registro em jogadores.
-- $1: nickname.
-- $2: email.
-- $3: fkJogo.
INSERT INTO jogadores (nickname, email, fk_jogo)
VALUES ($1, $2, $3);

-- Insere um registro em plataformas.
-- $1: nome.
-- $2: horasJogadas.
-- $3: ultimaSessao.
-- $4: fkJogador.
INSERT INTO plataformas (nome, horas_jogadas, ultima_sessao, fk_jogador)
VALUES ($1, $2, $3, $4);

-- Insere um registro em avaliacoes.
-- $1: nota.
-- $2: comentario.
-- $3: status.
-- $4: dataAvaliacao.
-- $5: fkJogador.
-- $6: fkJogo.
INSERT INTO avaliacoes (nota, comentario, status, data_avaliacao, fk_jogador, fk_jogo)
VALUES ($1, $2, $3, $4, $5, $6);
