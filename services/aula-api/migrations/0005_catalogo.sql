-- Cursos públicos que admiten inscripción; las inscripciones previas se conservan.
INSERT INTO cursos (id, titulo, ruta_laboratorio) VALUES
  ('course-scratch', 'Lógica con Bloques (Scratch)', NULL),
  ('course-web', 'Desarrollo Web (HTML, CSS y JS)', 'games/laboratorio-web/index.html'),
  ('course-python', 'Python desde Cero', 'games/laboratorio-python/index.html'),
  ('course-ia-fundamentos', 'Fundamentos de IA y Machine Learning', NULL),
  ('course-ia-prompts', 'Ingeniería de Prompts Efectiva', NULL),
  ('course-ia-agentes', 'Automatización y Agentes IA', NULL),
  ('course-ia-vision', 'Visión Artificial para Robótica', NULL);
