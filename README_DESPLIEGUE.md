# GLOBALT ROBOTICS · Guía de despliegue

Guía paso a paso, en español sencillo, para publicar la plataforma en **globaltrobotic.com**, conectar la base de datos gratuita de **Supabase** y administrar el contenido desde **/admin**.

---

## 0. Probar en tu computador (opcional)

Necesitas tener [Node.js](https://nodejs.org) instalado.

```bash
cd globalt-robotics
```

```bash
npm start
```

Abre `http://localhost:8080` (sitio) y `http://localhost:8080/admin` (panel).
Contraseña de prueba del panel: **`globalt2026`** (se cambia en `src/config.js`).

> Sin Supabase, la web funciona al 100 %, pero lo que edites en /admin queda guardado **solo en ese navegador**. Para que los visitantes vean tus cambios, sigue el paso 2.

---

## 1. Subir el sitio a Netlify y conectar el dominio

1. Crea una cuenta gratis en <https://app.netlify.com>.
2. Ve a **Sites → Add new site → Deploy manually**.
3. **Arrastra la carpeta `globalt-robotics`** completa a la zona punteada. En segundos tendrás una dirección del tipo `https://nombre-al-azar.netlify.app`.
4. Comprueba que `https://nombre-al-azar.netlify.app/admin` abre el panel (lo hace el archivo `_redirects`).
5. Conecta tu dominio:
   - En el sitio: **Domain management → Add a domain** → escribe `globaltrobotic.com`.
   - Netlify te mostrará los registros DNS. En el panel donde compraste el dominio (GoDaddy, Hostinger, etc.):
     - Registro **A** para `@` → `75.2.60.5`
     - Registro **CNAME** para `www` → `nombre-al-azar.netlify.app`
     *(Usa los valores exactos que muestre Netlify si son distintos.)*
   - Espera a que el DNS se propague (de minutos a 24 h). Netlify activa el **HTTPS gratis** automáticamente.
6. Para actualizar el sitio más adelante: **Deploys →** arrastra otra vez la carpeta.

### ¿Usas cPanel / hosting Apache en lugar de Netlify?
Sube **todo el contenido** de la carpeta (incluido el archivo oculto `.htaccess`) a `public_html` con el Administrador de archivos. El `.htaccess` ya hace que `globaltrobotic.com/admin` abra el panel.

---

## 2. Crear la base de datos gratuita en Supabase

1. Crea una cuenta en <https://supabase.com> → **New project**. Ponle nombre (ej. `globalt-robotics`), una contraseña de base de datos y la región **South America (São Paulo)**.
2. Abre **SQL Editor → New query**, pega **todo** el contenido de `supabase-schema.sql`.
   - ⚠️ Antes de ejecutar, cambia `tu-correo@ejemplo.com` por **tu correo real** (es el único que podrá editar contenido).
   - Presiona **Run**. Deberías ver "Success".
3. Crea tu usuario administrador: **Authentication → Users → Add user → Create new user**, con el **mismo correo** del paso anterior y una contraseña segura. Marca *Auto Confirm User*.
4. (Recomendado) **Authentication → Sign In / Providers → Email**: desactiva *Allow new users to sign up* para que nadie más pueda registrarse.
5. Copia tus 2 claves en **Project Settings → API** (en algunas versiones: **Data API** y **API Keys**):
   - **Project URL** → algo como `https://abcdefghijk.supabase.co`
   - **anon public key** → un texto largo que empieza por `eyJ...`
6. Abre `src/config.js` con un editor de texto (Bloc de notas sirve) y pégalas:

```js
SUPABASE_URL: 'https://abcdefghijk.supabase.co',
SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
```

7. Vuelve a subir la carpeta a Netlify (paso 1.6).

> La *anon key* es pública por diseño: la seguridad la dan las reglas (RLS) del archivo SQL, que permiten **leer a todos** y **escribir solo a los correos de la tabla `admins`**. Nunca pegues la clave `service_role` en el sitio.

### Cargar el catálogo inicial en Supabase
1. Entra a `globaltrobotic.com/admin` con tu correo y contraseña de Supabase.
2. Ve a **Respaldo JSON → Importar** y elige `data/catalogo-inicial.json` (o el respaldo que hayas exportado mientras trabajabas en modo local).
3. ¡Listo! Todo el contenido ya vive en Supabase y los cambios se ven al instante para todos.

---

## 3. Usar el panel /admin

Entra a **`globaltrobotic.com/admin`**.

| Sección | Qué puedes hacer |
|---|---|
| **Resumen** | Ver cuántos juegos, cursos, videos y talleres hay y si estás en modo local o Supabase. |
| **Juegos** | **Nuevo juego** → título, descripción, categoría, dificultad (Básico / Intermedio / Proyecto Final), ruta o URL, imagen y marca de *Destacado*. Si dejas la URL vacía aparece como "Próximamente". |
| **Cursos** | Elige la ruta (**Aprende a Programar** o **Inteligencia Artificial**), nivel, duración, temario (un tema por línea) y enlace al material. |
| **Videotutoriales** | Pega el enlace de YouTube (sirve `youtube.com/watch`, `youtu.be`, `shorts`). El ID y la miniatura salen solos. |
| **Talleres** | Edita fechas, precios, modalidad y si el taller se muestra o no. |
| **Banner y ajustes** | Activa/desactiva el cintillo naranja de "Inscripciones abiertas", cambia su texto y el número de WhatsApp. |
| **Respaldo JSON** | Descarga todo en un archivo `.json` o restáuralo con un clic. Haz un respaldo antes de cambios grandes. |

### Publicar un juego nuevo hecho por ti (HTML5, WebGL o Three.js)
1. Crea una carpeta dentro de `games/`, por ejemplo `games/semaforo/`, con su `index.html` y archivos.
2. (Opcional) Agrega una imagen de vista previa en `assets/img/semaforo.svg` o `.png`.
3. Sube la carpeta del sitio a Netlify otra vez.
4. En **/admin → Juegos → Nuevo juego**, en *URL o ruta* escribe `games/semaforo/index.html`.
5. Si el juego está alojado en otra web (itch.io, Wokwi, etc.) pega la URL completa `https://...`.

---

## 4. Seguridad: lista rápida antes de publicar
- [ ] Cambiar `ADMIN_MASTER_PASSWORD` en `src/config.js` (solo se usa sin Supabase y es visible en el código del navegador: **no es protección real**, es para pruebas).
- [ ] Con Supabase conectado, el login usa **Supabase Auth** y la contraseña maestra deja de funcionar.
- [ ] Tu correo está en la tabla `admins` y desactivaste los registros públicos.

---

## 5. Estructura del proyecto

```
globalt-robotics/
├── index.html              Sitio público
├── admin.html              Panel de administración (/admin)
├── _redirects  netlify.toml  .htaccess  robots.txt
├── supabase-schema.sql     Tablas + seguridad para Supabase
├── data/catalogo-inicial.json   Contenido inicial para importar
├── assets/img/             Logo, ilustraciones SVG y vistas previas
├── styles/                 base · layout · components · admin
├── games/robolab-arduino/  Juego destacado (6 niveles)
├── scripts/serve.mjs       Servidor local (npm start)
└── src/
    ├── config.js           ← Aquí van las 2 claves de Supabase
    ├── data/seed.js        Catálogo precargado
    ├── services/           db.js (capa híbrida) · supabase.js
    ├── utils/  ui/         Ayudantes: YouTube, WhatsApp, iconos, avisos
    ├── public/             Lógica de la web pública
    └── admin/              Lógica del panel (login, CRUD, ajustes, respaldo)
```

¿Dudas? WhatsApp: **+57 314 486 4187**
