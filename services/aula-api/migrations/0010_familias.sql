CREATE TABLE alumnos (
    id BIGSERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    grado SMALLINT NOT NULL CHECK (grado BETWEEN 1 AND 11)
);

CREATE TABLE invitaciones_familia (
    alumno_id BIGINT NOT NULL REFERENCES alumnos ON DELETE CASCADE,
    correo TEXT NOT NULL,
    huella BYTEA NOT NULL UNIQUE,
    vence TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (alumno_id, correo)
);

CREATE TABLE familias (
    usuario_id BIGINT NOT NULL REFERENCES usuarios ON DELETE CASCADE,
    alumno_id BIGINT NOT NULL REFERENCES alumnos ON DELETE CASCADE,
    PRIMARY KEY (usuario_id, alumno_id)
);

CREATE TABLE actividades_alumno (
    alumno_id BIGINT NOT NULL REFERENCES alumnos ON DELETE CASCADE,
    fecha DATE NOT NULL,
    titulo TEXT NOT NULL,
    resultado TEXT NOT NULL,
    observacion TEXT NOT NULL,
    PRIMARY KEY (alumno_id, fecha, titulo)
);
