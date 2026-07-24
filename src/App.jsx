import React, { useEffect, useMemo, useRef, useState } from 'react';
import { examples } from './data/examples';
import { createSeedDatabase } from './data/seed';
import { executeSql, executeSqlScript, splitSqlStatements } from './lib/sqlEngine';
import { SqlEditor } from './components/editor/SqlEditor';
import { HistoryModal } from './components/history/HistoryModal';
import { Journey } from './components/journey/Journey';
import { Scrim } from './components/layout/Scrim';
import { LibraryDrawer } from './components/library/LibraryDrawer';
import { ResultPanel } from './components/results/ResultPanel';
import { SchemaPanel } from './components/sandbox/SchemaPanel';
import { DataTable } from './components/tables/DataTable';
import { Icon } from './components/ui/Icon';
import { useBodyScrollLock } from './hooks/useBodyScrollLock';
import { useOverlayState } from './hooks/useOverlayState';
import { useSqlFileImport } from './hooks/useSqlFileImport';
import { SUBQUERY_STEP_TYPE, buildVisualSteps } from './visual/visualSteps';

const hasTerminatingSemicolon = (input) => {
  let quoted = false; let lineComment = false; let blockComment = false; let last = '';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]; const next = input[i + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (!quoted && char === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (!quoted && char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === "'" && next === "'") { if (!/\s/.test(char)) last = char; i += 1; continue; }
    if (!quoted && char === ';') { last = ';'; continue; }
    if (char === "'") quoted = !quoted;
    if (!/\s/.test(char)) last = char;
  }
  return last === ';';
};

function ExplainPanel({ visualSteps, activeStep, stepMode, open, onClose }) {
  const current = visualSteps[activeStep]?.item;
  return <aside id="guia-contextual" className={`explain-panel ${open ? 'open' : ''}`}>
    <div className="drawer-head explain-drawer-head"><div><span className="eyebrow">EXPLICACIÓN</span><h2><Icon name="bulb" /> Guía contextual</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar explicación"><Icon name="close" /></button></div>
    {current ? <div className="explanation">
      <span className={`large-chip accent-${current.accent}`}>{current.type}</span><h2>{current.title}</h2>
      <div className="explain-block"><h4>Qué hace esta cláusula</h4><p>{current.detail}</p></div>
      <div className="explain-block"><h4>Cómo se ejecuta</h4><p>{explanationFor(current.type)}</p></div>
      {stepMode && <div className="step-insight"><strong>Lectura del paso</strong><p>{guideForStep(current)}</p><p>{debugHintForStep(current)}</p></div>}
      <div className="explain-block"><h4>Ejemplo</h4><code className="inline-example">{exampleFor(current.type)}</code></div>
      <div className="metric"><span>Resultado intermedio</span><strong>{current.count}</strong><small>{current.count === 1 ? 'fila disponible' : 'filas disponibles'}</small></div>
      <div className="tip"><strong>Notas</strong><p>{noteForStep(current.type)}</p></div>
    </div> : <div className="explanation placeholder"><Icon name="bulb" size={32} /><h3>Explicación contextual</h3><p>Ejecuta una consulta y selecciona una etapa para entender qué ocurre.</p></div>}
  </aside>;
}

const explanationFor = (type) => ({ FROM: 'El motor localiza la fuente y crea el conjunto inicial.', JOIN: 'Compara la condición ON fila por fila y combina coincidencias.', WHERE: 'Evalúa la condición externa para cada fila; si depende de una subconsulta, su resultado se obtiene en el paso siguiente.', [SUBQUERY_STEP_TYPE]: 'Ejecuta la consulta interna y devuelve un valor, conjunto o veredicto que la cláusula externa usa para decidir qué filas continúan.', 'GROUP BY': 'Construye una colección por cada combinación única de claves.', HAVING: 'Evalúa agregados de cada grupo y descarta los que no cumplen.', SELECT: 'Calcula expresiones y proyecta únicamente las columnas pedidas.', DISTINCT: 'Elimina filas duplicadas del resultado ya proyectado.', 'ORDER BY': 'Compara valores y reordena el conjunto ya proyectado.', UNION: 'Combina dos resultados union-compatible y elimina duplicados.', INTERSECT: 'Conserva solo las filas que aparecen en ambos resultados.', EXCEPT: 'Conserva filas de la primera consulta que no aparecen en la segunda.', VALUES: 'Relaciona cada valor con su columna por posición.', SET: 'Asigna los nuevos valores en las filas seleccionadas.' }[type] || 'El motor valida la instrucción y aplica la transformación sobre el estado temporal.');
const exampleFor = (type) => ({ FROM: 'FROM Products', SOURCE: 'LEFT JOIN Orders o ON ...', JOIN: 'INNER JOIN Orders o ON c.id = o.customer_id', WHERE: 'WHERE YEAR(order_date) = 2026', [SUBQUERY_STEP_TYPE]: 'SELECT ... FROM ... WHERE columna = valor_externo', 'GROUP BY': 'GROUP BY category_id', HAVING: 'HAVING COUNT(*) >= 2', SELECT: 'SELECT name, AVG(price)', DISTINCT: 'SELECT DISTINCT city', 'ORDER BY': 'ORDER BY price DESC', UNION: 'SELECT city FROM Customers UNION SELECT city FROM Stores', INTERSECT: 'SELECT Dni FROM Empleados INTERSECT SELECT Dni FROM Jefes', EXCEPT: 'SELECT Dni FROM Empleados EXCEPT SELECT Dni FROM Jefes', LIMIT: 'OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY', VALUES: "VALUES (4, 'Books')", SET: 'SET stock = stock + 1', INSERT: 'INSERT INTO Categories (...)', UPDATE: 'UPDATE Products SET ...', DELETE: 'DELETE FROM Orders WHERE ...', PARSE: 'CREATE TABLE Suppliers (...)' }[type] || `${type} ...`);
const stepModeGuide = (step) => ({ FROM: 'Este paso muestra la tabla o conjunto inicial antes de aplicar filtros. Si faltan filas acá, el problema suele estar en el nombre de la tabla o en el origen elegido.', SOURCE: 'Este paso prepara la fuente de datos declarada en la sentencia. Revisá que la tabla exista y que sus columnas coincidan con las que vas a usar después.', JOIN: 'Este paso combina tablas. Si aparecen NULL o faltan filas, revisá la condición ON y que estés comparando las claves correctas.', WHERE: 'Este paso decide fila por fila qué registros continúan. Las filas marcadas como recortadas no cumplen la condición, por eso ya no llegan a SELECT, GROUP BY u ORDER BY.', 'GROUP BY': 'Este paso junta filas que comparten el mismo valor de agrupación. Si el resultado tiene menos filas que antes, no es un error: ahora cada fila representa un grupo.', HAVING: 'Este paso filtra grupos ya calculados. A diferencia de WHERE, acá sí se pueden usar agregados como COUNT, SUM o AVG.', SELECT: 'Este paso arma las columnas finales. Si una columna desaparece, es porque no fue seleccionada o quedó reemplazada por una expresión o alias.', DISTINCT: 'Este paso elimina filas repetidas después de resolver SELECT. Si baja la cantidad de filas, significa que había resultados idénticos.', 'ORDER BY': 'Este paso solo reordena el resultado. No debería cambiar la cantidad de filas; si cambia, el problema viene de una etapa anterior.', VALUES: 'Este paso toma los valores escritos y los ubica por posición en las columnas del INSERT.', SET: 'Este paso calcula los nuevos valores del UPDATE para las filas que pasaron el WHERE.', INSERT: 'Este paso inserta registros en la tabla destino respetando columnas, tipos y restricciones.', UPDATE: 'Este paso modifica únicamente las filas alcanzadas por el WHERE. Si se actualizan demasiadas, revisá el filtro.', DELETE: 'Este paso elimina únicamente las filas alcanzadas por el WHERE. Si se eliminan demasiadas, el filtro es demasiado amplio.' }[step.type] || 'En este paso el motor valida o transforma la sentencia. Compará las filas visibles con lo que esperabas obtener en esta etapa.');
const stepDebugHint = (step) => ['UNION', 'INTERSECT', 'EXCEPT'].includes(step.type) ? 'Si este resultado no coincide con lo esperado, revisá primero que ambos SELECT devuelvan la misma cantidad de columnas y tipos compatibles en el mismo orden.' : step.compare?.subquerySteps?.length ? 'La subconsulta se ejecuta como un recorrido interno: primero se obtiene su resultado y luego ese valor o conjunto se usa para evaluar la condición externa.' : step.compare?.kind === 'filter' ? 'Usá las filas recortadas como pista: compará sus valores con la condición escrita para entender por qué quedaron afuera.' : step.compare?.kind === 'project' ? 'Las columnas recortadas no se perdieron por error: SELECT define qué columnas quedan visibles en la salida.' : step.compare?.kind === 'join' ? 'Las columnas agregadas vienen de la tabla unida; el punto de unión ayuda a verificar si la relación FK = PK fue correcta.' : 'Si este paso no coincide con lo esperado, avanzá o retrocedé una etapa para ubicar exactamente dónde cambió el conjunto de datos.';
const noteFor = (type) => type === 'LIMIT' ? 'SQL Server usa TOP o OFFSET ... FETCH en lugar de LIMIT.' : ['UNION', 'INTERSECT', 'EXCEPT'].includes(type) ? 'Los operadores de conjuntos se aplican despues de resolver cada SELECT individual.' : type === 'WHERE' ? 'WHERE no filtra agregados; para eso se usa HAVING.' : type === 'SELECT' ? 'Aunque se escribe primero, SELECT se resuelve después de FROM, WHERE y GROUP BY.' : type === 'DISTINCT' ? 'DISTINCT se aplica despues de construir la lista SELECT y antes del ordenamiento final.' : 'La simulación sigue el orden lógico, que puede diferir del orden escrito.';

const guideForStep = (step) => step.type === SUBQUERY_STEP_TYPE ? 'Este paso abre la consulta interna. Si es correlacionada, revisá cada iteración: la fila externa inyecta un valor y la subconsulta devuelve un resultado para esa fila.' : stepModeGuide(step);
const debugHintForStep = (step) => step.type === SUBQUERY_STEP_TYPE ? 'El resultado de este paso no es la salida final: vuelve a la condición externa para decidir si cada fila continúa.' : step.compare?.subquerySteps?.length ? 'La condición depende del resultado de una subconsulta; avanzá al paso siguiente para ver cómo se obtiene.' : stepDebugHint(step);
const noteForStep = (type) => type === SUBQUERY_STEP_TYPE ? 'Las subconsultas de esta cátedra se evalúan desde WHERE o HAVING; su resultado alimenta la condición principal.' : noteFor(type);

export default function App() {
  const [database, setDatabase] = useState(createSeedDatabase);
  const [selectedExample, setSelectedExample] = useState('');
  const [sql, setSql] = useState('');
  const [execution, setExecution] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [showAll, setShowAll] = useState(true);
  const [stepMode, setStepMode] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const timer = useRef();
  const databaseRef = useRef(database);
  const { schemaOpen, explainOpen, historyOpen, libraryOpen, overlayOpen, openSchema, openLibrary, openHistory, closeSchema, closeLibrary, closeHistory, closeOverlays, toggleExplain } = useOverlayState();
  const importSqlFile = async (content, fileName) => {
    clearInterval(timer.current);
    if (!hasTerminatingSemicolon(content)) throw new Error('El archivo SQL debe finalizar cada sentencia con punto y coma (;).');
    const next = executeSqlScript(content, databaseRef.current);
    databaseRef.current = next.db; setDatabase(next.db); setExecution(null); setError(''); setActiveStep(0); setShowAll(true);
    return `${fileName}: ${next.importedStatements} sentencias ejecutadas sobre la base local.`;
  };
  const { fileInputRef, importMessage, sqlFileAccept, clearImportMessage, openImportFileDialog, handleImportFileChange } = useSqlFileImport({ onImportSqlFile: importSqlFile, onError: setError });

  useEffect(() => { const example = examples.find((item) => item.id === selectedExample); if (example) { setSql(example.sql); setError(''); clearImportMessage(); } }, [selectedExample]);
  useEffect(() => { databaseRef.current = database; }, [database]);
  useEffect(() => () => clearInterval(timer.current), []);
  const visualSteps = useMemo(() => buildVisualSteps(execution), [execution]);
  useEffect(() => { if (activeStep >= visualSteps.length) setActiveStep(Math.max(visualSteps.length - 1, 0)); }, [activeStep, visualSteps.length]);
  const changeSql = (value) => { setSql(value); setSelectedExample(''); };
  const selectExample = (value) => { setSelectedExample(value); if (!value) { setSql(''); setError(''); clearImportMessage(); } };
  const createSandboxTable = (createSql) => {
    try {
      const result = executeSql(createSql, database);
      setDatabase(result.db);
      return Object.keys(result.db).find(k => !Object.keys(database).includes(k)) || 'Proveedores';
    } catch (err) {
      alert(`Error al crear la tabla: ${err.message}`);
      return null;
    }
  };
  const deleteSandboxTable = (name) => {
    if (window.confirm(`¿Estás seguro de que querés eliminar la tabla "${name}"?`)) {
      const next = { ...database };
      delete next[name];
      setDatabase(next);
      return true;
    }
    return false;
  };
  const run = (startStep = false) => {
    clearInterval(timer.current);
    try {
      if (!hasTerminatingSemicolon(sql)) throw new Error('La sentencia SQL debe finalizar con punto y coma (;).');
      const statements = splitSqlStatements(sql);
      const next = statements.length > 1 ? executeSqlScript(sql, databaseRef.current) : executeSql(sql, databaseRef.current); databaseRef.current = next.db; setExecution(next); setDatabase(next.db); setError(''); clearImportMessage(); setActiveStep(0); setShowAll(!startStep); setStepMode(startStep);
      setHistory((items) => [{ sql, time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) }, ...items.filter((x) => x.sql !== sql)].slice(0, 8));
    } catch (err) { setError(err.message); clearImportMessage(); setExecution(null); }
  };
  const toggleStepMode = () => {
    if (stepMode) { setStepMode(false); setShowAll(true); }
    else if (execution) { setStepMode(true); setShowAll(false); setActiveStep(0); }
    else { run(true); }
  };
  const clearEditorExecution = () => { clearInterval(timer.current); setSql(''); setSelectedExample(''); setExecution(null); setError(''); clearImportMessage(); setActiveStep(0); setShowAll(true); setStepMode(false); };
  const activeVisualStep = visualSteps[Math.min(activeStep, Math.max(visualSteps.length - 1, 0))]?.item;
  const activeResult = useMemo(() => activeVisualStep?.rows || [], [activeVisualStep]);
  const activeClause = activeVisualStep?.parentType || activeVisualStep?.type || '';
  useBodyScrollLock(overlayOpen);

  return <div className={`app-shell ${darkMode ? 'dark-mode' : ''}`}>
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Icon name="database" /></span><span>SQL <strong>Tutor</strong><small>Explorador Visual Consultas</small></span></a><nav><button className="nav-icon-button" onClick={openSchema} aria-label="Abrir base de datos" title="Base de datos"><Icon name="database" /></button><button className={`nav-icon-button ${explainOpen ? 'active' : ''}`} onClick={toggleExplain} aria-label="Ir a explicación" aria-pressed={explainOpen} title="Explicación"><Icon name="bulb" /></button><button className="nav-icon-button library-shortcut" onClick={openLibrary} aria-label="Abrir Biblioteca SQL" title="Biblioteca SQL"><Icon name="book" /></button><button className="library-text-button" onClick={openLibrary}><Icon name="book" /> Biblioteca SQL</button></nav><div className="header-actions"><button className="theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Modo claro' : 'Modo oscuro'}><Icon name={darkMode ? 'sun' : 'moon'} /></button><button className="theme-toggle header-history-button" onClick={openHistory} aria-label="Abrir historial" title="Historial"><Icon name="history" /></button><div className="session-pill"><span /> Sesión temporal</div></div></header>
    <main id="top"><SchemaPanel database={database} open={schemaOpen} onClose={closeSchema} onCreateTable={createSandboxTable} onDeleteTable={deleteSandboxTable} /><div className="workspace-layout"><div className="workspace"><div className="editor-container-split"><SqlEditor {...{ sql, examples, selectedExample, error, importMessage, activeClause, stepMode, fileInputRef, sqlFileAccept }} onSqlChange={changeSql} onExampleChange={selectExample} onImportFileChange={handleImportFileChange} onOpenImportFile={openImportFileDialog} onRun={() => run(false)} onStep={toggleStepMode} onReset={clearEditorExecution} /><ResultPanel execution={execution} /></div><div className={`execution-guide-layout ${explainOpen ? 'guide-open' : ''}`}><div className="execution-main-column"><div className="content-grid"><Journey {...{ execution, visualSteps, activeStep, setActiveStep, showAll, setShowAll, stepMode, setStepMode, sql }} /></div>{execution && <section className="final-result"><div className="section-title"><div><span className="eyebrow">SALIDA</span><h2>Resultado {showAll ? 'final' : 'de la etapa'}</h2></div><span>{showAll ? execution.result.length : activeResult.length} filas</span></div><DataTable rows={showAll ? execution.result : activeResult} /></section>}</div>{explainOpen && <ExplainPanel {...{ visualSteps, activeStep, stepMode }} open={explainOpen} onClose={toggleExplain} />}</div></div></div></main>
    <footer className="app-footer">
      <div className="footer-main"><span>Página realizada por <strong>Prieto Agustin</strong></span><span>Alumno UTNFRC</span><span className="footer-badge">Fase de Pruebas</span></div>
      <p className="footer-legal">Copyright © 2026 Prieto Agustin. Todos los derechos reservados. Uso educativo autorizado. Prohibida la copia, redistribución o explotación comercial sin permiso.</p>
    </footer>
    {overlayOpen && <Scrim onClick={closeOverlays} />}
    <LibraryDrawer open={libraryOpen} onClose={closeLibrary} />
    <HistoryModal open={historyOpen} history={history} onClose={closeHistory} onSelect={(value) => setSql(value)} />
  </div>;
}
