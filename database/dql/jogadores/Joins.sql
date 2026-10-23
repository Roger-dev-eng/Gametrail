-- Relaciona jogadores aos seus jogos, incluindo nickname e email.
SELECT jg.id_jogador, jg.nickname, jg.email, j.nome AS jogo_nome
FROM jogadores jg
INNER JOIN jogos j ON jg.fk_jogo = j.id_jogo;
