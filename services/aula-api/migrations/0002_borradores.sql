-- Borrador de código por estudiante y lección (Laboratorio Arduino).
-- Guardar un borrador no aprueba ningún reto: esta tabla no registra evaluaciones.
CREATE TABLE borradores (
  usuario_id      BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  leccion_id      TEXT NOT NULL CHECK (leccion_id ~ '^[a-z0-9-]{3,60}$'),
  codigo          TEXT NOT NULL CHECK (length(codigo) <= 12000),
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, leccion_id)
);
