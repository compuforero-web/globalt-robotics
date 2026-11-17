// Ejemplo: millis() cuenta los milisegundos desde el arranque.
// La tarea se ejecuta cuando ha pasado su intervalo, sin esperar.
unsigned long antes = 0;
int cuenta = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  if (millis() - antes >= 300) {
    antes = antes + 300;
    cuenta++;
    Serial.println(cuenta);
  }
  // Aquí el loop sigue libre para otras tareas.
}
