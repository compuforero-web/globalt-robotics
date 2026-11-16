// Emulación de un Arduino Nano compatible (ATmega328P a 16 MHz) con avr8js.
// Ejecuta el HEX que produjo el compilador; no interpreta el texto del programa.
import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
  AVRIOPort, portBConfig, portCConfig, portDConfig, PinState, AVRUSART, usart0Config,
} from '../vendor/avr8js-0.21.1.js';

export const CLOCK_HZ = 16_000_000;
const FLASH_BYTES = 32 * 1024;

/** Convierte Intel HEX en memoria de programa. Lanza un error si el archivo no es válido. */
export function parseIntelHex(text) {
  const bytes = new Uint8Array(FLASH_BYTES);
  let base = 0;
  let sawEnd = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!/^:[0-9A-Fa-f]{10,}$/.test(line) || line.length % 2 === 0) throw new Error('HEX no válido');
    const data = line.slice(1).match(/../g).map((h) => parseInt(h, 16));
    const [count, hi, lo, type] = data;
    if (data.length !== count + 5) throw new Error('HEX no válido');
    if (data.reduce((a, b) => a + b, 0) & 0xff) throw new Error('Suma de control HEX incorrecta');
    if (type === 0) {
      const address = base + (hi << 8) + lo;
      if (address + count > FLASH_BYTES) throw new Error('El programa no cabe en la memoria flash');
      bytes.set(data.slice(4, 4 + count), address);
    } else if (type === 1) { sawEnd = true; break; }
    else if (type === 2) base = ((data[4] << 8) | data[5]) << 4;
    else if (type === 4) base = ((data[4] << 8) | data[5]) << 16;
  }
  if (!sawEnd) throw new Error('HEX incompleto');
  return new Uint16Array(bytes.buffer);
}

// Pines digitales del Nano: D0–D7 = PORTD, D8–D13 = PORTB, A0–A5 (D14–D19) = PORTC.
const PORT_PINS = { B: [8, 9, 10, 11, 12, 13], C: [14, 15, 16, 17, 18, 19], D: [0, 1, 2, 3, 4, 5, 6, 7] };

/**
 * Microcontrolador emulado. `onPin(pin, high, timeMs)` y `onSerial(byte, timeMs, baud)`
 * reciben los cambios observados en el hardware simulado.
 */
export class NanoRunner {
  constructor(hexText, { onPin = () => {}, onSerial = () => {} } = {}) {
    this.cpu = new CPU(parseIntelHex(hexText));
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.usart.onByteTransmit = (byte) => onSerial(byte, this.timeMs, this.usart.baudRate);
    this.pins = new Map();
    const ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    for (const [name, port] of Object.entries(ports)) {
      PORT_PINS[name].forEach((pin) => this.pins.set(pin, false));
      port.addListener(() => {
        PORT_PINS[name].forEach((pin, bit) => {
          const high = port.pinState(bit) === PinState.High;
          if (high !== this.pins.get(pin)) {
            this.pins.set(pin, high);
            onPin(pin, high, this.timeMs);
          }
        });
      });
    }
  }

  get timeMs() { return this.cpu.cycles / (CLOCK_HZ / 1000); }

  /** Ejecuta instrucciones hasta alcanzar el ciclo indicado. */
  runUntilCycle(target) {
    const { cpu } = this;
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  runFor(ms) { this.runUntilCycle(this.cpu.cycles + ms * (CLOCK_HZ / 1000)); }
}
