// Extrae el ID de cualquier enlace de YouTube (watch, youtu.be, shorts, embed, live).
const PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/i,
  /(?:youtu\.be\/)([\w-]{11})/i,
  /(?:youtube(?:-nocookie)?\.com\/(?:embed|shorts|live|v)\/)([\w-]{11})/i,
];

export function getYouTubeId(url) {
  const value = String(url ?? '').trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  for (const re of PATTERNS) {
    const match = value.match(re);
    if (match) return match[1];
  }
  return '';
}

export const ytThumb = (id) => (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');
export const ytEmbed = (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
