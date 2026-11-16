// Progreso del estudiante guardado solo en localStorage (sin red, sin datos personales).
const KEY = 'robolab.progress.v1';
export const TOTAL_LEVELS = 5;

const defaults = () => ({ unlocked: 1, completed: [] });

function safeRead() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const data = JSON.parse(raw);
    const unlocked = Math.min(Math.max(Number(data.unlocked) || 1, 1), TOTAL_LEVELS);
    const completed = Array.isArray(data.completed) ? data.completed.filter(Number.isInteger) : [];
    return { unlocked, completed };
  } catch {
    return defaults();
  }
}

function safeWrite(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* modo privado: se ignora */ }
}

export function getProgress() { return safeRead(); }

export function isUnlocked(level) { return level <= safeRead().unlocked; }

export function isCompleted(level) { return safeRead().completed.includes(level); }

/** Marca un nivel como superado y desbloquea el siguiente. */
export function completeLevel(level) {
  const p = safeRead();
  if (!p.completed.includes(level)) p.completed.push(level);
  p.unlocked = Math.min(Math.max(p.unlocked, level + 1), TOTAL_LEVELS);
  safeWrite(p);
  return p;
}

export function resetProgress() { safeWrite(defaults()); }
