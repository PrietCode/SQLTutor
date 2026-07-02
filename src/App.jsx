import React, { useEffect, useMemo, useRef, useState } from 'react';
import { concepts, createSeedDatabase, examples } from './data/seed';
import { executeSql } from './lib/sqlEngine';

const Icon = ({ name, size = 18 }) => {
  const paths = {
    play: <><path d="m7 4 10 8L7 20Z" /></>,
    steps: <><path d="M4 6h5M4 12h10M4 18h16" /><circle cx="12" cy="6" r="2" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>,
    book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22ZM20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22Z" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    bulb: <><path d="M9 18h6M10 22h4M8.5 15.5a7 7 0 1 1 7 0c-.9.7-1.5 1.4-1.5 2.5h-4c0-1.1-.6-1.8-1.5-2.5Z" /></>,
    moon: <><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8Z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

const rowSignature = (row) => JSON.stringify(Object.entries(row).filter(([key]) => !key.startsWith('__')).sort(([a], [b]) => a.localeCompare(b)));

function DataTable({ rows = [], compact = false, faded = false, compare = null }) {
  const currentRows = rows.map((row) => ({ ...row, __diffStatus: 'kept' }));
  const currentSignatures = new Set(rows.map(rowSignature));
  const removedRows = compare?.kind === 'filter' ? (compare.beforeRows || []).filter((row) => !currentSignatures.has(rowSignature(row))).map((row) => ({ ...row, __diffStatus: 'removed' })) : [];
  const visualRows = [...currentRows, ...removedRows];
  const addedColumns = new Set(compare?.kind === 'join' ? compare.addedColumns || [] : []);
  const columns = [...new Set(visualRows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith('__'))))].slice(0, compact ? 5 : 8);
  if (!visualRows.length) return <div className="empty-table">Sin filas en esta etapa</div>;
  return <div className={`table-wrap ${faded ? 'faded' : ''}`}>
    <table className={compact ? 'compact-table' : ''}>
      <thead><tr>{columns.map((column) => <th className={addedColumns.has(column) ? 'added-column' : ''} key={column}>{column}</th>)}</tr></thead>
      <tbody>{visualRows.slice(0, compact ? 6 : 10).map((row, index) => <tr className={row.__diffStatus === 'removed' ? 'removed-row' : ''} key={index}>{columns.map((column) => <td className={addedColumns.has(column) ? 'added-column' : ''} key={column}>{row[column] == null ? <span className="null">NULL</span> : String(row[column])}</td>)}</tr>)}</tbody>
    </table>
    {visualRows.length > (compact ? 6 : 10) && <span className="more-rows">+ {visualRows.length - (compact ? 6 : 10)} filas</span>}
    {(removedRows.length > 0 || addedColumns.size > 0) && <div className="comparison-legend">{removedRows.length > 0 && <span><i className="legend-dot removed" />filas recortadas</span>}{addedColumns.size > 0 && <span><i className="legend-dot added" />columnas agregadas</span>}</div>}
  </div>;
}

function columnTypeLabel(rows, column) {
  if (rows.columnTypes?.[column]) return rows.columnTypes[column];
  const values = rows.map((row) => row[column]).filter((value) => value != null);
  if (!values.length) return 'NULL';
  if (values.every((value) => typeof value === 'number' && Number.isInteger(value))) return 'INT';
  if (values.every((value) => typeof value === 'number')) return 'FLOAT';
  if (values.every((value) => typeof value === 'boolean')) return 'BIT';
  if (values.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)))) return 'DATE';
  const maxLength = Math.max(...values.map((value) => String(value).length));
  return `VARCHAR(${Math.max(maxLength, 1)})`;
}

function SchemaPanel({ database, setDatabase, open, onClose }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createSql, setCreateSql] = useState(`CREATE TABLE Proveedores (
  id INT PRIMARY KEY,
  nombre VARCHAR(100),
  ciudad VARCHAR(50)
);`);

  const deleteTable = (name) => {
    if (window.confirm(`¿Estás seguro de que querés eliminar la tabla "${name}"?`)) {
      const next = { ...database };
      delete next[name];
      setDatabase(next);
      if (selectedTable === name) setSelectedTable(null);
    }
  };

  const handleCreateTable = (e) => {
    e.preventDefault();
    try {
      const result = executeSql(createSql, database);
      setDatabase(result.db);
      setIsCreateOpen(false);
      const createdTableName = Object.keys(result.db).find(k => !Object.keys(database).includes(k)) || 'Proveedores';
      setSelectedTable(createdTableName);
    } catch (err) {
      alert(`Error al crear la tabla: ${err.message}`);
    }
  };

  return <aside className={`side-panel schema-panel ${open ? 'open' : ''}`}>
    <div className="panel-heading">
      <div>
        <span className="eyebrow">SANDBOX LOCAL</span>
        <h2><Icon name="database" /> Base de datos</h2>
      </div>
      <button className="icon-button mobile-only" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
    </div>
    <p className="muted">Los cambios viven solo en esta pestaña.</p>

    <div className="schema-actions">
      <button className="secondary-button add-table-btn" onClick={() => setIsCreateOpen(!isCreateOpen)}>
        {isCreateOpen ? 'Cancelar' : '+ Nueva Tabla (SQL)'}
      </button>
    </div>

    {isCreateOpen && (
      <form onSubmit={handleCreateTable} className="add-table-form">
        <label>Escribe SQL para crear tabla:</label>
        <textarea 
          value={createSql} 
          onChange={(e) => setCreateSql(e.target.value)} 
          spellCheck="false"
        />
        <div className="form-buttons">
          <button type="button" className="ghost-button" onClick={() => setIsCreateOpen(false)}>Cancelar</button>
          <button type="submit" className="primary-button">Crear</button>
        </div>
      </form>
    )}

    <div className="schema-list">
      {Object.entries(database).map(([name, rows]) => {
        const isSelected = selectedTable === name;
        return (
          <div className={`schema-card ${isSelected ? 'expanded' : ''}`} key={name}>
            <div className="schema-card-header">
              <button className="expand-toggle-btn" onClick={() => setSelectedTable(name)}>
                <span><Icon name="table" size={16} />{name}</span>
                <small>{rows.length} filas</small>
                <Icon name="chevron" size={15} />
              </button>
              <button className="delete-table-btn" onClick={() => deleteTable(name)} title={`Borrar tabla ${name}`}>
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>

    {selectedTable && database[selectedTable] && (() => {
      const rows = database[selectedTable];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : (rows.columns || []);
      return <div className="table-detail-overlay" role="dialog" aria-modal="true" aria-label={`Detalle de tabla ${selectedTable}`}>
        <div className="table-detail-modal">
          <button className="detail-close-btn" onClick={() => setSelectedTable(null)} aria-label="Cerrar detalle"><Icon name="close" /></button>
          <div className="detail-header">
            <div><span className="eyebrow">TABLA DEL SANDBOX</span><h2><Icon name="table" /> {selectedTable}</h2></div>
            <span className="result-badge">{rows.length} {rows.length === 1 ? 'fila' : 'filas'}</span>
          </div>
          <div className="detail-grid">
            <section className="detail-card">
              <h3>Columnas</h3>
              <div className="detail-columns">
                {columns.length ? columns.map((column, index) => <div key={column} className="detail-column-row"><span className={index === 0 ? 'key-dot' : 'column-dot'}>{index === 0 ? 'PK' : ''}</span><strong>{column}</strong><em>{columnTypeLabel(rows, column)}</em></div>) : <p className="muted">Sin columnas definidas.</p>}
              </div>
            </section>
            <section className="detail-card records-detail-card">
              <h3>Registros actuales</h3>
              {columns.length ? <div className="detail-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{row[column] == null ? <span className="null">NULL</span> : String(row[column])}</td>)}</tr>) : <tr><td colSpan={columns.length}>Tabla vacía: todavía no hay registros.</td></tr>}</tbody></table></div> : <div className="no-records-note">No hay columnas para mostrar.</div>}
            </section>
          </div>
        </div>
      </div>;
    })()}

    <div className="sandbox-note">
      <Icon name="bulb" />
      <div>
        <strong>Entorno seguro</strong>
        <span>Los cambios y tablas nuevas viven solo en esta sesión.</span>
      </div>
    </div>
  </aside>;
}

const queryKeywords = (sql) => sql.match(/\b(?:SELECT|FROM|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN|WHERE|GROUP BY|HAVING|ORDER BY|OFFSET|FETCH|VALUES|SET|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE TABLE|CREATE INDEX|CREATE VIEW)\b/gi) || [];

function Editor({ sql, setSql, onRun, onStep, onReset, selectedExample, setSelectedExample, error, activeClause }) {
  const textarea = useRef(null);
  const lineCount = sql.split('\n').length;
  return <section className="editor-card">
    <div className="editor-toolbar">
      <div><span className="status-dot" /><strong>Editor SQL</strong><span className="dialect">SQL Server compatible</span></div>
      <div className="example-picker"><label htmlFor="examples">Ejemplo</label><select id="examples" value={selectedExample} onChange={(e) => setSelectedExample(e.target.value)}>{examples.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div>
    </div>
    <div className="code-editor">
      <div className="line-numbers">{Array.from({ length: lineCount }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      <textarea ref={textarea} value={sql} onChange={(e) => setSql(e.target.value)} spellCheck="false" aria-label="Consulta SQL" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onRun(); }} />
    </div>
    <div className="query-tracker" aria-label="Clausulas detectadas">
      <span>Consulta:</span>{queryKeywords(sql).map((keyword, index) => {
        const normalized = keyword.toUpperCase();
        const active = normalized === activeClause || (activeClause === 'JOIN' && normalized.includes('JOIN')) || (activeClause === 'LIMIT' && ['OFFSET', 'FETCH'].includes(normalized));
        return <mark className={active ? 'active' : ''} key={`${keyword}-${index}`}>{keyword}</mark>;
      })}
    </div>
    {error && <div className="error-message"><strong>No se pudo ejecutar.</strong> {error}</div>}
    <div className="editor-footer">
      <span className="shortcut"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> para ejecutar</span>
      <div className="actions"><button className="ghost-button" onClick={() => setSql(examples.find((item) => item.id === selectedExample)?.sql || sql)}>Cargar ejemplo</button><button className="ghost-button" onClick={onReset}><Icon name="reset" /> Reset</button><button className="secondary-button" onClick={onStep}><Icon name="steps" /> Paso a paso</button><button className="primary-button" onClick={onRun}><Icon name="play" /> Ejecutar</button></div>
    </div>
  </section>;
}

function StepControllerCard({ execution, activeStep, setActiveStep, showAll, setShowAll, onStep }) {
  if (!execution) {
    return <section className="step-controller-card empty">
      <div className="controller-header"><Icon name="steps" /><h3>Paso a paso</h3></div>
      <div className="controller-body">
        <p className="muted">Escribe una consulta y presiona <strong>Paso a paso</strong> para ver su ejecución lógica paso por paso aquí mismo.</p>
        <button className="primary-button run-step-btn" onClick={onStep}><Icon name="steps" /> Iniciar Paso a Paso</button>
      </div>
    </section>;
  }

  const currentStep = execution.steps[activeStep];
  const totalSteps = execution.steps.length;

  return <section className="step-controller-card active">
    <div className="controller-header">
      <div className="title-area"><Icon name="steps" /><h3>Paso a paso</h3></div>
      <span className="step-badge">Paso {activeStep + 1} de {totalSteps}</span>
    </div>

    <div className="controller-body">
      <div className="step-dots-timeline">
        {execution.steps.map((step, idx) => (
          <button
            key={idx}
            className={`timeline-dot-btn ${idx === activeStep ? 'active' : idx < activeStep ? 'done' : ''}`}
            onClick={() => setActiveStep(idx)}
            title={step.type}
          >
            <span className="dot-index">{idx + 1}</span>
            <span className="dot-label">{step.type}</span>
          </button>
        ))}
      </div>

      <div className={`current-step-box accent-${currentStep.accent}`}>
        <span className="step-type-banner">{currentStep.type}</span>
        <h4>{currentStep.title}</h4>
        <p className="step-desc">{currentStep.detail}</p>
        
        <div className="mini-metric">
          <span>Filas en esta etapa:</span>
          <strong>{currentStep.count}</strong>
        </div>
      </div>
    </div>

    <div className="controller-footer">
      <div className="nav-buttons">
        <button className="secondary-button" disabled={activeStep === 0} onClick={() => setActiveStep(prev => prev - 1)}>Anterior</button>
        <button className="primary-button" disabled={activeStep === totalSteps - 1} onClick={() => setActiveStep(prev => prev + 1)}>Siguiente</button>
      </div>
      <div className="view-toggle">
        <label className="switch-container">
          <input type="checkbox" checked={!showAll} onChange={(e) => setShowAll(!e.target.checked)} />
          <span>Ocultar pasos futuros</span>
        </label>
      </div>
    </div>
  </section>;
}

const writtenOrderIndex = (sql, step, index) => {
  const upper = sql.toUpperCase();
  const type = step.type === 'SOURCE' ? 'FROM' : step.type;
  const patterns = {
    SELECT: /\bSELECT\b/,
    FROM: /\bFROM\b/,
    SOURCE: /\bJOIN\b/,
    JOIN: /\b(?:INNER|LEFT|RIGHT|FULL)?\s*JOIN\b/,
    WHERE: /\bWHERE\b/,
    'GROUP BY': /\bGROUP\s+BY\b/,
    HAVING: /\bHAVING\b/,
    'ORDER BY': /\bORDER\s+BY\b/,
    LIMIT: /\b(?:LIMIT|OFFSET|FETCH|TOP)\b/,
    VALUES: /\bVALUES\b/,
    SET: /\bSET\b/,
    INSERT: /\bINSERT\b/,
    UPDATE: /\bUPDATE\b/,
    DELETE: /\bDELETE\b/,
    TARGET: /\b(?:INTO|UPDATE|FROM)\b/,
    PARSE: /\b(?:CREATE|ALTER|DROP|TRUNCATE)\b/
  };
  const match = upper.match(patterns[step.type] || patterns[type] || new RegExp(`\\b${type.replace(/\s+/g, '\\s+')}\\b`));
  return (match ? match.index : index * 1000) + index / 100;
};

function Journey({ execution, activeStep, setActiveStep, showAll, sql }) {
  const [orderMode, setOrderMode] = useState('logical');
  const orderedSteps = useMemo(() => execution ? execution.steps.map((item, index) => ({ item, originalIndex: index })).sort((a, b) => orderMode === 'logical' ? a.originalIndex - b.originalIndex : writtenOrderIndex(sql, a.item, a.originalIndex) - writtenOrderIndex(sql, b.item, b.originalIndex)) : [], [execution, orderMode, sql]);
  if (!execution) return <section className="welcome-state"><div className="welcome-graphic"><span>SELECT</span><i /><span>FROM</span><i /><span>WHERE</span></div><h2>Tu consulta se convertirá en un recorrido</h2><p>Elige un ejemplo o escribe SQL. Verás cómo cada cláusula transforma los datos.</p></section>;
  const activeVisibleIndex = Math.max(orderedSteps.findIndex((entry) => entry.originalIndex === activeStep), 0);
  const visible = showAll ? orderedSteps : orderedSteps.slice(0, activeVisibleIndex + 1);
  return <section className="journey">
    <div className="section-title journey-title"><div><span className="eyebrow">RECORRIDO DE LA CONSULTA</span><h2>{orderMode === 'logical' ? 'Orden lógico de ejecución' : 'Orden escrito'}</h2></div><div className="journey-tools"><div className="order-switch" role="group" aria-label="Tipo de orden"><button className={orderMode === 'logical' ? 'active' : ''} onClick={() => setOrderMode('logical')}>Orden lógico</button><button className={orderMode === 'written' ? 'active' : ''} onClick={() => setOrderMode('written')}>Orden escrito</button></div><span className="result-badge">{execution.message}</span></div></div>
    <div className="logical-order">{orderedSteps.map(({ item, originalIndex }, index) => <button key={`${item.type}-${originalIndex}`} className={originalIndex === activeStep ? 'active' : index < activeVisibleIndex || showAll ? 'done' : ''} onClick={() => setActiveStep(originalIndex)}><span>{index + 1}</span>{item.type}</button>)}</div>
    <div className="flow">{visible.map(({ item, originalIndex }, index) => <div className="flow-item" key={`${item.type}-${originalIndex}`}>
      {index > 0 && <div className="flow-arrow"><span>↓</span><small>{item.type}</small></div>}
      <article className={`stage-card accent-${item.accent} ${originalIndex === activeStep || showAll ? 'focused' : ''}`} onClick={() => setActiveStep(originalIndex)}>
        <header><div className="stage-number">{index + 1}</div><div><span className="clause-chip">{item.type}</span><h3>{item.title}</h3></div><strong>{item.count} {item.count === 1 ? 'fila' : 'filas'}</strong></header>
        <p>{item.detail}</p><DataTable rows={item.rows} compact compare={item.compare} />
      </article>
    </div>)}</div>
    {!showAll && <div className="step-controls"><button disabled={activeStep === 0} onClick={() => setActiveStep((s) => s - 1)}>Anterior</button><span>Paso {activeStep + 1} de {execution.steps.length}</span><button disabled={activeStep === execution.steps.length - 1} onClick={() => setActiveStep((s) => s + 1)}>Siguiente</button></div>}
  </section>;
}

function ExplainPanel({ execution, activeStep, tab, setTab, history, onHistory }) {
  const current = execution?.steps[activeStep];
  return <aside className="explain-panel">
    <div className="tabs"><button className={tab === 'explain' ? 'active' : ''} onClick={() => setTab('explain')}><Icon name="bulb" /> Explicación</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><Icon name="history" /> Historial</button></div>
    {tab === 'history' ? <div className="history-list"><h3>Consultas recientes</h3>{history.length ? history.map((item, i) => <button key={`${item.time}-${i}`} onClick={() => onHistory(item.sql)}><code>{item.sql.replace(/\s+/g, ' ').slice(0, 68)}</code><span>{item.time}</span></button>) : <p className="muted">Todavía no ejecutaste consultas.</p>}</div> : current ? <div className="explanation">
      <span className={`large-chip accent-${current.accent}`}>{current.type}</span><h2>{current.title}</h2>
      <div className="explain-block"><h4>Qué hace esta cláusula</h4><p>{current.detail}</p></div>
      <div className="explain-block"><h4>Cómo se ejecuta</h4><p>{explanationFor(current.type)}</p></div>
      <div className="explain-block"><h4>Ejemplo</h4><code className="inline-example">{exampleFor(current.type)}</code></div>
      <div className="metric"><span>Resultado intermedio</span><strong>{current.count}</strong><small>{current.count === 1 ? 'fila disponible' : 'filas disponibles'}</small></div>
      <div className="tip"><strong>Notas</strong><p>{noteFor(current.type)}</p></div>
    </div> : <div className="explanation placeholder"><Icon name="bulb" size={32} /><h3>Explicación contextual</h3><p>Ejecuta una consulta y selecciona una etapa para entender qué ocurre.</p></div>}
  </aside>;
}

const explanationFor = (type) => ({ FROM: 'El motor localiza la fuente y crea el conjunto inicial.', JOIN: 'Compara la condición ON fila por fila y combina coincidencias.', WHERE: 'Evalúa la condición para cada fila; solo las verdaderas continúan.', 'GROUP BY': 'Construye una colección por cada combinación única de claves.', HAVING: 'Evalúa agregados de cada grupo y descarta los que no cumplen.', SELECT: 'Calcula expresiones y proyecta únicamente las columnas pedidas.', 'ORDER BY': 'Compara valores y reordena el conjunto ya proyectado.', VALUES: 'Relaciona cada valor con su columna por posición.', SET: 'Asigna los nuevos valores en las filas seleccionadas.' }[type] || 'El motor valida la instrucción y aplica la transformación sobre el estado temporal.');
const exampleFor = (type) => ({ FROM: 'FROM Products', SOURCE: 'LEFT JOIN Orders o ON ...', JOIN: 'INNER JOIN Orders o ON c.id = o.customer_id', WHERE: 'WHERE price BETWEEN 10 AND 50', 'GROUP BY': 'GROUP BY category_id', HAVING: 'HAVING COUNT(*) >= 2', SELECT: 'SELECT name, AVG(price)', 'ORDER BY': 'ORDER BY price DESC', LIMIT: 'OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY', VALUES: "VALUES (4, 'Books')", SET: 'SET stock = 10', INSERT: 'INSERT INTO Categories (...)', UPDATE: 'UPDATE Products SET ...', DELETE: 'DELETE FROM Orders WHERE ...', PARSE: 'CREATE TABLE Suppliers (...)' }[type] || `${type} ...`);
const noteFor = (type) => type === 'LIMIT' ? 'SQL Server usa TOP o OFFSET ... FETCH en lugar de LIMIT.' : type === 'WHERE' ? 'WHERE no filtra agregados; para eso se usa HAVING.' : type === 'SELECT' ? 'Aunque se escribe primero, SELECT se resuelve después de FROM, WHERE y GROUP BY.' : 'La simulación sigue el orden lógico, que puede diferir del orden escrito.';

function Library({ open, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = concepts.filter((item) => `${item.term} ${item.text}`.toLowerCase().includes(search.toLowerCase()));
  return <div className={`library-drawer ${open ? 'open' : ''}`}><div className="drawer-head"><div><span className="eyebrow">BIBLIOTECA SQL</span><h2>Conceptos esenciales</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></div><input className="search" placeholder="Buscar concepto..." value={search} onChange={(e) => setSearch(e.target.value)} />{filtered.map((item) => <article key={item.term}><strong>{item.term}</strong><p>{item.text}</p></article>)}</div>;
}

export default function App() {
  const [database, setDatabase] = useState(createSeedDatabase);
  const [selectedExample, setSelectedExample] = useState('where');
  const [sql, setSql] = useState(examples.find((e) => e.id === 'where').sql);
  const [execution, setExecution] = useState(null);
  const [activeStep, setActiveStep] = useState(0);
  const [showAll, setShowAll] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('explain');
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const timer = useRef();

  useEffect(() => { const example = examples.find((item) => item.id === selectedExample); if (example) { setSql(example.sql); setError(''); } }, [selectedExample]);
  useEffect(() => () => clearInterval(timer.current), []);
  const run = (stepMode = false) => {
    clearInterval(timer.current);
    try {
      const next = executeSql(sql, database); setExecution(next); setDatabase(next.db); setError(''); setActiveStep(0); setShowAll(!stepMode); setTab('explain');
      setHistory((items) => [{ sql, time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) }, ...items.filter((x) => x.sql !== sql)].slice(0, 8));
    } catch (err) { setError(err.message); setExecution(null); }
  };
  const reset = () => { clearInterval(timer.current); setDatabase(createSeedDatabase()); setExecution(null); setError(''); setActiveStep(0); setHistory([]); setSelectedExample('where'); };
  const activeResult = useMemo(() => execution?.steps[activeStep]?.rows || [], [execution, activeStep]);

  return <div className={`app-shell ${darkMode ? 'dark-mode' : ''}`}>
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Icon name="database" /></span><span>SQL <strong>Journey</strong><small>Visual query explorer</small></span></a><nav><button className="mobile-only-flex" onClick={() => setSchemaOpen(true)}><Icon name="database" /> Datos</button><button onClick={() => setLibraryOpen(true)}><Icon name="book" /> Biblioteca SQL</button></nav><div className="header-actions"><button className="theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Modo claro' : 'Modo oscuro'}><Icon name={darkMode ? 'sun' : 'moon'} /></button><div className="session-pill"><span /> Sesión temporal</div></div></header>
    <main id="top"><SchemaPanel database={database} setDatabase={setDatabase} open={schemaOpen} onClose={() => setSchemaOpen(false)} /><div className="workspace"><div className="editor-container-split"><Editor {...{ sql, setSql, selectedExample, setSelectedExample, error }} activeClause={execution?.steps[activeStep]?.type || ''} onRun={() => run(false)} onStep={() => run(true)} onReset={reset} /><StepControllerCard {...{ execution, activeStep, setActiveStep, showAll, setShowAll }} onStep={() => run(true)} /></div><div className="content-grid"><Journey {...{ execution, activeStep, setActiveStep, showAll, sql }} /><ExplainPanel {...{ execution, activeStep, tab, setTab, history }} onHistory={(value) => { setSql(value); setTab('explain'); }} /></div>{execution && <section className="final-result"><div className="section-title"><div><span className="eyebrow">SALIDA</span><h2>Resultado {showAll ? 'final' : 'de la etapa'}</h2></div><span>{showAll ? execution.result.length : activeResult.length} filas</span></div><DataTable rows={showAll ? execution.result : activeResult} /></section>}</div></main>
    <footer className="app-footer">
      <div className="footer-main"><span>Página realizada por <strong>Prieto Agustin</strong></span><span>Alumno UTNFRC</span><span className="footer-badge">Fase de Pruebas</span></div>
      <p className="footer-legal">Copyright © 2026 Prieto Agustin. Todos los derechos reservados. Uso educativo autorizado. Prohibida la copia, redistribución o explotación comercial sin permiso.</p>
    </footer>
    <Library open={libraryOpen} onClose={() => setLibraryOpen(false)} />{(schemaOpen || libraryOpen) && <button className={`scrim ${schemaOpen && !libraryOpen ? 'mobile-only-scrim' : ''}`} onClick={() => { setSchemaOpen(false); setLibraryOpen(false); }} aria-label="Cerrar panel" />}
  </div>;
}
