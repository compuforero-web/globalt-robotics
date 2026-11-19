-- Política de tratamiento de datos completa como tercer documento versionado (docs/AULA_REGISTRO_ADULTOS.md).
-- Se lee antes de registrarse; su versión exacta queda en la evidencia junto con la autorización de datos.
-- Solo amplía los tipos admitidos y añade una columna opcional: no cambia filas existentes.
ALTER TABLE documentos_legales DROP CONSTRAINT documentos_legales_tipo_check;
ALTER TABLE documentos_legales ADD CONSTRAINT documentos_legales_tipo_check CHECK (tipo IN ('terminos', 'datos', 'politica'));
ALTER TABLE autorizaciones DROP CONSTRAINT autorizaciones_tipo_check;
ALTER TABLE autorizaciones ADD CONSTRAINT autorizaciones_tipo_check CHECK (tipo IN ('terminos', 'datos', 'politica'));
-- Nula en las altas pendientes anteriores a esta migración: al verificarlas, la política vigente queda pendiente
-- y se acepta en el primer acceso, como en cualquier cuenta existente.
ALTER TABLE registros_pendientes ADD COLUMN politica_id BIGINT REFERENCES documentos_legales(id);
