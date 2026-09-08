# LEM537 — Primera Evaluación Parcial (examen en línea)

Instrumento de evaluación en línea de la asignatura **Diseño de Elementos de Máquinas I**
(LEM537), Ingeniería Electromecánica, Universidad La Salle Bajío.

El alumno abre una página, se identifica, responde 25 reactivos y **descarga un PDF** que
entrega en Microsoft Teams. No hay servidor: todo ocurre en el navegador.

---

## Publicación en GitHub Pages

```bash
git init
git add .
git commit -m "Examen LEM537 — primer parcial"
git branch -M main
git remote add origin git@github.com:<usuario>/<repositorio>.git
git push -u origin main
```

En **Settings → Pages**, seleccionar *Deploy from a branch* → rama `main`, carpeta `/ (root)`.
La dirección resultante es `https://<usuario>.github.io/<repositorio>/`.

El archivo `.nojekyll` ya está incluido: sin él, GitHub ignora algunas rutas.
No se requiere ningún otro paso de compilación ni dependencia externa.

### Recomendaciones de publicación

* **Publique el repositorio el día del examen** y archívelo al terminar. El código fuente
  contiene los enunciados; cualquiera con la dirección puede leerlos.
* Si su cuenta institucional tiene GitHub Pro o Education, puede mantener el repositorio
  **privado** y aun así publicar Pages.
* Reparta la dirección por Teams al inicio de la sesión, no antes.
* **Nunca** coloque en este repositorio la carpeta `docente/`: contiene la clave, la
  rúbrica y el catálogo de marcas anti-IA.

---

## Qué debe hacer el alumno

1. Abrir la dirección en Chrome, Edge o Firefox actualizados (funciona también en tableta).
2. Capturar nombre completo y **matrícula** — la matrícula determina sus datos numéricos.
3. Aceptar la declaración de integridad e iniciar.
4. Responder los 25 reactivos. Las respuestas se guardan solas en el navegador; si se
   cierra la pestaña por accidente, al volver a entrar con la misma matrícula se ofrece
   recuperar la sesión.
5. Pulsar **Generar y descargar PDF** y subir ese archivo, sin renombrarlo, a la tarea de
   Microsoft Teams.

Si un alumno necesita corregir después de generar el PDF, puede hacerlo y volver a
generarlo: se entrega únicamente la última versión.

---

## Estructura

```
index.html              Examen completo (portada, reactivos, cierre)
assets/styles.css       Hoja de estilo
assets/banco.js         Banco de reactivos y generador de variantes (archivo generado)
assets/examen.js        Lógica de la aplicación y registro de integridad
assets/pdf.js           Composición del PDF de entrega
assets/logo.js          Logotipo institucional (PNG base64)
assets/fuentes.js       Subconjunto de DejaVu Sans para el PDF (acentos y símbolos griegos)
vendor/jspdf.umd.min.js Biblioteca jsPDF 4.2.1 (MIT)
```

Todo está incluido en el repositorio: la página **no hace ninguna petición a internet**,
por lo que funciona aunque la red del aula esté saturada o filtrada, y puede ejecutarse
desde una memoria USB abriendo `index.html` directamente.

---

## Características del instrumento

* **15 reactivos de criterio** (60 pts) de redacción libre, sobre las Unidades I y II.
* **10 reactivos numéricos** (40 pts) con datos **individualizados por matrícula**: dos
  alumnos no tienen los mismos números, de modo que copiar un resultado produce una
  respuesta incorrecta y trazable.
* **Registro de integridad**: la aplicación cuenta copiados, pegados, salidas de la
  ventana y duración de la sesión, y lo imprime en el PDF. El alumno es informado de esto
  en la portada y lo acepta explícitamente antes de comenzar.
* **Marcas de trazabilidad** en los enunciados, descritas en la portada del examen sin
  revelar su mecanismo.
* **PDF autocontenido**: reproduce enunciados, respuestas, datos de la variante aplicada y
  el registro de sesión, con delimitadores que permiten su procesamiento automático.

---

## Requisitos técnicos

Navegador con soporte de `TextDecoder`, `Intl` y descarga de archivos generados
(Chrome/Edge ≥ 90, Firefox ≥ 90, Safari ≥ 15). En iOS, la descarga llega a la app
*Archivos*. Debe permitirse la descarga de archivos y no debe abrirse la página en modo
incógnito con almacenamiento bloqueado, porque se pierde el autoguardado.

---

## Licencias de terceros

* [jsPDF](https://github.com/parallax/jsPDF) 4.2.1 — licencia MIT.
* [DejaVu Fonts](https://dejavu-fonts.github.io/) — DejaVu Fonts License (derivada de
  Bitstream Vera), libre distribución. Se incluye un subconjunto de glifos.

El logotipo institucional y el contenido académico son propiedad de la Universidad La
Salle Bajío y del autor del instrumento; uso interno del curso.
