// Actualización única del catálogo local: el curso de Arduino abre el laboratorio interno.
// Solo cambia el enlace si sigue siendo el enlace externo original; respeta los demás cambios del panel.
import { CONFIG } from '../config.js';

const MARKER = `${CONFIG.STORAGE_PREFIX}courses_lab_arduino_20261116`;
const OLD_LINK = 'https://wokwi.com/projects/new/arduino-nano';
export const LAB_LINK = 'games/laboratorio-arduino/index.html';

export function migrateLocalCourses(items) {
  if (!Array.isArray(items)) return items;
  try {
    if (localStorage.getItem(MARKER)) return items;
  } catch { /* sin almacenamiento: se actualiza en memoria */ }
  const result = items.map((item) => (item?.id === 'course-arduino' && item.link === OLD_LINK ? { ...item, link: LAB_LINK } : item));
  try {
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}courses`, JSON.stringify(result));
    localStorage.setItem(MARKER, '1');
  } catch { /* el catálogo actualizado se usa en memoria */ }
  return result;
}
