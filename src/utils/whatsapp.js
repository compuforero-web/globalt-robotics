import { CONFIG } from '../config.js';

let number = CONFIG.WHATSAPP_NUMBER;
export const setWhatsAppNumber = (n) => { if (n) number = String(n).replace(/\D/g, ''); };

export const waLink = (message) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

export const waMsg = {
  access: 'Hola, quiero solicitar una cuenta para acceder al curso de Arduino en GLOBALT ROBOTICS.',
  general: 'Hola, me interesa información sobre GLOBALT ROBOTICS',
  workshops: 'Hola, me interesa información sobre los talleres de GLOBALT ROBOTICS',
  workshop: (t) => `Hola, me interesa información sobre el taller "${t}" de GLOBALT ROBOTICS. ¿Me pueden enviar fechas y precios?`,
  course: (t) => `Hola, quiero inscribirme o recibir información del curso "${t}" de GLOBALT ROBOTICS`,
  games: 'Hola, quiero llevar los juegos y simuladores de robótica de GLOBALT ROBOTICS a mi colegio',
  ai: 'Hola, me interesa la ruta de Inteligencia Artificial de GLOBALT ROBOTICS',
  programming: 'Hola, me interesa la ruta "Aprende a Programar" de GLOBALT ROBOTICS',
  videos: 'Hola, vi los videotutoriales de GLOBALT ROBOTICS y quiero más información',
};
