-- Constancia local de cada baja por inactividad, complementaria del registro externo (docs/AULA_INACTIVIDAD.md).
-- «pendiente» se confirma ANTES de anotar fuera; la transacción que borra la cuenta la pasa a «aplicada».
-- Solo datos técnicos: permite saber, en la base original, si una operación interrumpida llegó a borrar.
CREATE TABLE bajas_inactividad (
    operacion UUID PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aplicada', 'cancelada')),
    registrada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bajas_inactividad_cuenta ON bajas_inactividad (usuario_id, creado_en);

-- Una cuenta con aviso acreditado solo se borra si, en la misma transacción, su baja quedó «aplicada».
-- Así el procedimiento anterior (o una imagen antigua de la API) no puede saltarse el registro externo.
CREATE FUNCTION exigir_baja_registrada() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM avisos_inactividad WHERE usuario_id = OLD.id AND estado = 'acreditado')
       AND NOT EXISTS (SELECT 1 FROM bajas_inactividad
                       WHERE usuario_id = OLD.id AND creado_en = OLD.creado_en AND estado = 'aplicada') THEN
        RAISE EXCEPTION 'Baja por inactividad sin registro externo: use python -m app.inactividad eliminar';
    END IF;
    RETURN OLD;
END $$;
CREATE TRIGGER baja_registrada BEFORE DELETE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION exigir_baja_registrada();
