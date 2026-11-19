-- Sin fecha inventada para cuentas históricas. El primer uso autenticado inicia el reloj.
ALTER TABLE usuarios ADD COLUMN ultimo_acceso TIMESTAMPTZ;
CREATE TABLE avisos_inactividad (
    usuario_id BIGINT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    referencia UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    estado TEXT NOT NULL DEFAULT 'reservado'
        CHECK (estado IN ('reservado', 'enviado', 'fallido', 'acreditado')),
    acreditado_en TIMESTAMPTZ,
    CHECK ((estado = 'acreditado') = (acreditado_en IS NOT NULL))
);

-- También funciona si se vuelve a la imagen anterior de la API.
CREATE FUNCTION registrar_acceso_aula() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE usuarios SET ultimo_acceso = greatest(ultimo_acceso, NEW.ultimo_uso) WHERE id = NEW.usuario_id;
    DELETE FROM avisos_inactividad WHERE usuario_id = NEW.usuario_id;
    RETURN NEW;
END $$;
CREATE TRIGGER acceso_aula AFTER INSERT OR UPDATE OF ultimo_uso ON sesiones
    FOR EACH ROW EXECUTE FUNCTION registrar_acceso_aula();
