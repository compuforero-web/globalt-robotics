# Publicación de globalt-robotics.com

La publicación pública se prepara separada de la administración privada.

| Entrada | Uso |
|---|---|
| `100.117.79.42:8094` | Web y administración privadas por NetBird |
| `127.0.0.1:8096` | Origen local para Cloudflare Tunnel; bloquea admin y API |
| `https://globalt-robotics.com` | Dirección pública tras conectar el túnel y verificar TLS |

## Preparación en Linux

Dentro del repositorio actualizado:

```bash
git pull --ff-only
sudo bash deploy/linux/install-public.sh
```

El instalador crea un contenedor independiente `globalt-robotics-public`, sin cambiar el contenedor privado ni los demás proyectos. Reutiliza la imagen Nginx existente, monta las versiones del sitio en modo lectura y prueba portada y bloqueo de administración/API. No instala ni configura el compilador. No hace falta reinstalarlo por cada cambio de contenido: ambas entradas sirven `/srv/globalt-robotics/current` actualizado por el temporizador existente.

La configuración está preparada; la prueba real de Nginx y Docker se ejecuta mediante el instalador en el servidor, no se ha realizado desde el entorno de edición.

## Conectar Cloudflare

Crear un túnel permanente específico `globalt-robotics` en Networking → Tunnels, o su equivalente en Zero Trust → Networks → Connectors. Conservar los túneles existentes de Origen y Restaurante.

El conector debe ejecutarse en el servidor y poder acceder a `http://127.0.0.1:8096`. Si se usa Docker, `localhost` se refiere al contenedor a menos que use la red del host; por eso no copiar un comando Docker genérico sin adaptar su red.

Crear dos rutas de aplicación pública:

| Subdominio | Dominio | Tipo | Destino |
|---|---|---|---|
| vacío | globalt-robotics.com | HTTP | 127.0.0.1:8096 |
| www | globalt-robotics.com | HTTP | 127.0.0.1:8096 |

No dirigir las rutas públicas al puerto privado 8094. El token del túnel se introduce directamente en el servidor, no en GitHub, capturas ni mensajes. El asistente preparará el arranque persistente del conector después de verificar la primera etapa.

Tras conectar, comprobar el dominio por HTTPS desde datos móviles sin NetBird, juegos, recursos, y respuesta 403 en `/admin`, `/admin.html` y `/api/arduino/salud`. Comprobar aparte que `/admin` sigue funcionando por NetBird en 8094.

Las cuentas e inscripciones reales siguen pendientes. El compilador público permanece bloqueado hasta completar la revisión, sus límites y el acceso autorizado. Registrar el dominio no instala estos componentes.

Referencia: https://developers.cloudflare.com/tunnel/get-started/
