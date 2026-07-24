import React, { useEffect, useMemo, useRef, useState } from 'react';
import { examples } from './data/examples';
import { createSeedDatabase } from './data/seed';
import { executeSql, executeSqlScript, splitSqlStatements } from './lib/sqlEngine';
import { SqlEditor } from './components/editor/SqlEditor';
import { ExplanationPanel } from './components/explanation/ExplanationPanel';
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
import { buildVisualSteps } from './visual/visualSteps';

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
    <main id="top"><SchemaPanel database={database} open={schemaOpen} onClose={closeSchema} onCreateTable={createSandboxTable} onDeleteTable={deleteSandboxTable} /><div className="workspace-layout"><div className="workspace"><div className="editor-container-split"><SqlEditor {...{ sql, examples, selectedExample, error, importMessage, activeClause, stepMode, fileInputRef, sqlFileAccept }} onSqlChange={changeSql} onExampleChange={selectExample} onImportFileChange={handleImportFileChange} onOpenImportFile={openImportFileDialog} onRun={() => run(false)} onStep={toggleStepMode} onReset={clearEditorExecution} /><ResultPanel execution={execution} /></div><div className={`execution-guide-layout ${explainOpen ? 'guide-open' : ''}`}><div className="execution-main-column"><div className="content-grid"><Journey {...{ execution, visualSteps, activeStep, setActiveStep, showAll, setShowAll, stepMode, setStepMode, sql }} /></div>{execution && <section className="final-result"><div className="section-title"><div><span className="eyebrow">SALIDA</span><h2>Resultado {showAll ? 'final' : 'de la etapa'}</h2></div><span>{showAll ? execution.result.length : activeResult.length} filas</span></div><DataTable rows={showAll ? execution.result : activeResult} /></section>}</div>{explainOpen && <ExplanationPanel {...{ visualSteps, activeStep, stepMode }} open={explainOpen} onClose={toggleExplain} />}</div></div></div></main>
    <footer className="app-footer">
      <div className="footer-main"><span>Página realizada por <strong>Prieto Agustin</strong></span><span>Alumno UTNFRC</span><span className="footer-badge">Fase de Pruebas</span></div>
      <p className="footer-legal">Copyright © 2026 Prieto Agustin. Todos los derechos reservados. Uso educativo autorizado. Prohibida la copia, redistribución o explotación comercial sin permiso.</p>
    </footer>
    {overlayOpen && <Scrim onClick={closeOverlays} />}
    <LibraryDrawer open={libraryOpen} onClose={closeLibrary} />
    <HistoryModal open={historyOpen} history={history} onClose={closeHistory} onSelect={(value) => setSql(value)} />
  </div>;
}
