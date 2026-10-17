# 🌐 Nexo — Centro de Mando Personal con IA

**Nexo** es una Progressive Web App (PWA) de alto rendimiento, diseñada específicamente para **iPhone** (Safari en pantalla completa / standalone), que actúa como tu centro de mando personal con inteligencia artificial. Todo el proyecto está construido con tecnologías web modernas y puras (sin frameworks, sin paso de build, módulos ES puros) y respaldado por un **Cloudflare Worker** conectado a **Google Gemini Flash**.

Todo el stack es **100% gratuito** y funciona **sin conexión a internet** (IndexedDB) para todos los registros locales, activando la IA solo cuando requieres análisis, visión o transcripción.

---

## 🎨 Sistema de Diseño (Design System)

- **Material Design 3 (Material You)** en **modo oscuro permanente**:
  - Fondo absoluto `#000000`.
  - Superficies elevadas `#1E1E1E` y `#2A2A2A`.
  - Esquinas redondeadas (16–28 px en tarjetas y modales, 999 px en botones píldora).
- **Estética Developer & Minimalista** (Linear, Vercel, GitHub):
  - Tipografía monoespaciada (`JetBrains Mono` / `ui-monospace`) para montos, fechas, tags, métricas y transcripciones.
- **Glow UI / Aurora**:
  - Bordes luminosos con degradado cónico azul-violeta (`--accent` y `--glow-angle`) en cuadros de prompt, tarjetas activas y modales de confirmación.
  - El resplandor se intensifica reactivamente cuando la IA está «pensando» (`body.ai-thinking`).
- **Responsive & Adaptativo**:
  - **iPhone (Mobile)**: Navegación inferior con acceso a *Hoy*, *Finanzas*, botón central flotante para *Chat IA*, *Negocio* y drawer deslizable (*Más*). Respeto absoluto del `viewport-fit=cover` y safe areas (`env(safe-area-inset-*)`).
  - **iPad / Desktop (≥ 900 px)**: Layout multi-panel de 3 columnas (Navegación / Centro interactivo / Vista previa en vivo con gráficas SVG).

---

## 🚀 Los 9 Módulos de Nexo

1. **☀️ Hoy (Prompt-First & Resumen Diario)**:
   - Cuadro central con glow (*"¿Qué quieres hacer hoy?"*) que interpreta intenciones mediante IA y abre el módulo o acción adecuada.
   - Saludo dinámico según la hora.
   - Lista interactiva de tareas con checkbox.
   - Gasto acumulado del día, rachas de hábitos y seguimientos a personas.
   - Botón **"Resumen del Día con IA"** que cruza el contexto de todos los módulos en una sola vista.

2. **💰 Finanzas**:
   - Registro de gastos e ingresos en 2 toques con categorías predefinidas.
   - **Escáner de recibos y tickets**: Toma una foto y Gemini extrae comercio, total, fecha y categoría, abriendo un modal con glow para confirmar antes de guardar.
   - Gráfica de anillo (donut) SVG de distribución por categoría.
   - Gráfica de línea con saldo acumulado diario y proyección financiera a fin de mes.
   - Suscripciones mensuales con alertas de cobros inminentes y metas de ahorro con cálculo de aporte mensual.

3. **💬 Chat IA (Copiloto Global)**:
   - Chat contextual con memoria continua que recibe un snapshot consolidado (`context.js`) de todos tus módulos.
   - Preguntas como *"¿Cómo voy este mes?"*, *"¿A quién debo cobrarle?"* o *"Organízame la semana"* reciben respuestas precisas basadas en tus datos reales.
   - Chips de sugerencias rápidas e historial guardado en IndexedDB.

4. **💼 Negocio**:
   - Directorio de clientes y gestión de presupuestos con estados (*borrador*, *enviado*, *aprobado*, *pagado*).
   - Métricas comerciales: total facturado, cobrado este mes y dinero por cobrar.
   - Lista urgente de presupuestos aprobados pendientes de cobro con botón **"Cobrar con IA"** que redacta el mensaje de cobro listo para WhatsApp o email.
   - Generador de propuestas comerciales completas en Markdown con Gemini.

5. **🧠 Memoria**:
   - Notas rápidas, fotos comprimidas, enlaces web y notas de voz.
   - **Escáner de documentos OCR**: Sube una foto de un papel o documento y Gemini extrae título, descripción, etiquetas y texto completo transcribible.
   - **Búsqueda en lenguaje natural con IA**: Pregunta *"¿Dónde anoté las medidas del mueble?"* y Gemini busca entre tus notas y te devuelve el contenido relevante.
   - Sistema de etiquetas (#tags) interactivo.

6. **🎙️ Reuniones**:
   - Grabación de voz con `MediaRecorder` de hasta 10 minutos (audio comprimido a 32 kbps).
   - Transcripción y análisis con Gemini Flash: genera acta con resumen en viñetas y tareas identificadas con fechas de vencimiento.
   - **"Pasar tareas a Hoy"**: Las acciones acordadas en la reunión se insertan directamente en tu lista de tareas de *Hoy*.

7. **💪 Salud y Fitness**:
   - **Nutrición con IA**: Toma una foto a tu plato o describe tu comida; Gemini estima calorías, proteínas, carbohidratos y grasas con confirmación en modal.
   - **Entrenamiento**: Creación de rutinas personalizadas, registro de series, pesos (kg/lbs) y repeticiones.
   - **Progresión de Cargas**: Gráfica SVG de evolución del peso máximo por ejercicio.
   - **Hábitos**: Rachas continuas con cálculo automático de días consecutivos cumplidos.

8. **🗣️ Idiomas**:
   - **Tutor de voz interactivo**: Graba tu audio en inglés, francés, alemán, etc.; Gemini transcribe tu mensaje, te responde en el idioma de estudio y te explica tus errores gramaticales en español.
   - Opción para guardar los errores detectados directamente en **Tarjetas de Repaso (Flashcards)**.
   - Traductor contextual con pronunciación y alternativas.
   - Sistema de repaso espaciado con tarjetas interactivas.

9. **✈️ Viajes**:
   - Planificador inteligente: ingresa destino, fechas (máx. 31 días), presupuesto y estilo de viaje.
   - Gemini crea un itinerario completo día a día con horarios, desglose de presupuesto por categoría y lista de equipaje recomendada.
   - **100% Offline**: Todo el itinerario y el checklist interactivo de equipaje se guardan en IndexedDB para consultarlos sin internet en tu destino.

---

## 📁 Estructura del Código

```text
nexo/
├── index.html              # Shell HTML, safe-areas de iOS y estructura de 3 columnas
├── tokens.css              # Variables de diseño M3, Glow UI y tipografías
├── styles.css              # Layout responsive, componentes, modales y animaciones
├── app.js                  # Router SPA, navegación móvil/escritorio, gestión de datos
├── manifest.json           # Manifiesto PWA standalone y configuración de iconos
├── sw.js                   # Service Worker offline (caché nexo-v1 sin tocar /api/)
├── icons/
│   ├── icon-180.png        # Icono Apple Touch para iPhone Retina
│   ├── icon-192.png        # Icono PWA estándar
│   └── icon-512.png        # Icono PWA de alta resolución
├── js/
│   ├── db.js               # Envoltorio IndexedDB (20 almacenes), eventos y fotos
│   ├── ai.js               # Cliente de /api/ai, MediaRecorder y audio
│   ├── ui.js               # Constructores DOM seguros (h), gráficas SVG, modales y sheets
│   ├── context.js          # Métricas globales y constructor del contexto para Gemini
│   ├── hoy.js              # Módulo Hoy
│   ├── finanzas.js         # Módulo Finanzas
│   ├── chat.js             # Módulo Chat IA
│   ├── negocio.js          # Módulo Negocio
│   ├── memoria.js          # Módulo Memoria
│   ├── reuniones.js        # Módulo Reuniones
│   ├── salud.js            # Módulo Salud
│   ├── idiomas.js          # Módulo Idiomas
│   └── viajes.js           # Módulo Viajes
├── functions/
│   └── api/
│       └── ai.js           # Endpoint de IA (backend seguro para Gemini Flash)
├── _worker.js              # Worker que conecta /api/ai y los archivos estáticos
├── wrangler.jsonc          # Configuración de despliegue del Worker nexo
├── .assetsignore           # Evita publicar el código del backend como archivo estático
└── README.md
```

---

## 🔑 1. Obtener tu Clave Gratuita de Google Gemini

1. Entra a [Google AI Studio](https://aistudio.google.com/).
2. Inicia sesión con tu cuenta de Google.
3. Haz clic en **"Get API key"** (o "Crear clave de API").
4. Elige un proyecto y copia tu clave (comienza con `AIzaSy...`).
5. El plan gratuito de Gemini ofrece una cuota limitada para probar el modelo Flash (`gemini-2.5-flash`); consulta Google AI Studio para ver los límites actuales.

---

## 💻 2. Cómo Probar la App en Local

### Opción A: Prueba estática y modo offline (Interfaz + IndexedDB)
Para verificar la interfaz, el Service Worker y el almacenamiento local en tu red o computadora:

```bash
python3 -m http.server 8080
```
Luego abre en tu navegador:
```text
http://localhost:8080
```

### Opción B: Prueba completa local con IA (usando Wrangler)
Desde la carpeta `nexo`, inicia el mismo Worker que se despliega en Cloudflare:

```bash
npx wrangler dev --port 8788
```

Para desarrollo local, guarda la clave en un archivo `.dev.vars` dentro de `nexo` (no lo subas al repositorio):

```text
GEMINI_API_KEY=TU_CLAVE_AIzaSy...
```

Luego abre:
```text
http://localhost:8788
```

## 🚀 3. Despliegue en Cloudflare Worker

El Worker de este proyecto se llama `nexo` (URL: `nexo.johanrestrepoo.workers.dev`). La configuración `wrangler.jsonc` hace que el Worker atienda `/api/ai` y sirva la aplicación desde el mismo dominio.

### Si el repositorio ya está conectado al Worker por Git
Conserva la conexión y despliega desde la raíz `nexo/`. Cloudflare debe detectar `wrangler.jsonc` y desplegar el Worker llamado `nexo`. Si el panel solicita comandos:

- **Root directory**: `nexo`
- **Build command**: *(dejar en blanco)*
- **Deploy command**: `npx wrangler deploy`

Al desplegar, confirma que se actualice el Worker existente `nexo`, no que se cree otro Worker con un nombre distinto.

### Despliegue manual con Wrangler
Desde la carpeta `nexo`, si ya iniciaste sesión con `npx wrangler login`:
```bash
npx wrangler deploy
```

## ⚙️ 4. Configurar `GEMINI_API_KEY` en Cloudflare

Guarda la clave como secreto del Worker; no la pongas en los archivos de la aplicación.

Desde una terminal autenticada con Wrangler:

```bash
npx wrangler secret put GEMINI_API_KEY
```

Cuando lo solicite, pega la clave de Google AI Studio. También puedes añadirla en el panel del Worker `nexo`, en **Settings → Variables and Secrets → Add**, como tipo **Secret**. Luego vuelve a desplegar o crea un nuevo despliegue para aplicar los cambios.

No es necesario crear otra página ni exponer la clave en el navegador: la web y el endpoint viven en el mismo Worker.

---

## 📱 5. Instalación en iPhone (Safari Pantalla Completa)

1. En tu iPhone, abre **Safari** e ingresa a tu dominio de Cloudflare (ej. `https://nexo.pages.dev`).
2. Toca el botón **Compartir** en la barra inferior de Safari (icono de cuadrado con flecha hacia arriba).
3. Desliza hacia abajo en el menú y selecciona **"Agregar a pantalla de inicio"** (*Add to Home Screen*).
4. Confirma el nombre "Nexo" y pulsa **Agregar** en la esquina superior derecha.
5. ¡Listo! Abre el icono de Nexo desde tu pantalla de inicio:
   - Se ejecutará en modo **standalone** (pantalla completa sin barras de Safari).
   - Se adaptará con elegancia al notch, Dynamic Island y barra inferior de gestos.
   - Funcionará 100% offline para todos los registros locales.

---

## 🔒 6. Seguridad y Respaldo de Datos

- **Sin claves en el cliente**: Ninguna clave de API se almacena en el teléfono ni viaja en el frontend. Todo pasa por el Worker.
- **Sanitización XSS**: Todo el contenido generado por la IA o escrito por el usuario se escapa antes de renderizarse.
- **Almacenamiento Local Soberano**: Todos tus registros (gastos, clientes, tareas, notas, salud) se quedan en tu iPhone dentro de `IndexedDB`.
- **Exportación e Importación**:
  - Toca el botón **Más** (o el icono de historial en escritorio) y entra a **Datos**.
  - Puedes descargar en cualquier momento un respaldo integral en archivo `.json` o importarlo en otro dispositivo.
