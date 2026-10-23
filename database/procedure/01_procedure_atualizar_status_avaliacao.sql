-- Atualiza o status de uma avaliação pelo ID; rejeita status vazio e avaliações inexistentes.
CREATE OR REPLACE PROCEDURE pr_atualizar_status_avaliacao(
    p_id_avaliacao INTEGER,
    p_status VARCHAR(20)
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_status IS NULL OR BTRIM(p_status) = '' THEN
        RAISE EXCEPTION 'O status da avaliacao e obrigatorio';
    END IF;

    UPDATE avaliacoes
    SET status = BTRIM(p_status)
    WHERE id_avaliacao = p_id_avaliacao;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Avaliacao % nao encontrada', p_id_avaliacao;
    END IF;
END;
$$;
