# Furl Life — Avatar Matching Service

API REST que recibe la foto de una mascota y devuelve un avatar ilustrado tipo Pixar/DreamWorks que la representa. Primero intenta servir el avatar desde un catálogo local; si no encuentra una buena coincidencia, lo genera con IA y lo cachea para próximas solicitudes.

## Stack

- **Node.js** ≥ 18 + **Express 4**
- **Multer** (subida de imágenes en memoria)
- **Google Cloud Vision** — `LABEL_DETECTION` para extraer atributos de la mascota
- **Pollinations.ai** (flux) — generación de imagen como fallback (endpoint GET sin autenticación)
- **Axios** + **dotenv**

## Cómo funciona el pipeline

`POST /api/avatar/match` ejecuta los siguientes pasos (ver `controllers/avatarMatchingController.js`):

1. **Vision API** clasifica la imagen y devuelve etiquetas.
2. **`extractPetAttributes`** normaliza las etiquetas en `{species, breed, color, stage}` usando los diccionarios `SPECIES_MAP`, `BREED_MAP`, `COLOR_SYNONYMS` y `STAGE_MAP`.
3. **`matchLocalAvatar`** busca progresivamente en `assets/avatars/` (de más a menos específico: `species_breed_color_stage` → `species`) con coincidencia difusa basada en Levenshtein. Si la confianza ≥ 0.80, responde con `source: 'local'`.
4. **Fallback con Pollinations.ai** — construye un prompt estilizado (`buildFireworksPrompt`) y descarga la imagen generada por `flux`.
5. **Doble escritura / caché auto-poblada** — la imagen se guarda en `assets/avatars_generated/` (historial) **y** en `assets/avatars/` (catálogo). La próxima solicitud similar acierta en el paso 3 y evita llamar a la IA.

El campo `imageUrl` de la respuesta siempre apunta a `/static/avatars/{canonical}.png` para mantener URLs consistentes incluso cuando la imagen es recién generada.

## Endpoints

| Método | Ruta                  | Descripción                                              |
| ------ | --------------------- | -------------------------------------------------------- |
| `POST` | `/api/avatar/match`   | Multipart con campo `image` (jpeg/png/webp, máx. 10 MB). |
| `GET`  | `/static/avatars/...` | Catálogo de avatares (locales + cacheados).              |
| `GET`  | `/static/avatars_generated/...` | Historial de generaciones.                     |
| `GET`  | `/health`             | Health check para el Load Balancer de OCI.               |

### Ejemplo

```bash
curl -X POST http://localhost:3000/api/avatar/match \
  -F "image=@mi_mascota.jpg"
```

Respuesta:

```json
{
  "source": "local",
  "confidence": 0.92,
  "attributes": { "species": "dog", "breed": "samoyed", "color": null, "stage": "adult" },
  "imageUrl": "http://localhost:3000/static/avatars/dog_samoyed_adult.png"
}
```

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
PORT=3000
APP_BASE_URL=http://localhost:3000

# Google Cloud Vision (requerida)
GOOGLE_VISION_KEY=tu_api_key

# Pollinations.ai no requiere API key

# Opcionales
GENERATED_DIR=/ruta/persistente/avatars_generated
MOCK_MODE=false
```

| Variable             | Default               | Descripción                                                                 |
| -------------------- | --------------------- | --------------------------------------------------------------------------- |
| `PORT`               | `3000`                | Puerto HTTP.                                                                |
| `APP_BASE_URL`       | —                     | URL pública para construir `imageUrl` en las respuestas.                    |
| `GOOGLE_VISION_KEY`  | —                     | API key de Google Cloud Vision.                                             |
| `GENERATED_DIR`      | `assets/avatars_generated` | Carpeta para imágenes generadas (útil en OCI con disco efímero).       |
| `MOCK_MODE`          | `false`               | Si es `true`, omite la llamada a la IA y copia un PNG placeholder.          |

## Instalación y ejecución

```bash
git clone https://github.com/sofygg10/furllife-avatar.git
cd furllife-avatar
npm install
cp .env.example .env   # y completa las variables
npm run dev            # nodemon con auto-reload
# o
npm start              # producción
```

## Estructura del proyecto

```
.
├── app.js                          # Bootstrap de Express
├── routes/
│   └── avatarRoutes.js             # POST /api/avatar/match
├── controllers/
│   └── avatarMatchingController.js # Pipeline completo (secciones 1-8)
├── assets/
│   ├── avatars/                    # Catálogo local + caché de generaciones
│   └── avatars_generated/          # Historial de imágenes generadas
└── package.json
```

## Despliegue

Diseñado para Oracle Cloud Infrastructure detrás de un Load Balancer (`/health` está disponible para el chequeo). `multer.memoryStorage()` es intencional porque el disco en OCI puede ser efímero; el caché en `assets/avatars/` sólo persiste si esa ruta está montada en almacenamiento permanente (usa `GENERATED_DIR` para apuntar a un volumen).

## Notas

- Los comentarios, logs y mensajes de error están en español. Mantener esa convención al editar.
- Los prefijos de log (`[Vision]`, `[Breed]`, `[Match]`, `[Fireworks]`, `[Cache]`, `[Attrs]`) son útiles para trazar etapas del pipeline.
- Caso especial: gatos detectados sin color se asumen `orange` (criollo bicolor) — es branding intencional de la app, no un fallback genérico.
