// Modelo de un potenciómetro de 10 kΩ conectado como divisor de tensión: extremos a 5 V y GND, cursor a un
// canal analógico (A0). La posición fija la tensión del cursor (0–5 V) que el ADC del ATmega328P emulado
// convierte cuando el programa llama a analogRead. El modelo nunca lee el texto del programa.
export const VCC = 5;

/** Valor que da un ADC ideal de 10 bits con referencia de 5 V (el mismo cálculo que avr8js: suelo, 0–1023). */
export const adcValue = (volts) => Math.min(1023, Math.max(0, Math.floor((volts / VCC) * 1024)));

export class PotModel {
  /**
   * @param {import('./nano-runner.js').NanoRunner} runner
   * @param {{ channel?: number, volts?: number, onChange?: Function }} options  onChange(volts, tMs)
   */
  constructor(runner, { channel = 0, volts = 0, onChange = () => {} } = {}) {
    Object.assign(this, { runner, channel, onChange });
    this.volts = null;
    this.set(volts);
  }

  /** Mueve el cursor ahora mismo a `volts` (se limita a 0–5 V). */
  set(volts) {
    const v = Math.min(VCC, Math.max(0, Number(volts) || 0));
    if (v === this.volts) return;
    this.volts = v;
    this.runner.setAnalog(this.channel, v);
    this.onChange(v, this.runner.timeMs);
  }

  /** Guion [{ t, volts }] (ms simulados), aplicado entre instrucciones con precisión de ciclo. */
  play(events) {
    for (const e of events) this.runner.atMs(e.t, () => this.set(e.volts));
  }
}
