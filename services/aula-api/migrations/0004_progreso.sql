-- Progreso por estudiante y lección del Laboratorio Arduino (última visita, paso y reto superado).
-- DECLARATIVO: la evaluación del reto se ejecuta en el navegador del estudiante; el servidor solo guarda lo que
-- el laboratorio declara tras superar su evaluador. No sirve para certificados, notas ni permisos.
-- Solo añade una tabla: las versiones anteriores de la API la ignoran (vuelta atrás sin tocar la base).
CREATE TABLE progreso_lecciones (
  usuario_id     BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  leccion_id     TEXT NOT NULL CHECK (leccion_id ~ '^[a-z0-9-]{3,60}$'),
  paso           SMALLINT NOT NULL DEFAULT 0 CHECK (paso BETWEEN 0 AND 30),
  pasos_vistos   INTEGER NOT NULL DEFAULT 0 CHECK (pasos_vistos >= 0),   -- bit n = paso n visto
  visto_en       TIMESTAMPTZ NOT NULL DEFAULT now(),                     -- última visita declarada
  completada_en  TIMESTAMPTZ,                                            -- primera vez que se declaró superado
  superada_en    TIMESTAMPTZ,                                            -- última vez que se declaró superado
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, leccion_id),
  CHECK (superada_en IS NULL OR completada_en IS NOT NULL)
);
CREATE INDEX progreso_lecciones_ultima ON progreso_lecciones (usuario_id, visto_en DESC);
