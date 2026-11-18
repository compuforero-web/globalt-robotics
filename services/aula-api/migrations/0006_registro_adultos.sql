-- Registro de adultos: documentos consultables por versión, autorizaciones con evidencia, verificación de correo
-- y recuperación de contraseña con enlaces de un solo uso.
-- Solo AÑADE columnas (con valor por defecto) y tablas: cuentas, sesiones, inscripciones, borradores y progreso
-- existentes no cambian, y una API anterior sigue funcionando con esta base (vuelta atrás sin restaurar).
-- Las cuentas existentes NO reciben autorizaciones, verificación de correo ni declaración de mayoría de edad
-- retroactivas: quedan con origen «anterior» y aceptan los documentos vigentes en su próximo acceso.

ALTER TABLE usuarios ADD COLUMN origen TEXT NOT NULL DEFAULT 'anterior'
  CHECK (origen IN ('anterior', 'consola', 'registro'));
ALTER TABLE usuarios ALTER COLUMN origen SET DEFAULT 'consola';    -- altas nuevas por consola
ALTER TABLE usuarios ADD COLUMN correo_verificado_en TIMESTAMPTZ;   -- enlace abierto (registro o recuperación)
ALTER TABLE usuarios ADD COLUMN mayor_edad_declarada_en TIMESTAMPTZ; -- declaración expresa al registrarse

-- Texto exacto de cada versión de los términos de uso y de la autorización de tratamiento de datos.
-- «prueba»: texto provisional, solo válido con AULA_PERMITIR_TEXTOS_PRUEBA=true (nunca en producción).
-- Una versión cargada no se modifica ni se borra (solo puede pasar a vigente): la evidencia remite a ella.
CREATE TABLE documentos_legales (
  id            BIGSERIAL PRIMARY KEY,
  tipo          TEXT NOT NULL CHECK (tipo IN ('terminos', 'datos')),
  version       TEXT NOT NULL CHECK (version ~ '^[A-Za-z0-9][A-Za-z0-9.-]{0,39}$'),
  titulo        TEXT NOT NULL CHECK (length(titulo) BETWEEN 3 AND 200),
  finalidad     TEXT NOT NULL CHECK (length(finalidad) BETWEEN 3 AND 1000),
  texto         TEXT NOT NULL CHECK (length(texto) BETWEEN 20 AND 200000),
  sha256        TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  estado        TEXT NOT NULL CHECK (estado IN ('prueba', 'aprobado')),
  cargado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  vigente_desde TIMESTAMPTZ,
  UNIQUE (tipo, version)
);

CREATE FUNCTION documentos_legales_inmutables() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las versiones de los documentos no se borran.';
  END IF;
  IF (NEW.tipo, NEW.version, NEW.titulo, NEW.finalidad, NEW.texto, NEW.sha256, NEW.estado, NEW.cargado_en)
     IS DISTINCT FROM (OLD.tipo, OLD.version, OLD.titulo, OLD.finalidad, OLD.texto, OLD.sha256, OLD.estado, OLD.cargado_en) THEN
    RAISE EXCEPTION 'El texto de una versión cargada no se modifica: carga una versión nueva.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER documentos_legales_inmutables BEFORE UPDATE OR DELETE ON documentos_legales
  FOR EACH ROW EXECUTE FUNCTION documentos_legales_inmutables();

-- Evidencia: qué cuenta aceptó qué versión exacta (id + huella del texto), con qué finalidad, cuándo y por qué vía.
-- Solo se añaden filas. Si se elimina la cuenta, su evidencia se elimina con ella (decisión pendiente de revisión legal).
CREATE TABLE autorizaciones (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  documento_id  BIGINT NOT NULL REFERENCES documentos_legales(id),
  tipo          TEXT NOT NULL CHECK (tipo IN ('terminos', 'datos')),
  version       TEXT NOT NULL,
  sha256        TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  finalidad     TEXT NOT NULL,
  aceptada_en   TIMESTAMPTZ NOT NULL,          -- momento de la acción expresa (envío del formulario)
  registrada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  via           TEXT NOT NULL CHECK (via IN ('registro', 'cuenta-existente')),
  UNIQUE (usuario_id, documento_id)
);
CREATE FUNCTION autorizaciones_solo_anadir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La evidencia de autorizaciones no se modifica.';
END $$;
CREATE TRIGGER autorizaciones_solo_anadir BEFORE UPDATE ON autorizaciones
  FOR EACH ROW EXECUTE FUNCTION autorizaciones_solo_anadir();

-- Alta pendiente de confirmar el correo. La cuenta solo se crea al abrir el enlace (y escribir la contraseña):
-- quien registre un correo ajeno no obtiene una cuenta sobre él. Se borran a los 7 días.
CREATE TABLE registros_pendientes (
  id            BIGSERIAL PRIMARY KEY,
  correo        TEXT NOT NULL CHECK (correo = lower(correo) AND length(correo) BETWEEN 3 AND 254),
  nombre        TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 60),
  hash_clave    TEXT NOT NULL CHECK (hash_clave LIKE '$argon2id$%'),
  terminos_id   BIGINT NOT NULL REFERENCES documentos_legales(id),
  datos_id      BIGINT NOT NULL REFERENCES documentos_legales(id),
  curso_id      TEXT REFERENCES cursos(id),    -- curso elegido, solo para volver a él
  token_hash    BYTEA NOT NULL UNIQUE CHECK (length(token_hash) = 32),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),   -- momento de la aceptación expresa
  expira_en     TIMESTAMPTZ NOT NULL,
  usado_en      TIMESTAMPTZ
);
CREATE INDEX registros_pendientes_correo ON registros_pendientes (correo);

-- Enlaces de recuperación de contraseña (solo la huella SHA-256 del token).
CREATE TABLE enlaces_recuperacion (
  token_hash    BYTEA PRIMARY KEY CHECK (length(token_hash) = 32),
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en     TIMESTAMPTZ NOT NULL,
  usado_en      TIMESTAMPTZ
);
CREATE INDEX enlaces_recuperacion_usuario ON enlaces_recuperacion (usuario_id);

-- Límites de envío de correos (por dirección e IP) y de intentos con enlaces.
ALTER TABLE intentos DROP CONSTRAINT intentos_tipo_check;
ALTER TABLE intentos ADD CONSTRAINT intentos_tipo_check
  CHECK (tipo IN ('acceso_correo', 'acceso_ip', 'registro_ip', 'correo_envio', 'correo_ip', 'enlace_ip'));
