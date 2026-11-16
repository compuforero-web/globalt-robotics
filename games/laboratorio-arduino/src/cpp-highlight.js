// Resaltado de sintaxis C++/Arduino mínimo y sin dependencias.
const KEYWORDS = new Set(('void int long short unsigned signed char float double bool boolean byte word const static '
  + 'volatile if else for while do switch case default break continue return struct class enum true false '
  + 'sizeof new delete public private auto String uint8_t uint16_t uint32_t int8_t int16_t int32_t size_t').split(' '));
const ARDUINO = new Set(('setup loop pinMode digitalWrite digitalRead analogWrite analogRead delay delayMicroseconds '
  + 'millis micros Serial begin print println available read write HIGH LOW INPUT OUTPUT INPUT_PULLUP '
  + 'LED_BUILTIN map constrain random randomSeed tone noTone').split(' '));

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(^[ \t]*#[^\n]*)|(\b(?:0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][-+]?\d+)?)[uUlLfF]*\b)|([A-Za-z_]\w*)/gm;

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Devuelve HTML con clases tok-* para el texto dado. */
export function highlightCpp(source) {
  let html = '';
  let last = 0;
  for (const m of source.matchAll(TOKEN)) {
    html += esc(source.slice(last, m.index));
    const [text, comment, string, directive, number, word] = m;
    let cls = '';
    if (comment) cls = 'com';
    else if (string) cls = 'str';
    else if (directive) cls = 'pre';
    else if (number) cls = 'num';
    else if (word && KEYWORDS.has(word)) cls = 'kw';
    else if (word && ARDUINO.has(word)) cls = 'fn';
    html += cls ? `<span class="tok-${cls}">${esc(text)}</span>` : esc(text);
    last = m.index + text.length;
  }
  return html + esc(source.slice(last));
}
