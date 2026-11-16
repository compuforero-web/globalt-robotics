// Metadatos de los 5 niveles. La lógica de cada nivel vivirá en su propio módulo.
export const LEVELS = [
  {
    id: 1, icon: 'board', title: 'Anatomía Arduino Nano',
    summary: 'Explora 5V, 3.3V, VIN, GND, D2–D13, PWM ~ y A0–A7. Conecta un LED con 220Ω.',
    skills: ['digitalWrite', 'analogWrite'],
  },
  {
    id: 2, icon: 'servo', title: 'Microservo SG90',
    summary: 'Marrón = GND, Rojo = 5V, Naranja = Señal. Mueve el brazo a 0°, 90° y 180°.',
    skills: ['<Servo.h>', 'write()'],
  },
  {
    id: 3, icon: 'sonar', title: 'Sensor Ultrasónico HC-SR04',
    summary: 'Conecta VCC, GND, Trig y Echo. Mide distancias y míralas en el Monitor Serie.',
    skills: ['pulseIn', 'Serial'],
  },
  {
    id: 4, icon: 'motor', title: 'Puente H L298N y Motores',
    summary: 'Baterías 18650, IN1–IN4, ENA/ENB y GND común. Avanza, retrocede y gira.',
    skills: ['PWM', 'Dirección'],
  },
  {
    id: 5, icon: 'robot', title: 'Robot Evasor de Obstáculos',
    summary: 'Ensambla todo, programa la lógica completa y supera la pista con obstáculos.',
    skills: ['Integración', 'Lógica'],
  },
];
