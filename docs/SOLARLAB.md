# SolarLab: Ingeniería Fotovoltaica

Ruta: `/games/solar-lab/index.html`. Categoría Energías limpias, nivel Intermedio. Cinco retos, con portada y apertura desde el modal existente o en una pestaña independiente. Se conservan sin modificaciones los seis archivos del ZIP recibido.

## Retos y alcance

1. Inclinación: caso de estudio a 35° N en solsticio de invierno; meta de 1330 Wh. No representa automáticamente las condiciones de La Mesa.
2. Serie/paralelo: 2S2P cumple los límites del controlador; 4S activa el caso de sobrevoltaje con humo y alarma.
3. Baterías y MPPT: importan controlador, capacidad, tensión y profundidad de descarga. Cambiar solamente a MPPT no garantiza aprobar cualquier banco: también se rechaza el sobredimensionamiento. Ejemplo comprobado: 12 V, LiFePO4, 150 Ah, DoD 70 %, MPPT.
4. Seguidor con LDR: sensibilidades similares, histéresis 40–60 y paso de servo 3–6 grados; genera C++ para Arduino Nano.
5. Microrred: ejemplo comprobado de tres paneles, dos baterías, MPPT 60 A e inversor 2000 W; coste y peso son parámetros del modelo, no cotizaciones verificadas.

Las curvas de irradiancia y potencia del nivel 1 son proporcionales y pueden verse superpuestas. Los resultados son educativos dentro del modelo del juego, no una certificación real de instalaciones. El progreso usa `solarlab.progress.v1` del navegador y no se sincroniza con cuentas.

## Verificación de integración

Se comprobaron sintaxis/imports/enlaces, los seis archivos por HTTP, una configuración aprobada por nivel, rechazo del arreglo 4S, migración del catálogo y conservación del progreso. Se renderizaron las cinco escenas y gráficas con un motor Canvas; las leyendas de las gráficas de dos curvas quedaron separadas. No se repitió aquí la prueba interactiva de Chromium informada por el creador. El creador reportó completar los cinco niveles y probar 380 px sin errores de consola ni scroll horizontal antes de su ajuste final de leyendas.
