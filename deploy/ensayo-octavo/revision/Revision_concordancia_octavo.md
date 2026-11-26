# Revisión de concordancia · muestra de octavo

26 de noviembre de 2026 · rama `ensayo/liceo-octavo-integrado` (PR #34) · para Edwin

La clase «¿Cuándo debe frenar el robot?», la regla de 20 cm, el programa del carrito y la guía de pruebas concuerdan.
Queda pendiente la página de la cartilla, porque la rama no contiene el PDF definitivo. **[Probado]** marca lo que se
observó en una prueba automática: navegador, compilación o simulación. **[Leído]** marca lo que se verificó leyendo
el código o el material. La prueba física y el celular real quedan para el ensayo de Edwin.

## 1. Cartilla y plataforma

| Dato | Cartilla (índice editorial en `programa/octavo.html`) | Plataforma |
| --- | --- | --- |
| Página | **Pendiente**: sin PDF definitivo; `octavo.html` dice que la numeración llegará al cerrar la cartilla impresa | No aplica |
| Trimestre | 2 · Pongo a prueba el sensor | Igual |
| Clase | 4.ª del trimestre 2 (12.ª de 24 si se cuentan en orden; confirmar con el índice) | Igual |
| Qué se registra | «Tabla con 19, 20 y 21 cm y explicación de la igualdad» | Reto «¿Cuándo debe frenar el robot?» |
| Ruta | No aplica | Programa por grado → Octavo → Trimestre 2 → «Abrir el reto de 19, 20 y 21 cm» (`/programa/reto-distancia.html`) |

- **[Probado]** En la página del reto, con «es menor o igual que» 20, 19 y 20 cm paran y 21 cm avanza. Con «es menor
  que» 20, a 20 cm el robot avanza y la comprobación lo señala.
- **[Probado]** El carrito (`carrito_octavo.ino`) aplica la misma regla a la **lectura usada**: con 19 y 20 envía
  PARAR y con 21 envía AVANZAR. Se verificó en la simulación del HEX compilado.
- **[Leído]** El texto impreso de la cartilla no se pudo cotejar. Hay que confirmar que diga «20 cm o menos» y no
  «menos de 20».
- **Orden frente a parada física.** La página del reto es un modelo lógico: decide la orden y no mueve nada
  **[Leído]**. El carrito recibe PARAR con una lectura de 20 cm o menos y queda detenido más cerca por la inercia. La
  cartilla mide esa diferencia en el trimestre 3, y la guía la registra ahora en B5, parte 2.
- **Lectura frente a distancia real (20,9 cm).** El carrito redondea al centímetro más cercano: 20,9 cm → lectura 21 →
  AVANZAR, y 20,4 cm → 20 → PARAR **[Probado]**. La fase 1 del laboratorio descarta los decimales (µs / 58): con esa
  conversión, 20,9 cm se leería 20 y pararía **[Probado]**, y 21 cm queda a 1 µs del límite. La regla se aplica a la
  lectura procesada; el README del carrito y el Anexo 3 de la guía lo explican.
- **Otro umbral, otra actividad [Leído].** El evasor en banco (fase 4) empieza a esquivar a 25 cm o menos y retoma el
  avance por encima de 40 cm. Se conserva sin cambios; la guía lo aclara en la sección F.

## 2. Compra del kit en Bogotá

La lista sale del mapa del robot evasor del laboratorio y del programa del carrito **[Leído]**.

| Pieza | Qué pedir | Confirmar antes de pagar |
| --- | --- | --- |
| Placa | 1 Arduino Nano con ATmega328P a 16 MHz y su cable USB | Chip USB (CH340 u original) y su controlador; conector Mini-USB o USB-C; pines soldados |
| Sensor | 1 HC-SR04 de **4 pines** (VCC, GND, TRIG, ECHO) a 5 V | Que no sea de 3 pines ni de 3,3 V: TRIG va a D7 y ECHO a D8 |
| Controlador | 1 módulo L298N de doble puente H (IN1–IN4, ENA, ENB) | Que los puentes de ENA y ENB se puedan retirar (D5 y D6 dan la velocidad) |
| Chasis | Chasis de 2 ruedas motrices con 2 motores DC y rueda loca | *Por confirmar*: el simulador usa ruedas de 6,5 cm separadas 16 cm; el proyecto no nombra el motor ni su tensión |
| Alimentación | Batería de 7–9 V para los motores al borne VS del L298N; Nano por USB; GND común | *Por confirmar*: tipo de batería, portapilas e interruptor |
| Cables | Dupont: 4 para el sensor y 7 para el L298N (D2, D4, D5, D6, D10, D11 y GND), más repuestos | Macho-hembra o hembra-hembra según si el Nano va en protoboard (*por confirmar*) |

El LED y la resistencia de 220 Ω en D9 de la fase 2 son opcionales para el kit. Lleva también una regla de medir.

## 3. Recorrido del lunes

La guía destaca el **recorrido corto para rectoría**: **B2 → B5 → C1 → D4**. Va de la clase de la cartilla al carrito
físico, a la observación del profesor y a lo que lee el acudiente. Las pruebas del navegador (B2, C1 y D4) se
recorrieron en la réplica **[Probado]**; B5 es física y queda pendiente. Antes de la visita deben quedar hechos A, B1,
C2, D1–D3 y el carrito cargado. Las cinco fases del laboratorio pasaron a la sección F como demostración adicional
(F1–F5).

| Qué necesita | Qué se puede mostrar |
| --- | --- |
| Sin internet ni servidor | La cartilla impresa, las actividades de mesa, la página del reto ya abierta, porque es autocontenida **[Leído]**, y el carrito con su monitor serie en Arduino IDE |
| El servidor en la red local, sin internet | Sesión del profesor, compilación, fases, seguimiento familiar y buzón de ensayo. **[Probado]** en la réplica local, pero no en una red sin internet; las fuentes de Google se verían con la letra del sistema **[Leído]** |
| Internet | G1, la consulta de producción (desde aquí el proxy la bloqueó; no se comprobó). También el paso del código al celular en C2 y C3, si se usa mensajería |
| El robot físico | B5. El programa se carga con Arduino IDE, porque la plataforma compila y simula pero no carga a la placa **[Leído]** |

## Cierre

**Listo.**
- **[Probado] Réplica:** arranca, se reinicia y se limpia.
- **[Probado] Regla:** 19, 20 y 21 cm se comportan como se espera en la página del reto.
- **[Probado] Fases del laboratorio:** la fase 2 sigue bloqueada con el programa incorrecto, también al entrar por URL, y se habilita con el correcto.
- **[Probado] Familias:** cada una de las dos familias ve solo a su estudiante, y el código de una no sirve para la otra.
- **[Probado] Carrito:** compila con 4092 bytes. En la simulación envía PARAR con 19 y 20, AVANZAR con 20,9 y 21 y
  PARAR sin eco, y los motores quedan quietos durante la espera inicial.
- **[Probado] Campos del PDF:** los de B5 conservan lo que se escribe. Se comprobó con una biblioteca, no con un lector real.

**Corregido en esta entrega** (lo que la revisión anterior pedía antes de imprimir):
1. B5 separa la distancia marcada con regla, la lectura usada, la orden enviada y la posición final del carrito.
2. Existe el programa del carrito con la regla de 20 cm, con sus conexiones, la carga desde Arduino IDE y el caso sin eco.
3. Las fases del laboratorio dejaron de cortar el hilo de la clase: ahora son la sección F.
4. La guía explica que el banco de la fase 4 usa 25 cm por ser otra actividad.

**Conviene corregir antes de imprimir.**
- B2 y C1: añadir la página de la cartilla cuando exista el PDF.
- C2 y C3: decidir si el código pasa al celular por mensajería o se escribe a mano.

**Queda para el ensayo de mañana.**
- El kit físico en B5: lecturas reales, posición final y prueba sin eco.
- Un celular real, el servidor Linux y su cortafuegos.
- Guardar el PDF en Firefox o Xodo.
- G1 en producción.
- Cotejar la cartilla impresa.
- Una prueba con la red local sin internet.
