-- Calcula a média das notas de um jogo, arredondada para duas casas; retorna NULL se não houver avaliações.
CREATE OR REPLACE FUNCTION fn_media_jogo(p_id_jogo INTEGER)
RETURNS NUMERIC(4, 2)
LANGUAGE SQL
STABLE
AS $$
    SELECT ROUND(AVG(a.nota), 2)::NUMERIC(4, 2)
    FROM avaliacoes a
    WHERE a.fk_jogo = p_id_jogo;
$$;
