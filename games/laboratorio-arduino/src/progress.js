// Progreso de demostración guardado solo en este navegador (localStorage). Sin cuentas ni datos personales.
const KEY = 'globalt.laboratorio.arduino.v1';

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    return data && typeof data === 'object' && data.lessons && typeof data.lessons === 'object' ? data : { lessons: {} };
  } catch {
    return { lessons: {} };
  }
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function getLesson(id) {
  const lesson = read().lessons[id];
  return lesson && typeof lesson === 'object' ? lesson : {};
}

function update(id, changes) {
  const data = read();
  data.lessons[id] = { ...getLesson(id), ...changes };
  return write(data);
}

/** Guarda el código del editor. Devuelve false si el navegador no permite guardar. */
export function saveCode(id, code) {
  return update(id, { code: String(code).slice(0, 32 * 1024), savedAt: new Date().toISOString() });
}

/** Copia de respaldo del código de este navegador antes de sustituirlo por la versión de la cuenta. */
export function saveBackup(id, code) {
  return update(id, { backupCode: String(code).slice(0, 32 * 1024), backupAt: new Date().toISOString() });
}

/** Registra un reto superado (solo tras una evaluación correcta). */
export function markCompleted(id, code) {
  const now = new Date().toISOString();
  return update(id, { completedAt: getLesson(id).completedAt || now, passedCode: String(code).slice(0, 32 * 1024), lastPassAt: now });
}

export function recordAttempt(id) { return update(id, { attempts: (Number(getLesson(id).attempts) || 0) + 1 }); }

/** Borra el código guardado (restaurar ejemplo). Conserva el registro de reto superado. */
export function clearCode(id) {
  const { code, savedAt, ...rest } = getLesson(id);
  const data = read();
  data.lessons[id] = rest;
  return write(data);
}
