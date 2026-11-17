// Ejemplo: una variable sube hasta 5 y baja hasta 0, sin parar.
// «paso» guarda el sentido y cambia de signo en los extremos.
int valor = 0;
int paso = 1;

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 12; i++) {
    Serial.println(valor);
    valor = valor + paso;
    if (valor == 5 || valor == 0) paso = -paso;
  }
}

void loop() { }
