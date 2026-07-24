# SQLTutor Architecture Audit

> Documento historico. Corresponde a la auditoria inicial previa a las refactorizaciones recientes y no representa la arquitectura vigente.
> La referencia actual del sistema esta en [ARCHITECTURE.md](./ARCHITECTURE.md).

Fecha: 2026-07-24

Estado: auditoria inicial del repositorio. Este documento describe la arquitectura real actual y propone una ruta incremental de refactorizacion sin reescritura completa.

## Alcance

La auditoria considera como fuente mantenible los archivos versionados del proyecto. Se excluyen `node_modules/`, `dist/` y la carpeta accidental ` (2).git/`.

## Mapa de archivos

```text
.
|-- .gitignore
|-- LICENSE
|-- README.md
|-- index.html
|-- package-lock.json
|-- package.json
|-- pnpm-lock.yaml
|-- pnpm-workspace.yaml
|-- vite.config.js
`-- src/
    |-- App.jsx
    |-- main.jsx
    |-- styles.css
    |-- data/
    |   `-- seed.js
    `-- lib/
        |-- sqlEngine.js
        `-- sqlEngine.test.js
```

## Responsabilidad actual por archivo

### `src/main.jsx`

- Punto de entrada React.
- Renderiza `<App />` dentro de `#root`.
- Importa el stylesheet global `styles.css`.

### `src/App.jsx`

- Archivo monolitico principal de la aplicacion.
- Contiene la composicion completa de la SPA.
- Administra estado global de sesion.
- Ejecuta SQL mediante el motor local.
- Coordina editor, sandbox, resultados, recorrido, guia contextual, biblioteca e historial.
- Contiene helpers de visualizacion y explicaciones pedagogicas.
- Contiene varios componentes internos.

### `src/styles.css`

- Hoja de estilos global unica.
- Incluye tokens base, layout, tablas, editor, sandbox, guia, historial, biblioteca, dark mode y responsive.
- Tiene varios overrides acumulados al final para corregir comportamiento de desktop/mobile.
- La cascada actual es sensible al orden.

### `src/data/seed.js`

- Define `createSeedDatabase()`.
- Define ejemplos en `examples`.
- Define conceptos de biblioteca en `concepts`.
- Usa un modelo de tabla basado en arrays con propiedades extra:
  - `rows.columns`
  - `rows.columnTypes`
  - `rows.constraints`

### `src/lib/sqlEngine.js`

- Motor SQL manual y educativo.
- No depende de React, JSX, DOM ni `setState`.
- Expone `splitSqlStatements`, `executeSql` y `executeSqlScript`.
- Mezcla parsing, evaluacion, DDL, DML, SELECT, JOIN, subconsultas, constraints y generacion de pasos visuales.

### `src/lib/sqlEngine.test.js`

- Tests con `node:test` y `node:assert/strict`.
- Cubre ejemplos integrados, SELECT, DML, DDL, constraints, joins, subconsultas, agregados, NULL, set operators y errores pedagogicos.

### Archivos raiz

- `package.json`: scripts `dev`, `build`, `preview`, `test`. Dependencias: React 18 y Vite.
- `vite.config.js`: configuracion minima de Vite con React.
- `index.html`: shell HTML de Vite.
- `.gitignore`: ignora build, dependencias, caches, entornos y metadata accidental.
- `README.md`: descripcion minima.
- `LICENSE`: GPL v3.

## Arquitectura real actual

La aplicacion es una SPA sin router. La ruta principal vive implicitamente en `/`.

Flujo general:

```text
main.jsx
  -> App.jsx
      -> data/seed.js
      -> lib/sqlEngine.js
      -> styles.css global
```

`App.jsx` concentra la mayor parte de la responsabilidad de aplicacion:

- topbar y layout general;
- sidebar del sandbox;
- modal de detalle de tabla;
- editor SQL;
- importacion de archivos;
- panel de resultados;
- recorrido visual;
- guia contextual;
- biblioteca SQL;
- historial;
- dark mode;
- handlers de ejecucion;
- transformacion de pasos del motor a pasos visuales;
- textos pedagogicos.

`sqlEngine.js` es puro respecto de React, pero el contrato que devuelve ya esta orientado a la UI. El motor no solo devuelve datos SQL, tambien devuelve pasos visuales y metadatos pedagogicos.

## Funciones principales encontradas

### En `App.jsx`

- `hasTerminatingSemicolon(input)`: valida que la sentencia o script finalice en `;` ignorando comentarios y strings.
- `Icon({ name, size })`: renderiza SVGs inline usados por toda la UI.
- `rowSignature(row)`: firma estable para comparar filas visualmente.
- `findDisplayColumn(columns, qualified, short)`: busca columnas calificadas o cortas para JOIN visual.
- `DataTable(...)`: tabla generica con soporte de filas agregadas, removidas, columnas removidas y claves de JOIN.
- `columnTypeLabel(rows, column)`: obtiene o infiere tipo de columna para sandbox.
- `SchemaPanel(...)`: lista tablas, crea tablas por SQL, borra tablas y muestra detalle.
- `queryKeywords(sql)`: detecta keywords para el tracker del editor.
- `isSqlImportFile(fileName)`: valida extensiones `.sql` y `.txt`.
- `Editor(...)`: editor SQL, ejemplos, importacion y botones de ejecucion.
- `ResultPanel(...)`: resultado compacto superior.
- `writtenOrderIndex(sql, step, index)`: calcula orden escrito aproximado.
- `buildSubqueryGroups(compare)`: agrupa trazas de subconsultas.
- `buildVisualSteps(execution)`: inserta pasos visuales `SUBCONSULTA` entre pasos del motor.
- `hideSubquerySql(condition)`: oculta SQL interno de subconsultas en textos de condicion externa.
- `parentStepDetail(step)`: adapta detalle del paso padre cuando tiene subconsulta.
- `JoinKeyNote({ compare })`: nota pedagogica de joins.
- `formatSubqueryValue(value)`: formato pedagogico de valores de subconsulta.
- `conditionWithValues(summary, condition)`: anota referencias externas con valores.
- `subqueryReturnText(summary)`: texto de retorno de una subconsulta.
- `subqueryConditionText(summary)`: texto explicativo de condicion de subconsulta.
- `ParameterChips`, `ShortCircuitNote`, `SubqueryCycleDetail`: UI de subconsulta correlacionada.
- `SubqueryStepCard`, `SubqueryBranch`, `ExternalIterationTable`, `CorrelatedSubqueryCarousel`, `SubqueryFlow`: visualizacion de subconsultas.
- `SubqueryDependencyNote`: nota en pasos WHERE/HAVING con subconsulta.
- `JourneyStepCard`: tarjeta de paso del recorrido.
- `Journey`: recorrido, modo orden logico/escrito y paso a paso.
- `ExplainPanel`: guia contextual.
- `HistoryModal`: historial de consultas.
- `Library`: biblioteca de conceptos.
- `App`: estado global, ejecucion SQL, overlays, tema y composicion final.

### En `src/lib/sqlEngine.js`

Funciones publicas:

- `splitSqlStatements(input)`: separa scripts SQL respetando strings, comentarios y `GO`.
- `executeSql(input, database, outerRow = {})`: ejecuta una sentencia.
- `executeSqlScript(input, database)`: ejecuta multiples sentencias en secuencia.

Funciones internas relevantes:

- Parsing y normalizacion:
  - `stripSqlComments`
  - `firstStatement`
  - `clean`
  - `splitComma`
  - `clause`
  - `keywordAt`
  - `splitSetOperations`

- Tipos y valores:
  - `unquote`
  - `parseSqlDate`
  - `compareSqlValues`
  - `convertSqlValue`
  - `baseTypeName`
  - `valueOf`
  - `scalarValue`
  - `aggregateValue`
  - `calculate`

- Metadata de tablas:
  - `findTable`
  - `tableColumns`
  - `tableColumnTypes`
  - `tableConstraints`
  - `rememberColumns`
  - `requireColumn`

- Constraints:
  - `constraintDefinition`
  - `columnDefinition`
  - `validateConstraintDefinitions`
  - `validateTableIntegrity`
  - `validateDatabaseIntegrity`
  - `ensureColumnCanBeDropped`
  - `ensureTableCanBeTruncated`

- Condiciones:
  - `splitLogic`
  - `testCondition`
  - `sqlAnd`
  - `sqlOr`
  - `sqlNot`
  - `isSqlTrue`

- Subconsultas:
  - `findOutermostSubquery`
  - `hasTopLevelSelectKeyword`
  - `hasOuterReference`
  - `externalReferences`
  - `subqueryOperatorFromPrefix`
  - `subqueryInnerCondition`
  - `conditionReferenceValues`
  - `annotateSubqueryVerdict`
  - `collectSubqueryTrace`
  - `resolveSubqueries`
  - `removeSubqueries`

- SELECT y visualizacion:
  - `displayRows`
  - `resultColumns`
  - `validateSetCompatibility`
  - `rowsBySetOperator`
  - `executeSetQuery`
  - `validateSelectGrouping`
  - `project`
  - `joinKeyPairs`
  - `step`
  - `executeSelect`

- DML y DDL:
  - `executeMutation`
  - `executeDdl`

## Estados React encontrados

### `DataTable`

- `expanded`
- `expandedColumns`

### `SchemaPanel`

- `selectedTable`
- `isCreateOpen`
- `createSql`

### `CorrelatedSubqueryCarousel`

- `activeIndex`
- `showInternalTrace`

### `Journey`

- `orderMode`
- `highlightedStep`

### `Library`

- `search`

### `App`

- `database`
- `selectedExample`
- `sql`
- `execution`
- `activeStep`
- `showAll`
- `stepMode`
- `error`
- `importMessage`
- `history`
- `schemaOpen`
- `explainOpen`
- `historyOpen`
- `libraryOpen`
- `darkMode`

### Refs

- `Editor`: `textarea`, `fileInput`
- `App`: `timer`, `databaseRef`

### Memos

- `Journey`: `orderedSteps`
- `App`: `visualSteps`, `activeResult`

### Effects

- Cargar SQL cuando cambia `selectedExample`.
- Sincronizar `databaseRef` con `database`.
- Limpiar `timer` en unmount.
- Ajustar `activeStep` si cambia la cantidad de pasos visuales.
- Bloquear scroll del body cuando hay overlays.

## Dependencias entre modulos

```text
src/main.jsx
  -> React
  -> ReactDOM
  -> src/App.jsx
  -> src/styles.css

src/App.jsx
  -> React
  -> src/data/seed.js
  -> src/lib/sqlEngine.js

src/lib/sqlEngine.test.js
  -> node:test
  -> node:assert/strict
  -> src/data/seed.js
  -> src/lib/sqlEngine.js

src/lib/sqlEngine.js
  -> sin imports internos o externos

src/data/seed.js
  -> sin imports
```

## Acoplamiento detectado

### React y motor SQL

El motor no depende de React. Esto es positivo.

El acoplamiento aparece en el contrato de salida del motor. `executeSql` devuelve pasos y metadatos con forma visual:

- `steps`
- `title`
- `detail`
- `accent`
- `compare`
- `subquerySteps`
- `subqueryResults`
- `joinKeys`
- `outerVirtualRows`

Esto hace que cambios en el motor puedan romper componentes visuales y tests que validan explicaciones.

### UI y ejecucion

`App.jsx` llama directamente a:

- `executeSql`
- `executeSqlScript`
- `splitSqlStatements`

No hay service intermedio para:

- validacion de `;`;
- ejecucion de sentencia vs script;
- normalizacion de errores;
- persistencia;
- serializacion de base temporal.

### UI y navegador

`App.jsx` usa directamente APIs del navegador:

- `window.confirm`
- `alert`
- `window.requestAnimationFrame`
- `window.setTimeout`
- `document.getElementById`
- `document.body.classList`

Estas responsabilidades deberian moverse a hooks o componentes especificos.

### Visualizacion y explicaciones

`App.jsx` mezcla render JSX con textos pedagogicos y funciones de transformacion visual:

- `buildVisualSteps`
- `explanationFor`
- `exampleFor`
- `stepModeGuide`
- `stepDebugHint`
- `noteFor`

Estos bloques deberian pasar a modulos `visual/` o `content/`.

## Codigo duplicado o solapado

- `rowSignature` existe en `App.jsx` y `sqlEngine.js`.
- Validacion de scripts esta repartida entre `hasTerminatingSemicolon`, `splitSqlStatements` y `clean`.
- Keywords SQL estan definidas para UI en `queryKeywords` y de forma implicita en el parser del motor.
- Estilos de tablas se repiten conceptualmente en:
  - `.table-wrap`
  - `.detail-table-wrap`
  - `.external-table-wrap`
  - `.mini-records-table-wrap`
- Modales y overlays comparten patrones pero no tienen abstraccion comun:
  - sandbox detail modal;
  - history modal;
  - library drawer;
  - schema sidebar;
  - scrim.
- `table-detail-modal` se reutiliza para detalle de tabla e historial.
- CSS tiene multiples bloques que corrigen los mismos selectores en distintos puntos:
  - `.explain-panel`
  - `.schema-panel`
  - `.output-guide-grid`
  - `.execution-guide-layout`
  - responsive mobile/tablet.

## Componentes que deberian extraerse

Extraccion recomendada, de menor a mayor riesgo:

- `components/ui/Icon.jsx`
- `components/tables/DataTable.jsx`
- `components/results/ResultPanel.jsx`
- `components/journey/JoinKeyNote.jsx`
- `components/editor/SqlEditor.jsx`
- `components/sandbox/SchemaPanel.jsx`
- `components/sandbox/TableDetailModal.jsx`
- `components/sandbox/CreateTableForm.jsx`
- `components/journey/Journey.jsx`
- `components/journey/JourneyStepCard.jsx`
- `components/journey/LogicalOrder.jsx`
- `components/subqueries/SubqueryFlow.jsx`
- `components/subqueries/SubqueryBranch.jsx`
- `components/subqueries/CorrelatedSubqueryCarousel.jsx`
- `components/subqueries/ExternalIterationTable.jsx`
- `components/guide/ExplainPanel.jsx`
- `components/library/LibraryDrawer.jsx`
- `components/history/HistoryModal.jsx`
- `components/layout/Topbar.jsx`
- `components/layout/Footer.jsx`
- `components/layout/AppShell.jsx`
- `components/layout/Scrim.jsx`

## Hooks necesarios

- `useSqlRunner`: encapsular `run`, `toggleStepMode`, errores, ejecucion y paso activo.
- `useSandboxDatabase`: manejar `database`, `reset`, creacion y eliminacion de tablas.
- `useQueryHistory`: manejar historial, deduplicacion y limite.
- `useSessionStorageState`: persistir base temporal, SQL e historial.
- `useLocalStorageState`: persistir dark mode y preferencias.
- `useThemePreference`: clase de tema y preferencia visual.
- `useOverlayState`: manejar `schemaOpen`, `libraryOpen`, `historyOpen` y cierre comun.
- `useBodyScrollLock`: mover `document.body.classList` fuera de `App`.
- `useVisualSteps`: encapsular `buildVisualSteps`.
- `useStepNavigation`: scroll a paso, highlight y navegacion.
- `useSqlFileImport`: validacion de extension, lectura y ejecucion de scripts.

## Contexts realmente necesarios

### Recomendados

- `PreferencesContext`: dark mode y preferencias visuales persistidas en `localStorage`.
- `SandboxContext`: base temporal, setters y reset. Es util porque sandbox, ejecucion y editor se relacionan con la base.

### Opcional

- `ExecutionContext`: `sql`, `execution`, `visualSteps`, `activeStep`, `stepMode`, `showAll`, errores. Conviene postergarlo hasta ver si la extraccion genera demasiado prop drilling.

### No necesarios ahora

- Auth context.
- Backend/API context.
- User context.

## Services necesarios

- `services/sqlExecutionService.js`
  - Ejecutar sentencia o script.
  - Validar terminacion con `;`.
  - Normalizar errores.
  - Mantener contrato actual del motor.

- `services/storageService.js`
  - Wrappers seguros para `sessionStorage` y `localStorage`.
  - Fallback cuando storage no existe o falla.
  - Versionado de claves.

- `services/databaseSerializationService.js`
  - Serializar y deserializar la base temporal.
  - Critico porque JSON normal no preserva propiedades custom de arrays como `columns`, `columnTypes` y `constraints`.

- `services/sqlImportService.js`
  - Validar `.sql` y `.txt`.
  - Leer archivo.
  - Ejecutar script mediante `sqlExecutionService`.

- `visual/visualSteps.js`
  - `buildVisualSteps` y helpers relacionados.

- `visual/explanations.js`
  - `explanationFor`, `exampleFor`, `stepModeGuide`, `stepDebugHint`, `noteFor`.

- `visual/subqueryVisual.js`
  - Formateo y agrupacion visual de subconsultas.

- `visual/tableDiff.js`
  - Comparacion visual de filas/columnas para `DataTable`.

## Riesgos de refactorizacion

- El contrato `execution.steps` es sensible. UI y tests dependen de `compare`, `rows`, `count`, `accent`, `detail` y metadata de subconsultas.
- Separar motor y visualizacion puede romper tests actuales, porque algunos tests verifican metadatos visuales generados por el motor.
- `styles.css` tiene una cascada acumulada. Separarlo sin preservar orden puede romper desktop, tablet o mobile.
- Persistir `database` no puede hacerse con `JSON.stringify` directo porque las tablas son arrays con propiedades extra.
- `DataTable` concentra logica importante de diferencias visuales. Extraerlo sin preservar comportamiento puede romper JOIN, filtros, proyeccion y subconsultas.
- Agregar rutas con BrowserRouter puede requerir rewrites en Vercel para refresh directo en `/docs`, `/about` o `/limitations`.
- `darkMode` puede tener flash visual si se inicializa despues del primer render.
- `window.confirm` y `alert` bloquean y acoplan UI al navegador. Cambiarlos puede alterar UX.
- Existe una discrepancia importante: las limitaciones declaradas dicen no implementar subconsultas de subconsultas, pero los tests actuales incluyen un caso llamado `nested subqueries` que hoy debe pasar. Antes de refactorizar esa zona hay que decidir si esa funcionalidad se conserva o si se elimina ajustando tests y documentacion.

## Propuesta de estructura final

```text
src/
|-- app/
|   |-- App.jsx
|   |-- Router.jsx
|   |-- AppLayout.jsx
|   `-- providers.jsx
|-- pages/
|   |-- EditorPage.jsx
|   |-- DocsPage.jsx
|   |-- AboutPage.jsx
|   |-- LimitationsPage.jsx
|   `-- NotFoundPage.jsx
|-- components/
|   |-- layout/
|   |-- ui/
|   |-- editor/
|   |-- sandbox/
|   |-- results/
|   |-- journey/
|   |-- subqueries/
|   |-- guide/
|   |-- library/
|   `-- history/
|-- hooks/
|   |-- useSqlRunner.js
|   |-- useSandboxDatabase.js
|   |-- useQueryHistory.js
|   |-- useOverlayState.js
|   |-- useBodyScrollLock.js
|   |-- useLocalStorageState.js
|   |-- useSessionStorageState.js
|   `-- useStepNavigation.js
|-- contexts/
|   |-- PreferencesContext.jsx
|   `-- SandboxContext.jsx
|-- services/
|   |-- sqlExecutionService.js
|   |-- storageService.js
|   |-- databaseSerializationService.js
|   `-- sqlImportService.js
|-- engine/
|   |-- index.js
|   |-- sqlEngine.js
|   |-- parser.js
|   |-- evaluator.js
|   |-- select.js
|   |-- dml.js
|   |-- ddl.js
|   |-- constraints.js
|   `-- types.js
|-- visual/
|   |-- visualSteps.js
|   |-- explanations.js
|   |-- subqueryVisual.js
|   `-- tableDiff.js
|-- data/
|   |-- seed.js
|   |-- examples.js
|   `-- concepts.js
|-- styles/
|   |-- index.css
|   |-- tokens.css
|   |-- base.css
|   |-- layout.css
|   |-- editor.css
|   |-- sandbox.css
|   |-- tables.css
|   |-- journey.css
|   |-- subqueries.css
|   |-- guide.css
|   |-- overlays.css
|   |-- dark.css
|   `-- responsive.css
`-- main.jsx
```

## Orden recomendado de implementacion

### 1. Documentar auditoria

- Crear `docs/ARCHITECTURE_AUDIT.md`.
- No tocar comportamiento.
- No requiere tests funcionales, pero se puede ejecutar build si se desea verificar integridad general.

### 2. Extraer datos pasivos

- Separar `examples` y `concepts` desde `seed.js`.
- Mantener exports compatibles temporalmente si hace falta.
- Ejecutar `npm test`.

### 3. Extraer helpers visuales

- Mover `buildVisualSteps`, helpers de subconsultas y textos pedagogicos a `visual/`.
- No cambiar JSX.
- Ejecutar `npm test` y `npm run build`.

### 4. Extraer componentes puros de menor riesgo

- `Icon`.
- `DataTable`.
- `ResultPanel`.
- `JoinKeyNote`.
- Ejecutar `npm test` y `npm run build`.

### 5. Extraer componentes grandes

- `Editor`.
- `SchemaPanel`.
- `TableDetailModal`.
- `Library`.
- `HistoryModal`.
- Ejecutar tests/build y revisar responsive.

### 6. Extraer Journey y subconsultas

- `Journey`.
- `JourneyStepCard`.
- `SubqueryFlow`.
- `CorrelatedSubqueryCarousel`.
- Alto riesgo visual. Hacerlo en cambios pequenos.
- Ejecutar tests/build.

### 7. Introducir hooks

- `useOverlayState`.
- `useBodyScrollLock`.
- `useQueryHistory`.
- `useSqlRunner`.
- Ejecutar tests/build.

### 8. Agregar persistencia

- `localStorage` para dark mode y preferencias visuales.
- `sessionStorage` para SQL actual, historial y base temporal.
- Antes implementar serializer de base.
- Ejecutar tests/build y pruebas manuales.

### 9. Agregar router y paginas

- Mantener editor en `/`.
- Agregar `/docs`, `/about`, `/limitations` y `*` 404.
- Si se usa `react-router-dom`, agregar dependencia y configurar fallback/rewrite para Vercel.
- Ejecutar tests/build.

### 10. Dividir CSS

- Crear `styles/index.css`.
- Mover bloques preservando orden efectivo.
- Separar tokens, base, layout, componentes, dark mode y responsive.
- Hacerlo despues de extraer componentes porque la cascada actual es fragil.
- Ejecutar build y revisar desktop/tablet/mobile.

### 11. Dividir motor internamente

- Mantener exports publicos actuales:
  - `executeSql`
  - `executeSqlScript`
  - `splitSqlStatements`
- Extraer parser, evaluator, SELECT, DML, DDL, constraints y visual metadata en pasos pequenos.
- Ejecutar `npm test` despues de cada etapa.

## Primeros commits recomendados

1. `docs: add architecture audit`
2. `refactor(data): split examples and concepts`
3. `refactor(visual): extract visual step helpers`
4. `refactor(ui): extract shared table component`
5. `refactor(editor): extract editor components`

## Observaciones finales

- No conviene agregar backend ni login en esta etapa.
- El editor debe mantenerse como ruta principal `/`.
- La prioridad tecnica es reducir `App.jsx` sin cambiar comportamiento.
- La segunda prioridad es aislar la persistencia con serializers seguros.
- La tercera prioridad es separar el motor de los detalles visuales sin romper el contrato actual de tests.
