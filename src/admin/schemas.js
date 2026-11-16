// Definición de los formularios CRUD. Agregar un campo aquí lo agrega al panel.
const GAME_LEVELS = ['Básico', 'Intermedio', 'Proyecto Final'];
const COURSE_LEVELS = ['Básico', 'Intermedio', 'Avanzado'];
const ICONS = ['code', 'chip', 'blocks', 'terminal', 'brain', 'spark', 'bolt', 'eye', 'robot', 'book'];

export const SCHEMAS = {
  games: {
    title: 'Gestor de Juegos', singular: 'juego',
    intro: 'Publica simuladores HTML5, WebGL o Three.js. Sube la carpeta del juego a /games/ y pega su ruta, o usa una URL externa.',
    columns: [
      { key: 'title', label: 'Título' },
      { key: 'level', label: 'Nivel', type: 'tag' },
      { key: 'category', label: 'Categoría' },
      { key: 'featured', label: 'Destacado', type: 'bool' },
    ],
    fields: [
      { name: 'title', label: 'Título', required: true },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'category', label: 'Categoría', placeholder: 'Arduino, Sensores, Lógica…' },
      { name: 'level', label: 'Dificultad', type: 'select', options: GAME_LEVELS },
      { name: 'url', label: 'URL o ruta del juego', placeholder: 'games/mi-juego/index.html o https://…', help: 'Déjalo vacío para mostrarlo como "Próximamente".' },
      { name: 'preview', label: 'Imagen de vista previa (opcional)', placeholder: 'assets/img/mi-juego.svg', help: 'Si no hay imagen se genera una ilustración automática.' },
      { name: 'featured', label: 'Marcar como destacado', type: 'checkbox' },
      { name: 'sort_order', label: 'Orden', type: 'number' },
    ],
  },
  courses: {
    title: 'Gestor de Cursos', singular: 'curso',
    intro: 'Cursos de la ruta "Aprende a Programar" y de la ruta de Inteligencia Artificial.',
    columns: [
      { key: 'title', label: 'Título' },
      { key: 'track', label: 'Ruta', type: 'tag', map: { programacion: 'Programación', ia: 'IA' } },
      { key: 'level', label: 'Nivel' },
      { key: 'duration', label: 'Duración' },
    ],
    fields: [
      { name: 'track', label: 'Ruta', type: 'select', options: [['programacion', 'Aprende a Programar'], ['ia', 'Inteligencia Artificial']] },
      { name: 'title', label: 'Título del curso', required: true },
      { name: 'category', label: 'Categoría', placeholder: 'Arduino, Python, Prompts…' },
      { name: 'level', label: 'Nivel', type: 'select', options: COURSE_LEVELS },
      { name: 'duration', label: 'Duración', placeholder: '12 horas' },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'topics', label: 'Módulos / temario', type: 'list', help: 'Un tema por línea.' },
      { name: 'link', label: 'Enlace de acceso o material', placeholder: 'https://…', help: 'Si queda vacío, solo se muestra el botón de inscripción por WhatsApp.' },
      { name: 'icon', label: 'Icono', type: 'select', options: ICONS },
      { name: 'sort_order', label: 'Orden', type: 'number' },
    ],
  },
  tutorials: {
    title: 'Gestor de Videotutoriales', singular: 'video',
    intro: 'Pega cualquier enlace de YouTube (watch, youtu.be, shorts). El ID y la miniatura se detectan solos.',
    columns: [
      { key: 'youtube_id', label: 'Miniatura', type: 'thumb' },
      { key: 'title', label: 'Título' },
      { key: 'category', label: 'Categoría', type: 'tag' },
    ],
    fields: [
      { name: 'youtube_url', label: 'Enlace de YouTube', type: 'youtube', placeholder: 'https://www.youtube.com/watch?v=…' },
      { name: 'youtube_id', label: 'ID del video (automático)', readonly: true },
      { name: 'title', label: 'Título', required: true },
      { name: 'category', label: 'Categoría', placeholder: 'Arduino, Scratch, Python, IA…' },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'sort_order', label: 'Orden', type: 'number' },
    ],
  },
  workshops: {
    title: 'Gestor de Talleres', singular: 'taller',
    intro: 'Talleres vacacionales, clubes escolares, capacitaciones y asesorías. Edita fechas y precios cuando quieras.',
    columns: [
      { key: 'title', label: 'Taller' },
      { key: 'type', label: 'Modalidad', type: 'tag' },
      { key: 'dates', label: 'Fechas' },
      { key: 'price', label: 'Precio' },
      { key: 'active', label: 'Visible', type: 'bool' },
    ],
    fields: [
      { name: 'title', label: 'Nombre del taller', required: true },
      { name: 'type', label: 'Modalidad', type: 'select', options: ['Presencial', 'Virtual', 'Híbrido'] },
      { name: 'audience', label: 'Dirigido a', placeholder: 'Estudiantes de 6° a 11°' },
      { name: 'dates', label: 'Fechas', placeholder: '15 al 19 de diciembre de 2026' },
      { name: 'price', label: 'Precio', placeholder: '$250.000 COP o "Consultar"' },
      { name: 'description', label: 'Descripción', type: 'textarea' },
      { name: 'active', label: 'Visible en la web', type: 'checkbox', default: true },
      { name: 'sort_order', label: 'Orden', type: 'number' },
    ],
  },
};
