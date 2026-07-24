# AGENTS.md — SQL Tutor

Este archivo contiene las instrucciones permanentes para cualquier agente de programación que trabaje en este repositorio.

Las instrucciones específicas de cada tarea tienen prioridad sobre este documento. Cuando una tarea contradiga una regla de este archivo, el agente debe señalar brevemente la contradicción y seguir la instrucción explícita del usuario, salvo que implique dañar el repositorio o perder trabajo.

---

## 1. Objetivo del proyecto

SQL Tutor es una aplicación educativa para aprender SQL mediante:

- edición y ejecución de consultas;
- base de datos temporal en memoria;
- visualización del orden lógico de ejecución;
- modo completo y modo paso a paso;
- explicaciones pedagógicas;
- visualización de subconsultas;
- historial de consultas;
- biblioteca de conceptos;
- creación, modificación y eliminación de tablas temporales;
- importación de archivos SQL.

El objetivo principal no es solamente ejecutar SQL, sino explicar visualmente cómo se procesa cada consulta.

Toda modificación debe preservar ese enfoque pedagógico.

---

## 2. Principios generales

Priorizar siempre:

- comportamiento correcto;
- claridad del código;
- cohesión alta;
- acoplamiento bajo;
- responsabilidades concretas;
- refactorización incremental;
- componentes con contratos claros;
- cambios pequeños y verificables;
- compatibilidad con el comportamiento existente.

Evitar:

- sobreingeniería;
- abstracciones prematuras;
- capas sin una necesidad real;
- componentes genéricos difíciles de entender;
- duplicación de lógica;
- dependencias circulares;
- cambios masivos no solicitados;
- reescrituras completas cuando alcanza con una extracción incremental;
- incorporar librerías para resolver problemas simples;
- modificar varias responsabilidades en una misma etapa sin necesidad.

Si una extracción aumenta el acoplamiento, empeora la legibilidad o exige una arquitectura artificial, detener esa parte y explicar el problema. Es preferible una extracción parcial bien hecha que una separación forzada.

---

## 3. Flujo obligatorio antes de modificar

Antes de cambiar archivos:

1. Leer este `AGENTS.md`.
2. Revisar el estado actual del repositorio:
   - `git status`
   - rama actual;
   - cambios sin confirmar.
3. Inspeccionar los archivos involucrados antes de proponer una solución.
4. Ejecutar:
   - `npm test`
   - `npm run build`
5. Registrar si alguno de esos comandos ya falla antes de la modificación.
6. Identificar:
   - comportamiento actual;
   - estados involucrados;
   - props;
   - callbacks;
   - helpers;
   - dependencias;
   - posibles efectos laterales.
7. Confirmar que no se sobrescribirán cambios existentes del usuario.

No asumir que la estructura documentada sigue siendo exacta. Verificar siempre el código real.

---

## 4. Ramas y seguridad del trabajo

Trabajar sobre la rama actual salvo que el usuario indique otra cosa.

No cambiar de rama automáticamente.

Crear una rama temporal únicamente cuando:

- la modificación sea realmente riesgosa;
- implique una migración amplia;
- afecte muchas responsabilidades centrales;
- el usuario lo autorice;
- o no exista una forma segura de continuar sobre la rama actual.

Antes de crear una rama, informar por qué es necesaria.

Nunca:

- ejecutar `git reset --hard`;
- ejecutar `git clean -fd`;
- descartar cambios del usuario;
- sobrescribir archivos completos sin revisar sus cambios actuales;
- forzar un push;
- reescribir historial;
- usar `git checkout --`, `git restore` o comandos destructivos sobre cambios que no fueron creados durante la tarea.

---

## 5. Alcance de las tareas

Modificar únicamente lo necesario para cumplir la tarea actual.

No aprovechar una tarea para:

- renombrar archivos no relacionados;
- reformatear todo el proyecto;
- cambiar textos;
- modificar estilos;
- instalar dependencias;
- alterar la arquitectura completa;
- corregir detalles ajenos;
- implementar elementos del roadmap;
- hacer optimizaciones no solicitadas.

Cuando aparezca una mejora válida pero fuera de alcance:

1. no implementarla;
2. registrarla en `docs/ROADMAP.md` si corresponde;
3. mencionarla brevemente en el informe final.

---

## 6. Arquitectura actual y dirección deseada

La aplicación debe evolucionar de forma incremental hacia una estructura donde:

- `App.jsx` coordine la página y los casos de uso principales;
- los componentes presentacionales estén separados por dominio;
- los hooks encapsulen comportamiento React reutilizable o claramente aislable;
- los servicios encapsulen operaciones externas o casos de uso que no pertenecen a la vista;
- los helpers visuales transformen datos sin depender de React;
- el motor SQL permanezca independiente de la interfaz;
- los datos pasivos estén separados de los componentes.

Dominios actuales o esperados:

```text
src/
├── components/
│   ├── editor/
│   ├── history/
│   ├── journey/
│   ├── layout/
│   ├── library/
│   ├── sandbox/
│   ├── subqueries/
│   └── tables/
├── data/
├── hooks/
├── lib/
├── services/
└── visual/
```

Esta estructura es orientativa. No crear carpetas o archivos vacíos, ni forzar un archivo por cada componente pequeño.

Un componente puede mantenerse dentro del archivo de su padre cuando:

- solo se usa allí;
- tiene pocas líneas;
- no posee una responsabilidad independiente;
- separarlo dificulta la lectura;
- no existe una API clara para convertirlo en componente independiente.

---

## 7. Motor SQL

El motor SQL es una pieza central del proyecto.

Por defecto, no modificar:

```text
src/lib/sqlEngine.js
```

Solo modificarlo cuando la tarea solicite explícitamente:

- agregar o corregir soporte SQL;
- corregir una ejecución incorrecta;
- modificar metadatos producidos por el motor;
- mejorar errores propios del motor;
- ampliar su cobertura.

Cuando se modifique el motor:

1. entender el contrato actual;
2. agregar o actualizar tests;
3. preservar compatibilidad cuando sea posible;
4. no mezclar el cambio con refactors visuales;
5. documentar:
   - sintaxis afectada;
   - casos nuevos;
   - limitaciones;
   - tests agregados;
   - posibles incompatibilidades.

Los componentes React no deben importar el motor directamente salvo que sean explícitamente el coordinador de ejecución. Preferir callbacks o servicios con responsabilidades claras.

No duplicar en componentes la lógica que ya existe en:

- `src/visual/visualSteps.js`;
- `src/visual/subqueryVisual.js`;
- `src/visual/tableDiff.js`;
- otros helpers visuales equivalentes que existan en el repositorio.

---

## 8. Estado de la base temporal

La base de datos temporal es estado funcional del usuario.

Debe conservarse cuando el usuario:

- limpia el editor;
- limpia la ejecución visual;
- cambia de consulta;
- abre o cierra overlays;
- consulta el historial;
- usa la biblioteca;
- cambia preferencias visuales.

### Limpiar editor

La acción de limpiar o resetear el editor debe:

- vaciar el input SQL;
- deseleccionar el ejemplo actual;
- limpiar el resultado;
- limpiar la ejecución visual;
- limpiar errores y estados temporales relacionados;
- devolver el área de ejecución a su estado inicial.

No debe:

- recargar la página;
- ejecutar `createSeedDatabase()`;
- eliminar tablas creadas;
- revertir `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE` o `DROP TABLE`;
- borrar el historial;
- cambiar el tema;
- restaurar automáticamente las tablas predeterminadas.

### Restaurar base de ejemplo

“Restaurar base de ejemplo” es una acción futura y destructiva separada.

Cuando se implemente deberá:

- ser independiente de limpiar el editor;
- advertir que elimina tablas y registros temporales;
- solicitar confirmación;
- llamar a `createSeedDatabase()` solamente después de confirmar;
- limpiar ejecuciones visuales incompatibles;
- preservar preferencias visuales;
- conservar el historial salvo decisión explícita diferente.

La tarea pendiente debe permanecer registrada en:

```text
docs/ROADMAP.md
```

No implementarla en una refactorización que no la solicite.

---

## 9. Componentes React

Cada componente debe tener una responsabilidad identificable.

Preferir:

- props pequeñas y semánticas;
- callbacks con nombres de intención;
- estado local para comportamiento exclusivamente visual;
- datos derivados en lugar de estados duplicados;
- componentes presentacionales sin acceso al motor;
- imports directos y fáciles de rastrear.

Evitar:

- pasar objetos gigantes sin necesidad;
- prop drilling artificial provocado por una mala extracción;
- almacenar el mismo dato en varios estados;
- copiar JSX para evitar diseñar una API;
- crear un componente genérico con demasiadas variantes;
- efectos que sincronizan estados que podrían derivarse;
- mutar props;
- componentes con acceso innecesario a `document`, `window` o almacenamiento.

Los estados pueden permanecer locales cuando solo afectan al componente, por ejemplo:

- búsqueda de la biblioteca;
- índice de un carrusel;
- mostrar u ocultar una traza interna;
- paso visual seleccionado;
- orden lógico o escrito;
- formulario temporal de una vista.

Elevar un estado únicamente cuando otro componente realmente necesite leerlo o modificarlo.

---

## 10. Hooks

Crear un hook cuando:

- encapsula comportamiento React;
- coordina varios estados relacionados;
- contiene efectos y limpieza;
- reduce claramente la responsabilidad de un componente;
- tiene una API semántica.

No crear hooks para:

- envolver una sola línea;
- esconder lógica difícil sin mejorar su diseño;
- mover código sin definir un contrato;
- reemplazar una función pura;
- introducir abstracciones que solo se usan una vez y empeoran la lectura.

Los hooks:

- no deben contener JSX;
- no deben producir dependencias circulares;
- deben limpiar listeners, clases y efectos;
- deben tolerar que `window` o `document` no existan cuando corresponda;
- deben devolver la API mínima necesaria.

---

## 11. Services y helpers

Usar services para:

- importación o lectura de archivos;
- persistencia;
- comunicación con APIs;
- coordinación de casos de uso fuera de la vista;
- operaciones que no dependen de JSX.

Usar helpers puros para:

- transformar datos;
- construir modelos visuales;
- comparar tablas;
- calcular pasos;
- normalizar información;
- producir textos o etiquetas derivadas.

Una función pura:

- no modifica argumentos;
- no accede al DOM;
- no depende de estado React;
- no genera efectos secundarios;
- debe poder probarse de forma aislada.

No llamar “service” a una colección arbitraria de helpers.

---

## 12. Estilos y estructura visual

Por defecto, no modificar:

```text
src/styles.css
```

salvo que la tarea sea visual, responsive o requiera expresamente cambios de estilo.

En refactorizaciones estructurales:

- conservar todas las clases CSS;
- conservar jerarquía HTML relevante;
- conservar textos;
- conservar iconos;
- conservar atributos funcionales;
- conservar comportamiento responsive;
- conservar estados hover, focus y disabled;
- no cambiar el diseño “aprovechando” la extracción.

No introducir CSS-in-JS, frameworks CSS o librerías de componentes sin una solicitud explícita.

---

## 13. Accesibilidad

Se pueden realizar mejoras pequeñas de accesibilidad durante una extracción únicamente si:

- no cambian el diseño;
- no cambian el comportamiento;
- no amplían innecesariamente el alcance;
- son inequívocamente correctas.

Ejemplos aceptables:

- `aria-label` en botones con solo icono;
- `type="button"` donde evita submits accidentales;
- asociación entre labels e inputs;
- `aria-expanded` en controles existentes;
- foco lógico al abrir un modal, si puede implementarse sin alterar el flujo.

No convertir una refactorización en una auditoría completa de accesibilidad sin solicitud.

---

## 14. Dependencias

No instalar dependencias sin una necesidad clara y autorización explícita o implícita en la tarea.

Antes de agregar una dependencia:

1. verificar que la plataforma o JavaScript nativo no resuelvan el problema;
2. explicar para qué se necesita;
3. evaluar impacto en bundle y mantenimiento;
4. confirmar compatibilidad con la versión actual de React y Vite.

No agregar automáticamente:

- Router;
- Context global;
- Redux;
- Zustand;
- Axios;
- Bootstrap;
- bibliotecas de modales;
- librerías de formularios;
- librerías de íconos;
- backend;
- autenticación.

Estas herramientas pueden incorporarse en etapas futuras si un caso de uso real las justifica.

---

## 15. Router, Context y backend

No introducir Router solo para reorganizar componentes.

Agregar Router cuando existan páginas reales y navegación diferenciada, por ejemplo:

- aplicación principal;
- `/about`;
- `/limitations`;
- ejercicios;
- ruta de aprendizaje;
- documentación interna.

No introducir Context para evitar algunas props.

Agregar Context únicamente para estado realmente transversal, por ejemplo:

- usuario autenticado futuro;
- tema, si deja de ser local y se usa en múltiples páginas;
- workspace compartido por rutas;
- configuración global.

El backend está postergado hasta que existan casos de uso claros, como:

- usuarios;
- espacios guardados;
- progreso;
- ejercicios;
- feedback;
- estadísticas docentes;
- sincronización.

No implementar backend durante refactors del frontend.

---

## 16. Historial y persistencia

Conservar el formato actual del historial salvo que la tarea solicite cambiarlo.

No agregar persistencia automáticamente.

Cuando se implemente persistencia:

- debe ser opcional y controlada;
- debe manejar datos inválidos;
- debe versionar el formato si es necesario;
- no debe bloquear el funcionamiento offline;
- debe distinguir historial de workspace;
- debe contemplar límites de almacenamiento.

---

## 17. Importación de archivos

La importación SQL debe:

- aceptar únicamente los formatos definidos por la aplicación;
- mostrar errores comprensibles;
- no ejecutar automáticamente contenido importado salvo que el comportamiento lo indique expresamente;
- limpiar el input del archivo cuando sea necesario para permitir reimportar;
- mantener separada la lectura del archivo de la ejecución SQL;
- evitar acceso al DOM desde funciones puras.

No ampliar formatos ni cambiar límites sin solicitud.

---

## 18. Errores y mensajes

Conservar los mensajes actuales durante refactorizaciones.

Cuando la tarea sea mejorar errores:

- priorizar mensajes pedagógicos;
- indicar qué parte de la consulta falló;
- evitar exponer stacks al usuario;
- mantener información técnica útil para desarrollo;
- no ocultar fallos silenciosamente.

No usar `try/catch` vacío ni devolver resultados falsos para hacer pasar tests.

---

## 19. Tests

Los tests existentes son una red de seguridad obligatoria.

Antes y después de modificar:

```bash
npm test
```

Cuando se agregue comportamiento:

- agregar casos representativos;
- incluir casos límite;
- evitar tests acoplados a detalles internos innecesarios;
- preferir probar contratos y resultados;
- mantener determinismo.

Cuando se refactorice sin cambio funcional:

- no reescribir tests sin necesidad;
- no eliminar casos para facilitar el refactor;
- no cambiar expectativas salvo que el contrato cambie explícitamente.

Si el proyecto no tiene infraestructura de tests para React:

- no instalarla durante una extracción simple;
- probar funciones puras cuando existan;
- indicar claramente qué requiere validación manual;
- no crear tests artificiales que no aportan confianza.

Nunca considerar terminada una tarea con tests fallando, salvo que:

- ya fallaran antes;
- el fallo no esté relacionado;
- se documente con precisión;
- el usuario decida continuar.

---

## 20. Build y validación técnica

Después de cada modificación ejecutar:

```bash
npm test
npm run build
git diff --check
```

Cuando corresponda, también ejecutar:

```bash
npm run lint
```

No asumir que existe un script de lint. Verificar `package.json`.

La validación final debe informar:

- resultado de tests;
- resultado del build;
- resultado de `git diff --check`;
- lint, si existe;
- archivos creados;
- archivos modificados;
- cambios funcionales;
- riesgos o puntos pendientes.

No corregir warnings no relacionados salvo que impidan validar la tarea.

---

## 21. Pruebas manuales

Los tests automatizados no reemplazan las pruebas manuales de la interfaz.

Para cada etapa, proponer una lista corta y concreta de validación manual que cubra:

- comportamiento modificado;
- comportamiento que debe preservarse;
- escritorio;
- vista móvil cuando corresponda;
- estados vacíos;
- errores;
- interacción repetida;
- cambios entre consultas;
- conservación de la base temporal.

No afirmar que una prueba manual fue realizada por el agente si no fue realmente ejecutada con una herramienta capaz de interactuar con la interfaz.

Distinguir siempre entre:

- inspección del código;
- test automatizado;
- build;
- validación manual realizada por el usuario.

---

## 22. Commits y push

No hacer commit automáticamente.

No hacer push automáticamente.

Solo hacer commit o push cuando el usuario lo solicite de forma explícita.

Antes de un commit:

1. ejecutar validaciones;
2. revisar `git status`;
3. revisar el diff;
4. incluir solo cambios relacionados;
5. evitar archivos temporales;
6. informar qué entrará en el commit.

Usar mensajes de commit claros y consistentes:

```text
refactor(scope): description
feat(scope): description
fix(scope): description
test(scope): description
docs(scope): description
chore(scope): description
```

Ejemplos:

```text
refactor(sandbox): extract schema components
refactor(overlays): extract history and library components
fix(editor): preserve temporary database on reset
docs(roadmap): document planned workspace restoration
```

Después de un commit informar:

- hash corto;
- mensaje;
- archivos incluidos;
- estado del repositorio.

No usar `--amend` salvo solicitud explícita.

---

## 23. Documentación

Mantener documentación útil y específica.

Archivos relevantes:

```text
README.md
docs/ROADMAP.md
AGENTS.md
```

### README

Debe explicar principalmente:

- qué es SQL Tutor;
- cómo instalarlo;
- cómo ejecutarlo;
- comandos disponibles;
- funcionalidades principales;
- limitaciones importantes;
- enlace al roadmap.

No convertir el README en una lista extensa de tareas internas.

### Roadmap

Registrar en `docs/ROADMAP.md`:

- funcionalidades futuras;
- prioridad;
- estado;
- alcance esperado;
- decisiones pendientes.

No implementar elementos del roadmap sin que la tarea lo solicite.

### AGENTS.md

Este archivo contiene reglas de trabajo para agentes. No debe usarse como documentación de usuario final.

---

## 24. Roadmap vigente

Verificar `docs/ROADMAP.md` antes de agregar funcionalidades futuras.

Entre las mejoras planificadas pueden encontrarse:

- restaurar base de ejemplo mediante una acción separada y confirmada;
- documentación completa en `/docs`;
- página `/about`;
- página `/limitations`;
- ruta de aprendizaje;
- ejercicios;
- pistas;
- correcciones pedagógicas;
- errores más detallados;
- persistencia opcional de espacios de trabajo;
- usuarios y progreso en una etapa futura;
- estadísticas para docentes;
- funcionamiento offline.

Esta lista es orientativa. El roadmap real es la fuente de verdad.

---

## 25. Informe al finalizar una tarea

Al terminar, responder de forma concreta con:

1. resumen de lo realizado;
2. archivos creados;
3. archivos modificados;
4. decisiones arquitectónicas relevantes;
5. comportamiento preservado;
6. resultado de:
   - tests;
   - build;
   - `git diff --check`;
   - lint, si corresponde;
7. cantidad de líneas de `App.jsx` antes y después cuando la tarea sea una extracción;
8. pruebas manuales recomendadas;
9. puntos pendientes o riesgos;
10. confirmación de que no se hizo commit, salvo que haya sido solicitado.

No ocultar:

- comandos fallidos;
- tests que no pudieron ejecutarse;
- archivos que debieron tocarse fuera del alcance inicial;
- cambios funcionales inevitables;
- incertidumbres.

---

## 26. Criterio para detenerse

Detenerse y explicar antes de continuar cuando:

- una extracción requiere cambiar contratos centrales no contemplados;
- se detectan cambios sin confirmar que podrían perderse;
- el proyecto ya falla antes de modificar y no está claro por qué;
- se necesita una dependencia nueva no solicitada;
- la tarea contradice una restricción importante;
- existe riesgo real de dependencia circular;
- el cambio exige modificar simultáneamente motor, UI y datos sin una estrategia segura;
- el resultado sería más complejo que el código original;
- no puede preservarse el comportamiento actual.

No detenerse por detalles menores que puedan resolverse con una decisión razonable y documentada.

---

## 27. Regla final

El objetivo no es maximizar la cantidad de archivos ni aplicar patrones por nombre.

El objetivo es que SQL Tutor sea:

- correcto;
- comprensible;
- mantenible;
- educativo;
- demostrable como proyecto profesional;
- fácil de extender sin perder su propósito.

Cada cambio debe justificar su complejidad.
