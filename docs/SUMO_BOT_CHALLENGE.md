# Sumo Bot Challenge

Integrado desde el ZIP recibido, con sus seis archivos originales sin modificaciones. Ruta: `/games/sumo-bot-challenge/index.html`. Tarjeta: Sumo Bot Challenge, Proyecto Final. Reemplaza el anuncio de Próximamente conservando `game-sumo-bot`.

## Funcionamiento informado por el creador

La simulación representa reglas del `loop()` de Arduino Nano con L298N, dos TCRT5000 y HC-SR04: detección de borde, retroceso y giro; ataque según el umbral de distancia; búsqueda cuando no hay rival detectado. El orden de reglas es configurable. El C++ se regenera con los parámetros y tiene botón Copiar. El avance de 250 ms hacia el centro después de evadir el borde en búsqueda giratoria también se incluye en el código generado.

Progreso, parámetros y sonido se guardan en `sumoBotChallenge.v1` del navegador. Si no se permite localStorage, la app continúa sin persistencia. Incluye masa, colisiones con fricción, agarre lateral del rival pesado y derrape por inercia a PWM alto. Esto describe un simulador educativo; no acredita pruebas en hardware real.

## Equilibrio reportado: 30 combates automáticos por prueba

| Nivel | Inicial | Con parámetros ajustados |
|---|---|---|
| 1 · Borde | Pierde al ignorar el borde | 30/30 con retroceder + girar |
| 2 · Radar | Pierde con umbral 20 cm | 30/30 con umbral ≥ 40 cm |
| 3 · PWM | Pierde con patrulla 250 | 24–28/30 con patrulla ≈160 y ataque 180–255 |
| 4 · Rival ágil | Pierde | Aproximadamente 60–80 % |
| 5 · Torneo | Pierde | 26–29/30 con ataque >200 y patrulla ≈200 |

Estos resultados fueron aportados por el creador y no repetidos durante la integración.

## Límites conocidos

En el nivel 4, priorizar borde antes de ataque influye poco: el PWM de ataque y el umbral tienen más peso, y existe azar que puede requerir reintentos. En el nivel 5, los dos PWM dominan el resultado; el giro y el tiempo de retroceso influyen poco pese al objetivo del enunciado. Estas limitaciones se conservan en la entrega recibida.

## Verificación de integración

Se revisaron sintaxis, imports, enlaces, entrega HTTP de los seis archivos y migración del catálogo para navegadores con datos previos, sin borrar contenido personalizado ni progreso de los juegos. No se reinstalan servicios Linux. La prueba funcional en el navegador del usuario queda pendiente tras la sincronización.
