-- Resume cada jogo com sua quantidade de avaliações e média das notas, incluindo jogos sem avaliações.
CREATE OR REPLACE VIEW vw_resumo_jogos AS
SELECT
    j.id_jogo,
    j.nome,
    j.ano_lancamento,
    j.desenvolvedora,
    j.genero,
    COUNT(a.id_avaliacao) AS quantidade_avaliacoes,
    COALESCE(ROUND(AVG(a.nota), 2), 0) AS media_nota
FROM jogos j
LEFT JOIN avaliacoes a ON a.fk_jogo = j.id_jogo
GROUP BY
    j.id_jogo,
    j.nome,
    j.ano_lancamento,
    j.desenvolvedora,
    j.genero;
