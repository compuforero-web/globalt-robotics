// Datos educativos de la placa genérica "compatible Nano": pines y componentes.
export const PWM_PINS = [3, 5, 6, 9, 10, 11];

// Orden físico con el conector USB a la izquierda.
export const TOP_ROW = ['D13', '3V3', 'AREF', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', '5V', 'RST', 'GND', 'VIN'];
export const BOTTOM_ROW = ['D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'GND', 'RST', 'RX0', 'TX1'];

export const isPwm = (name) => /^D\d+$/.test(name) && PWM_PINS.includes(Number(name.slice(1)));

/** Texto corto que se dibuja junto al pin. */
export function pinLabel(name) {
  if (name === '3V3') return '3.3V';
  return isPwm(name) ? `${name}~` : name;
}

const PARTS = {
  usb: {
    title: 'Conector USB', tag: 'Alimentación + datos', kind: 'part', volt: '5 V desde el ordenador',
    text: 'Alimenta la placa con 5 V y transporta el programa y los mensajes del Monitor Serie. '
      + 'Un chip convertidor traduce USB a comunicación serie para el microcontrolador.',
  },
  mcu: {
    title: 'Microcontrolador ATmega328P', tag: 'El cerebro', kind: 'part', volt: 'Trabaja a 5 V · 16 MHz',
    text: 'Ejecuta tu programa: primero setup() una vez y luego loop() sin parar. '
      + 'Tiene 32 KB de memoria Flash para el código y 2 KB de RAM para las variables.',
  },
  reset: {
    title: 'Botón Reset', tag: 'Reinicio', kind: 'part', volt: 'Pone RST a 0 V al pulsarlo',
    text: 'Reinicia el programa desde setup(). No borra el código: solo vuelve a empezar, '
      + 'como apagar y encender la placa.',
  },
};

const POWER = {
  '5V': {
    title: 'Pin 5V', tag: 'Alimentación', kind: 'power', volt: 'Salida de 5 V regulados',
    text: 'Da energía a sensores y módulos (servo, HC-SR04…). Con USB, el límite total ronda los 500 mA: '
      + 'motores grandes necesitan su propia fuente.',
  },
  '3V3': {
    title: 'Pin 3.3V', tag: 'Alimentación', kind: 'power', volt: 'Salida de 3,3 V',
    text: 'Para módulos que funcionan a 3,3 V. Entrega muy poca corriente (unas decenas de mA), '
      + 'así que úsalo solo con componentes pequeños.',
  },
  VIN: {
    title: 'Pin VIN', tag: 'Entrada de energía', kind: 'power', volt: 'Entrada externa de 7 a 12 V',
    text: 'Aquí se conecta una batería o fuente externa sin regular. El regulador de la placa la '
      + 'convierte en 5 V. No le conectes más de 12 V.',
  },
  GND: {
    title: 'Pin GND (tierra)', tag: 'Referencia 0 V', kind: 'gnd', volt: '0 V',
    text: 'Es el "camino de vuelta" de la corriente: todo circuito debe cerrarse en GND. '
      + 'Si usas varias fuentes, sus GND deben estar unidos (GND común).',
  },
  RST: {
    title: 'Pin RST (Reset)', tag: 'Control', kind: 'ctrl', volt: 'Activo a 0 V (LOW)',
    text: 'Si lo conectas a GND, el programa se reinicia, igual que al pulsar el botón Reset.',
  },
  AREF: {
    title: 'Pin AREF', tag: 'Referencia analógica', kind: 'ctrl', volt: 'Máx. 5 V',
    text: 'Permite cambiar el voltaje máximo que mide analogRead(). Normalmente se deja sin conectar.',
  },
  RX0: {
    title: 'Pin RX0 (D0)', tag: 'Serie · recibir', kind: 'serial', volt: 'Señal digital 0 / 5 V',
    text: 'Recibe datos por comunicación serie (USB ↔ ordenador). Si lo ocupas con otros componentes, '
      + 'puede fallar la carga del programa o el Monitor Serie.',
  },
  TX1: {
    title: 'Pin TX1 (D1)', tag: 'Serie · enviar', kind: 'serial', volt: 'Señal digital 0 / 5 V',
    text: 'Envía datos por comunicación serie (Serial.print). Mejor dejarlo libre mientras aprendes.',
  },
};

function digitalInfo(name) {
  const n = Number(name.slice(1));
  const pwm = PWM_PINS.includes(n);
  let text = 'Con pinMode(pin, OUTPUT) entrega 0 V (LOW) o 5 V (HIGH) mediante digitalWrite(). '
    + 'Con INPUT lee botones y sensores con digitalRead(). Máximo recomendado: 20 mA por pin.';
  if (pwm) {
    text += ' La marca ~ indica PWM: analogWrite(pin, 0–255) lo enciende y apaga muy rápido '
      + `(≈${n === 5 || n === 6 ? 980 : 490} veces por segundo) para simular voltajes intermedios y regular brillo o velocidad.`;
  }
  if (n === 13) text += ' Además tiene conectado el LED integrado "L" de la placa.';
  return {
    title: `Pin ${pinLabel(name)}`, tag: pwm ? 'Digital + PWM ~' : 'Digital',
    kind: pwm ? 'pwm' : 'digital', volt: pwm ? '0 V / 5 V · PWM 0–255' : '0 V (LOW) / 5 V (HIGH)', text,
  };
}

function analogInfo(name) {
  const n = Number(name.slice(1));
  const only = n >= 6;
  let text = 'Mide voltajes entre 0 y 5 V con analogRead(), que devuelve un número de 0 a 1023 '
    + '(cada paso ≈ 4,9 mV). Ideal para potenciómetros y sensores de luz.';
  text += only
    ? ' A6 y A7 son SOLO analógicos: no funcionan como salidas ni como pines digitales.'
    : ` También puede usarse como pin digital (D${14 + n}).`;
  if (n === 4) text += ' A4 es SDA en el bus I2C.';
  if (n === 5) text += ' A5 es SCL en el bus I2C.';
  return {
    title: `Pin ${name}`, tag: only ? 'Solo analógico' : 'Analógico', kind: 'analog',
    volt: 'Entrada 0–5 V → 0–1023', text,
  };
}

/** Información de cualquier elemento interactivo de la placa. */
export function infoFor(id) {
  if (PARTS[id]) return PARTS[id];
  if (POWER[id]) return POWER[id];
  if (/^A\d$/.test(id)) return analogInfo(id);
  if (/^D\d+$/.test(id)) return digitalInfo(id);
  return { title: id, tag: '', kind: 'part', volt: '', text: '' };
}
