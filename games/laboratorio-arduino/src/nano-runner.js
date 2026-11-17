// Emulación de un Arduino Nano compatible (ATmega328P a 16 MHz) con avr8js.
// Ejecuta el HEX que produjo el compilador; no interpreta el texto del programa.
import {
  CPU, avrInstruction, AVRTimer, timer0Config, timer1Config, timer2Config,
  AVRIOPort, portBConfig, portCConfig, portDConfig, PinState, AVRUSART, usart0Config, AVRADC, adcConfig,
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
  constructor(hexText, { onPin = () => {}, onSerial = () => {}, onAdc = () => {} } = {}) {
    this.cpu = new CPU(parseIntelHex(hexText));
    this.timers = [timer0Config, timer1Config, timer2Config].map((c) => new AVRTimer(this.cpu, c));
    this.usart = new AVRUSART(this.cpu, usart0Config, CLOCK_HZ);
    this.usart.onByteTransmit = (byte) => onSerial(byte, this.timeMs, this.usart.baudRate);
    // ADC de 10 bits (A0–A7). Referencia AVcc = 5 V; cada canal lee la tensión que le fija un componente
    // (channelValues). `onAdc(canal, valor, t)` informa de cada conversión que pide el programa (analogRead).
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.adc.channelValues.fill(0);
    const complete = this.adc.completeADCRead.bind(this.adc);
    this.adc.completeADCRead = (value) => {
      complete(value);
      onAdc(this.cpu.data[adcConfig.ADMUX] & 0x0f, value, this.timeMs);
    };
    this.pins = new Map();
    this.portListeners = [];   // modelos de entrada que reaccionan a cambios de DDR/PORT (pinMode, pull-up)
    const ports = { B: new AVRIOPort(this.cpu, portBConfig), C: new AVRIOPort(this.cpu, portCConfig), D: new AVRIOPort(this.cpu, portDConfig) };
    this.ports = ports;
    for (const [name, port] of Object.entries(ports)) {
      PORT_PINS[name].forEach((pin) => this.pins.set(pin, false));
      port.addListener(() => {
        for (const fn of this.portListeners) fn();
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

  /** Puerto y bit de un pin digital (D0–D19). */
  locate(pin) {
    for (const [name, pins] of Object.entries(PORT_PINS)) {
      const bit = pins.indexOf(pin);
      if (bit >= 0) return { port: this.ports[name], bit };
    }
    throw new Error(`Pin D${pin} no existe en el Nano`);
  }

  /**
   * Modo eléctrico actual del pin según los registros DDR/PORT del microcontrolador emulado:
   * 'output', 'pullup' (entrada con resistencia interna) o 'input' (entrada sin resistencia: flotante si nada la fija).
   */
  pinMode(pin) {
    const { port, bit } = this.locate(pin);
    const state = port.pinState(bit);
    if (state === PinState.InputPullUp) return 'pullup';
    if (state === PinState.Input) return 'input';
    return 'output';
  }

  /** Nivel eléctrico que un componente externo impone en un pin de entrada (lo lee digitalRead/PINx). */
  setInput(pin, high) {
    const { port, bit } = this.locate(pin);
    port.setPin(bit, Boolean(high));
  }

  /** Tensión (0–5 V) que un componente externo aplica al canal analógico `channel` (0 = A0). */
  setAnalog(channel, volts) {
    this.adc.channelValues[channel] = Math.min(5, Math.max(0, Number(volts) || 0));
  }

  /** Programa `fn` en el ciclo de reloj `cycle` (absoluto): se ejecuta entre dos instrucciones, con precisión de ciclo. */
  atCycle(cycle, fn) {
    const delta = Math.max(1, Math.ceil(cycle - this.cpu.cycles));
    this.cpu.addClockEvent(fn, delta);
    return fn;
  }

  /** Programa `fn` en el instante `ms` (ms simulados desde el arranque). */
  atMs(ms, fn) { return this.atCycle(ms * (CLOCK_HZ / 1000), fn); }

  /** Anula un evento programado con atCycle/atMs. */
  cancel(fn) { this.cpu.clearClockEvent(fn); }

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
