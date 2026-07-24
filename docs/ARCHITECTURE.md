# SQL Tutor Architecture

## Proposito

SQL Tutor es una SPA educativa para escribir, ejecutar y explicar consultas SQL sobre una base temporal en memoria. La arquitectura actual prioriza que el flujo SQL sea visible y pedagógico: el motor produce resultados y pasos, la capa visual transforma esos pasos para UI, y React coordina la experiencia sin backend ni persistencia.

Este documento describe el estado real actual del frontend despues de las refactorizaciones recientes. `AGENTS.md` define reglas de trabajo; este archivo documenta el sistema.

## Estructura actual

```text
src/
├── App.jsx
├── main.jsx
├── styles.css
├── components/
│   ├── editor/
│   ├── explanation/
│   ├── history/
│   ├── journey/
│   ├── layout/
│   ├── library/
│   ├── results/
│   ├── sandbox/
│   ├── subqueries/
│   ├── tables/
│   └── ui/
├── data/
├── hooks/
├── lib/
├── services/
└── visual/

docs/
├── ARCHITECTURE.md
├── ARCHITECTURE_AUDIT.md
├── ROADMAP.md
└── SQLTutor-source.zip
```

Responsabilidades por grupo:

- `src/main.jsx`: punto de entrada React y carga de `styles.css`.
- `src/App.jsx`: composition root. Coordina runtime, editor, historial, navegacion visual, overlays, sandbox, biblioteca y layout principal.
- `src/components/`: componentes presentacionales o de dominio con estado local acotado.
- `src/hooks/`: comportamiento React reutilizable o aislado.
- `src/services/`: servicios sin JSX; hoy solo soporte de importacion SQL.
- `src/data/`: datos pasivos y base inicial.
- `src/lib/`: motor SQL y tests del motor.
- `src/visual/`: helpers puros que adaptan resultados del motor a modelos visuales.
- `docs/ARCHITECTURE_AUDIT.md`: auditoria historica inicial, actualmente desactualizada respecto de la estructura vigente.
- `docs/SQLTutor-source.zip`: artefacto dentro de `docs`; no participa del runtime.

## Flujo de ejecucion SQL

```text
SqlEditor
  -> App.run(startStep)
  -> useSqlRuntime.executeQuery(sql)
  -> splitSqlStatements(sql)
  -> executeSql(...) o executeSqlScript(...)
  -> { db, result, steps, message, ...metadata }
  -> useSqlRuntime actualiza database, execution y error
  -> App reinicia activeStep/showAll/stepMode segun modo
  -> App registra historial solo si la ejecucion fue exitosa
  -> buildVisualSteps(execution)
  -> Journey, ResultPanel, DataTable y ExplanationPanel renderizan el recorrido
```

La ejecucion directa de SQL vive en `src/hooks/useSqlRuntime.js`. Los componentes React no importan el motor. `App.jsx` conserva la intencion de ejecutar y la coordinacion con historial y navegacion visual.

## Flujo de importacion

```text
SqlEditor input[type=file]
  -> useSqlFileImport.handleImportFileChange(event)
  -> sqlImportService valida extension y normaliza contenido
  -> App.importSqlFile(content, fileName)
  -> useSqlRuntime.executeScript(content)
  -> executeSqlScript(content, databaseRef.current)
  -> runtime actualiza database, limpia execution y error
  -> useSqlFileImport muestra mensaje de exito o error
```

La lectura del archivo permanece separada de la ejecucion. `useSqlFileImport` no ejecuta SQL; `useSqlRuntime` no accede al DOM ni lee archivos.

## Base temporal

La base temporal se inicializa en `useSqlRuntime` con `useState(createSeedDatabase)`, por lo que la inicializacion es perezosa. El runtime conserva una referencia (`databaseRef`) para ejecutar contra la base mas reciente y evitar depender de renders intermedios.

El motor devuelve una nueva `db` para DML y DDL mediante copias internas. `SELECT` devuelve la misma base recibida. El runtime siempre adopta `result.db`, lo que mantiene un unico estado de sandbox para editor, importacion y panel de base.

Limpiar el editor o la ejecucion llama a `clearExecution()` y no llama a `createSeedDatabase()`. Por eso se conservan tablas creadas, registros insertados, modificaciones y eliminaciones hasta que la sesion se recargue o se implemente una restauracion explicita.

## Componentes principales

- `SqlEditor`: editor, selector de ejemplos, importacion, mensajes, tracker de clausulas y botones de ejecucion. No conoce el motor.
- `SchemaPanel`: vista del sandbox, creacion de tablas por SQL, eliminacion de tablas y apertura de detalle.
- `TableDetailModal`: detalle de columnas, claves foraneas y registros actuales de una tabla.
- `ResultPanel`: resultado compacto de la ejecucion actual.
- `Journey`: recorrido visual, orden logico/escrito y navegacion por pasos.
- `JourneyStepCard`: tarjeta de cada paso principal o de subconsulta.
- `SubqueryFlow` y componentes de `subqueries/`: visualizacion pedagogica de subconsultas, ciclos correlacionados, parametros externos y retornos.
- `DataTable`: tabla reutilizable con comparacion visual de filas/columnas agregadas o removidas.
- `ExplanationPanel`: guia contextual del paso activo.
- `HistoryModal`: listado de consultas recientes.
- `LibraryDrawer`: biblioteca de conceptos SQL con busqueda local.
- `Scrim`: cierre de overlays bloqueantes.
- `Icon`: iconos SVG internos.

Los componentes no importan `src/lib/sqlEngine.js`. El estado local se usa donde corresponde: busqueda en biblioteca, expansion de tablas, formulario temporal de sandbox, orden del recorrido, resaltado de paso y carrusel de subconsultas.

## Hooks

- `useSqlRuntime()`: responsable de base temporal, ejecucion actual, error, llamadas al motor, ejecucion de scripts, acciones SQL del sandbox, eliminacion de tablas y limpieza de ejecucion/error. API publica: `{ database, execution, error, executeQuery, executeScript, executeSandboxSql, deleteTable, clearExecution, clearError, showError }`.
- `useSqlFileImport({ onImportSqlFile, onError })`: responsable de input file, validacion de extension, lectura con `file.text()`, reseteo del input y mensaje de importacion. No ejecuta SQL.
- `useOverlayState()`: responsable de apertura/cierre de sandbox, biblioteca, historial y explicacion. Calcula `overlayOpen` sin incluir la explicacion porque no es overlay bloqueante. Usa scroll seguro con guardas para `window`/`document`.
- `useBodyScrollLock(locked)`: agrega/remueve la clase `overlay-locked` al `body` cuando un overlay bloqueante esta abierto. Limpia en el cleanup del efecto.

No hay solapamiento critico entre hooks. `useSqlRuntime` es el hook mas amplio, pero su responsabilidad sigue cohesionada porque la base y la ejecucion son inseparables en el contrato del motor.

## Services

`src/services/sqlImportService.js` define:

- `SQL_IMPORT_FILE_ACCEPT`.
- `isSqlImportFile(fileName)`.
- `normalizeImportedSql(content)`.
- `prepareImportedSql(content)`.

El servicio es pequeno pero concreto: encapsula reglas pasivas de importacion. No accede al DOM, no ejecuta SQL y no depende de React.

## Motor SQL

`src/lib/sqlEngine.js` es independiente de React y expone:

- `splitSqlStatements(input)`.
- `executeSql(input, database, outerRow = {})`.
- `executeSqlScript(input, database)`.

El motor ejecuta SELECT, DML, DDL basico, funciones escalares, joins, agregados, operadores de conjuntos y subconsultas soportadas. Tambien produce pasos pedagogicos y metadatos visuales (`steps`, `compare`, `subquerySteps`, `subqueryResults`).

El motor no accede al DOM y no usa estado React. DML y DDL trabajan sobre copias; SELECT conserva la base recibida.

## Capa visual

- `visualSteps.js`: entrada `execution`; salida lista de pasos visuales principales y pasos de subconsulta. Consumidor principal: `App.jsx` y `Journey`.
- `subqueryVisual.js`: entrada `compare` y summaries del motor; salida grupos, textos y valores formateados para subconsultas. Consumidores: `JourneyStepCard`, `SubqueryFlow`, `SubqueryCycleDetail`, `ParameterChips`, `SubqueryBranch`, `CorrelatedSubqueryCarousel`.
- `tableDiff.js`: entrada filas/columnas; salida firmas y columnas de display para comparaciones. Consumidor: `DataTable`.

Estos helpers no contienen JSX, no acceden al DOM y no vuelven a ejecutar SQL. La comparacion visual de tablas esta centralizada en `DataTable` + `tableDiff.js`.

## Estado y flujo de datos

Estado en `App.jsx`:

- Editor: `sql`, `selectedExample`.
- Navegacion visual: `activeStep`, `showAll`, `stepMode`.
- Historial: `history`.
- Preferencia visual: `darkMode`.
- Timer de limpieza: `timer`.

Estado desde hooks:

- Runtime: `database`, `execution`, `error`.
- Importacion: `fileInputRef`, `importMessage`, `sqlFileAccept` y handlers.
- Overlays: `schemaOpen`, `explainOpen`, `historyOpen`, `libraryOpen`, `overlayOpen` y handlers.

Datos derivados:

- `visualSteps = buildVisualSteps(execution)`.
- `activeVisualStep` desde `visualSteps` y `activeStep`.
- `activeResult` desde `activeVisualStep`.
- `activeClause` desde el paso activo.

`App.jsx` funciona como composition root y coordinador. No se creo `useSqlWorkspace` porque la extraccion mezclaria editor, historial, importacion, runtime y navegacion visual con demasiados callbacks y menos claridad.

## Decisiones arquitectonicas

- Mantener `App.jsx` como coordinador de alto nivel: esta corto, el flujo de datos es localizable y no hay prop drilling problematico.
- Mantener `useSqlRuntime` como frontera unica entre React y el motor SQL.
- Mantener `useSqlFileImport` separado del runtime para no mezclar lectura de archivos con ejecucion SQL.
- Mantener `visual/` como capa pura para transformar modelos pedagogicos.
- No introducir dependencias nuevas para resolver problemas que hoy se resuelven con React, Vite y JavaScript nativo.
- No implementar restauracion de base de ejemplo dentro de reset; sigue siendo una accion futura destructiva y confirmada.

## Router, Pages y Context

Router: postergado hasta implementar la primera pagina adicional real. La aplicacion actual tiene una sola pagina. Los overlays actuales son estados de UI, no rutas: no representan navegacion compartible ni vistas independientes.

Estructura minima futura si se agregan paginas:

```text
/
/about
/limitations
/docs
/exercises
/learning-path
```

Pages: postergado. No conviene crear `src/pages/` solo para mover `App.jsx`; una carpeta de paginas debe aparecer cuando existan rutas de nivel superior reales.

Context: no se justifica ahora. Props y hooks locales son suficientes. Tema, runtime, historial, overlays y navegacion visual tienen consumidores cercanos. Context podria ocultar dependencias sin reducir complejidad. Podria evaluarse cuando existan multiples paginas o preferencias globales compartidas.

## Testing

Infraestructura actual:

- Script: `npm test`.
- Runner: `node --test`.
- Archivo: `src/lib/sqlEngine.test.js`.
- Tests actuales: 50.

Cobertura alta:

- Ejemplos integrados.
- SELECT, WHERE, GROUP BY, HAVING, ORDER BY.
- Joins y joins externos.
- DML y DDL.
- Constraints PK/FK/NOT NULL.
- Scripts SQL e importacion a nivel motor.
- Subconsultas, correlacionadas y no correlacionadas.
- Operadores de conjuntos.
- NULL, LIKE, fechas y conversiones.
- Errores pedagogicos del motor.

Cobertura faltante:

- Hooks React (`useSqlRuntime`, `useSqlFileImport`, overlays, scroll lock).
- Integracion UI de reset sin perder base temporal.
- Historial y seleccion de consultas previas.
- Journey, navegacion de pasos y orden escrito/logico.
- Modales/drawers y accesibilidad interactiva.
- Estados responsive y comportamiento manual de overlays.

No hay infraestructura de tests de React. No se recomienda instalarla solo para refactors simples; si se agregan funcionalidades de usuario, Testing Library/Vitest o una estrategia equivalente deberian evaluarse con casos reales de UI.

## Limitaciones actuales

- La cobertura automatizada se concentra en el motor; los flujos React dependen de validacion manual.
- No hay persistencia de historial ni workspace.
- No hay router ni paginas informativas todavia.
- `styles.css` es global y extenso; funciona, pero su cascada es sensible al orden.
- Algunos componentes usan keys por indice para filas sin identificador estable; es aceptable hoy porque son tablas derivadas y efimeras, pero podria ser fragil con edicion interactiva.
- Los modales y drawers tienen labels y roles basicos, pero no implementan gestion completa de foco ni cierre con Escape.
- La importacion no define limite de tamano de archivo.
- `docs/ARCHITECTURE_AUDIT.md` queda como documento historico desactualizado.

## Proximos pasos recomendados

Necesarios antes de nuevas funcionalidades grandes:

- Mantener `App.jsx` como coordinador y no crear `useSqlWorkspace` hasta que haya una responsabilidad nueva clara.
- Definir una estrategia de pruebas UI antes de agregar ejercicios, persistencia o paginas nuevas.
- Documentar limitaciones SQL visibles para usuarios antes de ampliar rutas o contenido.

Recomendados:

- Agregar tests unitarios para helpers puros nuevos si se expanden `visual/` o `services/`.
- Diseñar la accion separada de restaurar base de ejemplo con confirmacion, segun `docs/ROADMAP.md`.
- Mejorar accesibilidad de modales/drawers con foco inicial, retorno de foco y Escape cuando se trabaje especificamente en UI.
- Evaluar limite de tamano para archivos SQL importados si se permite importar contenido mas grande.

Futuros:

- Introducir Router y `src/pages/` cuando exista la primera pagina real (`/about`, `/limitations`, `/docs`, ejercicios o ruta de aprendizaje).
- Evaluar Context solo si multiples paginas necesitan compartir runtime, tema o workspace.
- Considerar persistencia opcional versionada de workspace cuando sea una funcionalidad explicita.
