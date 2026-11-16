# GLOBALT Robotics

Plataforma educativa creada por Edwin Hernando Gómez Forero: catálogo de cursos, juegos, videos y talleres, panel de administración y RoboLab Arduino.

## Desarrollo

Requiere Node.js; no hay dependencias que instalar.

```bash
npm start
```

Abrir `http://localhost:8080` y `http://localhost:8080/admin`.

## Laboratorio Arduino

Lección piloto con editor, compilación real (avr-gcc), emulación ATmega328P en el navegador y reto evaluado: `games/laboratorio-arduino/`. Ver [docs/LABORATORIO_ARDUINO.md](docs/LABORATORIO_ARDUINO.md). La compilación necesita el servicio aislado de [services/compilador-arduino](services/compilador-arduino/README.md), disponible en los laboratorios privados y bloqueado en el dominio público. Si `/api/arduino/` no responde (404, HTML o error de red), la página muestra a los estudiantes «Compilación próximamente» y desactiva solo Compilar, Ejecutar y Comprobar reto; editar, guardar y restaurar siguen activos. Los errores reales de compilación del estudiante se muestran siempre.

## Aula (cuentas e inscripción, en desarrollo)

`aula/` (frontend) y `services/aula-api/` (FastAPI + PostgreSQL): registro de estudiantes, sesión de servidor e inscripción al curso de Arduino. No publicado; ver [services/aula-api/README.md](services/aula-api/README.md) y [docs/AULA_CUENTAS_AUDITORIA.md](docs/AULA_CUENTAS_AUDITORIA.md).

## GitHub y Linux

El código oficial vive en https://github.com/compuforero-web/globalt-robotics, rama `main`.
Ver [README_LINUX.md](README_LINUX.md) para instalar la copia en Linux, activar la actualización automática y volver a una versión anterior.

Los cambios se hacen en una copia de desarrollo y se guardan en GitHub. Linux consulta `main` aproximadamente cada minuto, valida los archivos necesarios y los JSON, publica los archivos del sitio y comprueba por HTTP la portada, el panel y RoboLab. No ejecuta scripts descargados del repositorio. Una comprobación fallida conserva o restaura la versión anterior. No se trata de una auditoría funcional completa ni de una garantía sobre cualquier cambio de JavaScript; conviene usar ramas y PR para revisar mejoras antes de llevarlas a `main`.

## Estado de los datos y el panel

Videotutoriales: la sección «Videos» de la portada y su enlace en el menú permanecen ocultos mientras ningún video tenga enlace de YouTube. Basta con pegar enlaces en `/admin → Videotutoriales` para que aparezcan; los registros sin enlace se conservan.

La entrega original no tiene Supabase configurado. El catálogo inicial forma parte del código; las ediciones en el panel se guardan **solo en localStorage de ese navegador y dirección web**. Los cambios del panel no generan commits ni se replican entre equipos. Exporta el JSON desde el panel para conservarlos. Abrir la plataforma por otra IP, puerto o dominio crea un almacenamiento local distinto.

La contraseña de demostración incluida es visible en el código y **no es autenticación segura**. La instalación Linux propuesta queda accesible por localhost y NetBird, sin publicar un dominio. Antes de acceso público o uso con datos reales, configurar y verificar autenticación y almacenamiento compartidos. El SQL y la guía original de Supabase se conservan como referencia; no se han ejecutado ni auditado por completo en esta entrega.

No subir `.env`, claves privadas, claves secretas/service_role, bases de datos ni respaldos con información personal. GitHub conserva código; las bases de datos y los cambios guardados en navegadores necesitan sus propios respaldos.

## Comprobaciones

```bash
python3 -m unittest discover -s tests -v
python3 scripts/check.py
```

La guía original [README_DESPLIEGUE.md](README_DESPLIEGUE.md) se conserva; sus instrucciones para Netlify no son necesarias para este despliegue Linux.
