-- Aula GLOBALT: estudiantes, sesiones de servidor, cursos e inscripciones.
CREATE TABLE usuarios (
  id            BIGSERIAL PRIMARY KEY,
  correo        TEXT NOT NULL CHECK (correo = lower(correo) AND length(correo) BETWEEN 3 AND 254),
  nombre        TEXT NOT NULL CHECK (length(nombre) BETWEEN 2 AND 60),
  hash_clave    TEXT NOT NULL CHECK (hash_clave LIKE '$argon2id$%'),
  rol           TEXT NOT NULL DEFAULT 'estudiante' CHECK (rol IN ('estudiante', 'administrador')),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_correo_unico ON usuarios (correo);

-- Solo se guarda el SHA-256 del token de sesión (el token real vive en la cookie HttpOnly).
-- El token CSRF no autentica por sí solo: se guarda tal cual para devolverlo al titular de la sesión.
CREATE TABLE sesiones (
  id_hash       BYTEA PRIMARY KEY CHECK (length(id_hash) = 32),
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  csrf          TEXT NOT NULL CHECK (length(csrf) >= 32),
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en     TIMESTAMPTZ NOT NULL,
  revocada_en   TIMESTAMPTZ
);
CREATE INDEX sesiones_usuario ON sesiones (usuario_id);

CREATE TABLE cursos (
  id              TEXT PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{3,60}$'),
  titulo          TEXT NOT NULL,
  ruta_laboratorio TEXT,
  activo          BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE inscripciones (
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  curso_id    TEXT NOT NULL REFERENCES cursos(id),
  creada_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, curso_id)
);

-- Intentos de acceso y registro para limitar abusos (clave = SHA-256 de correo o IP).
CREATE TABLE intentos (
  id        BIGSERIAL PRIMARY KEY,
  tipo      TEXT NOT NULL CHECK (tipo IN ('acceso_correo', 'acceso_ip', 'registro_ip')),
  clave     BYTEA NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX intentos_busqueda ON intentos (tipo, clave, creado_en);

INSERT INTO cursos (id, titulo, ruta_laboratorio) VALUES
  ('course-arduino', 'Electrónica y C++ con Arduino', 'games/laboratorio-arduino/index.html');
