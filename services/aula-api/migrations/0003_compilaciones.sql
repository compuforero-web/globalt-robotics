-- Registro mínimo de peticiones de compilación para limitar el uso por estudiante.
-- Se cuenta por usuario (no por sesión): cambiar de sesión no reinicia el límite.
-- No guarda código ni resultados y no aprueba ningún reto.
CREATE TABLE compilaciones (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX compilaciones_usuario_fecha ON compilaciones (usuario_id, creado_en);
