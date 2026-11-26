// GLOBALT Robotics · Octavo · «¿Cuándo debe frenar el robot?» · Práctica física con el carrito.
// Regla de la clase: el carrito se detiene si la LECTURA USADA es de 20 cm o menos; si es mayor, avanza.
// Mismo mapa de pines que el robot evasor del laboratorio (fase 4):
//   HC-SR04 (4 pines): VCC a 5 V, GND a GND, TRIG a D7, ECHO a D8.
//   L298N: IN1 D2, IN2 D4, ENA D5 (motor izquierdo) · IN3 D10, IN4 D11, ENB D6 (motor derecho).
//   Batería de los motores (7-9 V) al borne VS (+12V) del L298N; GND del L298N unido al GND del Nano.
//   El Nano se alimenta por USB. Retira los puentes de ENA y ENB del L298N para usar D5 y D6.
// Si el sensor no devuelve eco (nada al frente en ~5 m, cable suelto o eco perdido), el carrito queda detenido.
// Monitor serie a 9600 baudios: eco medido, distancia con un decimal, lectura usada y orden enviada a los motores.

const int TRIG = 7;
const int ECO = 8;
const int IN1 = 2, IN2 = 4, ENA = 5;    // motor izquierdo
const int IN3 = 10, IN4 = 11, ENB = 6;  // motor derecho

const int LIMITE_CM = 20;                   // detenerse con una lectura de 20 cm o menos
const int VELOCIDAD = 150;                  // PWM de avance (0-255): lento, para medir dónde queda detenido
const unsigned long ECO_MAXIMO_US = 30000;  // sin eco en 30 ms, pulseIn devuelve 0
const unsigned long PERIODO_MS = 100;       // una medida cada 100 ms (el HC-SR04 pide al menos 60 ms)
const unsigned long ESPERA_INICIAL_MS = 3000;  // tiempo para soltar el carrito tras encenderlo

unsigned long ultimaMedida = 0;

// avanzar = true: los dos motores hacia adelante a VELOCIDAD. false: freno (IN en LOW y EN en alto, como en el
// laboratorio). Al avanzar se fija primero la velocidad y al frenar primero los IN, para no dar un golpe a plena potencia.
void motores(bool avanzar) {
  if (avanzar) {
    analogWrite(ENA, VELOCIDAD);
    analogWrite(ENB, VELOCIDAD);
  }
  digitalWrite(IN1, avanzar ? HIGH : LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, avanzar ? HIGH : LOW);
  digitalWrite(IN4, LOW);
  if (!avanzar) {
    analogWrite(ENA, 255);
    analogWrite(ENB, 255);
  }
}

// Duración del eco en microsegundos; 0 si no hubo eco.
unsigned long medirEcoUs() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  return pulseIn(ECO, HIGH, ECO_MAXIMO_US);
}

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(ENA, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT); pinMode(ENB, OUTPUT);
  digitalWrite(TRIG, LOW);
  motores(false);
  Serial.println("Carrito de octavo: regla PARAR con lectura <= 20 cm. Arranca en 3 s.");
  delay(ESPERA_INICIAL_MS);
}

void loop() {
  if (millis() - ultimaMedida < PERIODO_MS) return;
  ultimaMedida = millis();

  unsigned long eco = medirEcoUs();
  if (eco == 0) {
    motores(false);   // sin eco no hay lectura: nunca avanzar a ciegas
    Serial.println("Eco: sin eco | Distancia: -- | Lectura usada: -- | Orden: PARAR (sin eco)");
    return;
  }

  // El sonido tarda unos 58 us por cada cm de ida y vuelta. Se trabaja en décimas de cm, redondeando.
  unsigned long decimas = (eco * 10 + 29) / 58;
  // Lectura usada por la regla: centímetros enteros, redondeados al más cercano (20,4 -> 20; 20,5 -> 21).
  long lectura = (decimas + 5) / 10;
  bool parar = lectura <= LIMITE_CM;
  motores(!parar);

  Serial.print("Eco: ");
  Serial.print(eco);
  Serial.print(" us | Distancia: ");
  Serial.print(decimas / 10);
  Serial.print(',');
  Serial.print(decimas % 10);
  Serial.print(" cm | Lectura usada: ");
  Serial.print(lectura);
  Serial.print(" cm | Orden: ");
  Serial.println(parar ? "PARAR" : "AVANZAR");
}
