// Catálogo inicial precargado. Se usa en modo local y como respaldo si Supabase falla.
// Todo esto se puede editar desde /admin sin tocar código.
const games = [
  {
    id: 'game-robolab-arduino', sort_order: 1, featured: true,
    title: 'RoboLab Arduino',
    description: 'Explora Arduino Nano, conecta un LED, controla un microservo, mide distancias con el HC-SR04 y construye un robot evasor con puente H L298N. 5 niveles interactivos.',
    category: 'Arduino', level: 'Básico',
    url: 'games/robolab-arduino/index.html',
    preview: 'assets/img/games/robolab-photo-v1.webp',
  },
  {
      "id": "game-codicamp-agrotech",
      "sort_order": 2,
      "featured": true,
      "title": "CodiCamp AgroTech 3D",
      "description": "Programa por bloques, guía tu robot por escenarios agrícolas y supera 20 niveles en dos fases. Incluye estrellas, personajes y registro de progreso en este navegador.",
      "category": "Programación por bloques",
      "level": "Básico",
      "url": "games/codicamp-agrotech/index.html",
      "preview": "assets/img/games/codicamp-photo-v1.webp"
  },
  {
    id: 'game-sensor-ultrasonico', sort_order: 3, featured: false,
    title: 'Radar Ultrasónico',
    description: 'Domina el HC-SR04 en 5 retos: física del eco, calibración, reversa con alertas, radar con microservo SG90 y robot evasor. Incluye código Arduino en vivo y progreso local.',
    category: 'Sensores', level: 'Intermedio',
    url: 'games/radar-ultrasonico/index.html', preview: 'assets/img/games/radar-photo-v1.webp',
  },
  {
    id: 'game-sumo-bot', sort_order: 4, featured: false,
    title: 'Sumo Bot Challenge',
    description: 'Diseña la estrategia de un robot de sumo en 5 retos: borde con TCRT5000, detección con HC-SR04, velocidad PWM y duelos. Ajusta parámetros y observa el código Arduino Nano con L298N en vivo.',
    category: 'Proyecto', level: 'Proyecto Final',
    url: 'games/sumo-bot-challenge/index.html', preview: 'assets/img/games/sumo-photo-v1.webp',
  },
  {
      "id": "game-solarlab",
      "sort_order": 5,
      "featured": false,
      "title": "SolarLab: Ingeniería Fotovoltaica",
      "description": "Explora energía solar en 5 retos: inclinación del panel, conexiones serie/paralelo, baterías y MPPT, seguidor con LDR y diseño de una microrred. Incluye gráficas y código Arduino para el seguidor.",
      "category": "Energías limpias",
      "level": "Intermedio",
      "url": "games/solar-lab/index.html",
      "preview": "assets/img/games/solar-photo-v1.webp"
  },
];

const courses = [
  {
    id: 'course-scratch', sort_order: 1, track: 'programacion', icon: 'blocks',
    title: 'Lógica con Bloques (Scratch)', category: 'Lógica', level: 'Básico', duration: '8 horas',
    description: 'Pensamiento computacional desde cero: secuencias, ciclos, condicionales y eventos creando juegos y animaciones.',
    topics: ['Secuencias y algoritmos', 'Ciclos y repeticiones', 'Condicionales y sensores', 'Variables y puntaje', 'Mini proyecto: videojuego propio'],
    link: 'https://scratch.mit.edu/',
  },
  {
    id: 'course-arduino', sort_order: 2, track: 'programacion', icon: 'chip',
    title: 'Electrónica y C++ con Arduino', category: 'Arduino', level: 'Intermedio', duration: '16 horas',
    description: 'Del LED al robot móvil: Arduino Nano, servomotores, sensor ultrasónico y control de motores con puente H.',
    topics: ['Arduino Nano y protoboard', 'Entradas/salidas digitales y PWM', 'Servomotores (librería Servo)', 'Sensor ultrasónico HC-SR04', 'Puente H L298N y motores DC', 'Proyecto: robot evasor de obstáculos'],
    link: 'games/laboratorio-arduino/index.html',
  },
  {
    id: 'course-web', sort_order: 3, track: 'programacion', icon: 'code',
    title: 'Desarrollo Web (HTML, CSS y JS)', category: 'Web', level: 'Intermedio', duration: '20 horas',
    description: 'Construye y publica tu primera página web interactiva con las tecnologías estándar de internet.',
    topics: ['Estructura con HTML5 semántico', 'Diseño con CSS y Flexbox/Grid', 'Diseño responsivo para móvil', 'JavaScript: eventos y DOM', 'Publicación gratuita en Netlify'],
    link: 'https://developer.mozilla.org/es/docs/Learn',
  },
  {
    id: 'course-python', sort_order: 4, track: 'programacion', icon: 'terminal',
    title: 'Python desde Cero', category: 'Python', level: 'Básico', duration: '16 horas',
    description: 'El lenguaje más usado en ciencia de datos e IA, explicado paso a paso con retos prácticos.',
    topics: ['Variables, tipos y operadores', 'Condicionales y ciclos', 'Funciones y listas', 'Archivos y librerías', 'Proyecto: asistente de consola'],
    link: 'https://www.python.org/about/gettingstarted/',
  },
  {
    id: 'course-ia-fundamentos', sort_order: 5, track: 'ia', icon: 'brain',
    title: 'Fundamentos de IA y Machine Learning', category: 'Fundamentos', level: 'Básico', duration: '10 horas',
    description: 'Qué es (y qué no es) la inteligencia artificial. Entrena tu primer modelo sin escribir código.',
    topics: ['Historia y tipos de IA', 'Datos, entrenamiento y predicción', 'Clasificación de imágenes y sonidos', 'Sesgos y uso ético', 'Práctica con Teachable Machine'],
    link: 'https://teachablemachine.withgoogle.com/',
  },
  {
    id: 'course-ia-prompts', sort_order: 6, track: 'ia', icon: 'spark',
    title: 'Ingeniería de Prompts Efectiva', category: 'Prompts', level: 'Básico', duration: '6 horas',
    description: 'Aprende a pedirle a la IA exactamente lo que necesitas: estructura, contexto, ejemplos y verificación.',
    topics: ['Anatomía de un buen prompt', 'Rol, contexto y formato de salida', 'Ejemplos (few-shot) y razonamiento paso a paso', 'Prompts para docentes y estudiantes', 'Verificación y pensamiento crítico'],
    link: '',
  },
  {
    id: 'course-ia-agentes', sort_order: 7, track: 'ia', icon: 'bolt',
    title: 'Automatización y Agentes IA', category: 'Agentes', level: 'Intermedio', duration: '12 horas',
    description: 'Agentes de IA y automatizaciones para educación y productividad: menos tareas repetitivas, más tiempo para enseñar.',
    topics: ['Qué es un agente de IA', 'Automatizar correos, formularios y reportes', 'Asistentes para planeación de clases', 'Flujos sin código', 'Proyecto: tu asistente personal'],
    link: '',
  },
  {
    id: 'course-ia-vision', sort_order: 8, track: 'ia', icon: 'eye',
    title: 'Visión Artificial para Robótica', category: 'Visión', level: 'Avanzado', duration: '14 horas',
    description: 'Robots que ven: detección de colores, rostros y objetos para tomar decisiones en tiempo real.',
    topics: ['Cómo "ve" una computadora', 'Python + OpenCV: colores y contornos', 'Modelos preentrenados de detección', 'Comunicación cámara → Arduino', 'Proyecto: robot seguidor de objetos'],
    link: 'https://docs.opencv.org/4.x/d6/d00/tutorial_py_root.html',
  },
];

// Pega los enlaces de YouTube desde /admin → Videotutoriales.
const tutorials = [
  { id: 'tut-1', sort_order: 1, title: 'Tu primer LED con Arduino Nano', category: 'Arduino', youtube_url: '', youtube_id: '', description: 'Conexión, código Blink y primeros pasos con el IDE de Arduino.' },
  { id: 'tut-2', sort_order: 2, title: 'Servomotor paso a paso', category: 'Arduino', youtube_url: '', youtube_id: '', description: 'Controla ángulos con la librería Servo.' },
  { id: 'tut-3', sort_order: 3, title: 'Scratch: tu primer videojuego', category: 'Scratch', youtube_url: '', youtube_id: '', description: 'Eventos, movimiento y puntaje en 20 minutos.' },
  { id: 'tut-4', sort_order: 4, title: 'Prompts que sí funcionan', category: 'IA', youtube_url: '', youtube_id: '', description: 'Estructura básica para obtener mejores respuestas de la IA.' },
];

const workshops = [
  {
    id: 'ws-vacacional', sort_order: 1, active: true, type: 'Presencial',
    title: 'Talleres Vacacionales de Robótica', audience: 'Niños y jóvenes de 7 a 17 años',
    dates: 'Diciembre 2026 – Enero 2027', price: 'Consultar por WhatsApp',
    description: 'Una semana construyendo y programando robots reales. Cada participante termina con su propio proyecto funcionando.',
  },
  {
    id: 'ws-club', sort_order: 2, active: true, type: 'Presencial',
    title: 'Clubes de Robótica Escolar', audience: 'Colegios: grados 1° a 11°',
    dates: 'Durante todo el año escolar', price: 'Cotización por institución',
    description: 'Programa extracurricular por niveles: bloques, Arduino, Python e IA, con material adaptado a cada grado.',
  },
  {
    id: 'ws-docentes', sort_order: 3, active: true, type: 'Virtual',
    title: 'Capacitación Docente en IA y Robótica', audience: 'Docentes y directivos',
    dates: 'Grupos mensuales', price: 'Consultar por WhatsApp',
    description: 'Integra la IA y la robótica en el aula con estrategias prácticas, prompts para planeación y proyectos interdisciplinarios.',
  },
  {
    id: 'ws-asesoria', sort_order: 4, active: true, type: 'Híbrido',
    title: 'Asesorías Técnicas y Proyectos', audience: 'Estudiantes, ferias de ciencia y emprendedores',
    dates: 'Con cita previa', price: 'Según el proyecto',
    description: 'Acompañamiento en proyectos de grado, ferias de ciencia, prototipos con Arduino y automatización.',
  },
];

const settings = {
  banner_active: true,
  banner_text: '🚀 Inscripciones abiertas: Talleres vacacionales de robótica diciembre 2026',
  banner_cta: 'Inscribirme',
  whatsapp_number: '573144864187',
  whatsapp_default_message: 'Hola, me interesa información sobre GLOBALT ROBOTICS',
  location: 'La Mesa, Cundinamarca, Colombia',
  founder: 'Ing. Edwin Hernando Gómez Forero',
  email: '',
};

export const SEED = { games, courses, tutorials, workshops, settings };
