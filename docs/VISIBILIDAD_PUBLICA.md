# Presentación pública e indexación

La portada y las cinco páginas de juegos tienen título, descripción, URL canónica, Open Graph y tarjeta social. Reutilizan las portadas fotográficas WebP existentes (960 × 540), sin generar imágenes adicionales ni cambiar código de juego. El HTML sirve los metadatos directamente; no requieren JavaScript.

La portada incluye datos estructurados básicos de Organization y WebSite, sin reseñas, certificados, precios ni acreditaciones inventadas. Un directorio desplegable permite abrir los cinco simuladores mediante enlaces HTML normales y también funciona sin JavaScript.

## Mapa publicado sin cambiar Linux

El publicador instalado admite la carpeta `games/`, pero no admite un archivo nuevo `sitemap.xml` en la raíz. Por eso el mapa está en `https://globalt-robotics.com/games/sitemap.xml` y contiene únicamente las cinco URLs canónicas dentro de `/games/`. `robots.txt` anuncia esa ubicación. La portada se descubre normalmente por su URL y los enlaces; no se incluye fuera del ámbito de este mapa. Aula, APIs, administración y el laboratorio autenticado no se incluyen.

Las reglas de robots son indicaciones de rastreo, no controles de acceso. La autenticación y los bloqueos del servidor se conservan.

## Mantenimiento y límites

- Al agregar o quitar juegos públicos, actualizar el directorio de la portada y `games/sitemap.xml`.
- Una URL pública diferente debe llevar su propio título, descripción, portada y canonical.
- No utilizar un SVG como primera imagen Open Graph ni rutas de imagen relativas.
- Cada red social decide qué vista previa muestra y puede conservar versiones anteriores en caché; los metadatos no garantizan un aspecto concreto.
- No se ha conectado Search Console ni enviado solicitudes de indexación. No se garantiza posicionamiento.
- Los cambios se publican por el temporizador existente de archivos estáticos. No requieren reiniciar contenedores, modificar Cloudflare ni reconstruir el backend.

Referencias: https://ogp.me/ · https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap · https://www.sitemaps.org/protocol.html

Comprobaciones: metadatos únicos, charset UTF-8 temprano, JSON-LD parseable, correspondencia entre URLs canónicas y mapa, enlaces locales y comparación exacta de los cuerpos de los juegos. La sesión no dispone de navegador ni terminal para comprobar la vista previa real de WhatsApp; las comprobaciones del repositorio se ejecutan en GitHub.
