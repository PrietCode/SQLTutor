import React, { useEffect, useMemo, useRef, useState } from 'react';
import { examples } from './data/examples';
import { createSeedDatabase } from './data/seed';
import { executeSql, executeSqlScript, splitSqlStatements } from './lib/sqlEngine';
import { HistoryModal } from './components/history/HistoryModal';
import { JoinKeyNote } from './components/journey/JoinKeyNote';
import { ResultPanel } from './components/results/ResultPanel';
import { Scrim } from './components/layout/Scrim';
import { LibraryDrawer } from './components/library/LibraryDrawer';
import { SchemaPanel } from './components/sandbox/SchemaPanel';
import { DataTable } from './components/tables/DataTable';
import { Icon } from './components/ui/Icon';
import { useBodyScrollLock } from './hooks/useBodyScrollLock';
import { useOverlayState } from './hooks/useOverlayState';
import { hasSubqueryTrace, parentConditionText, parentStepDetail, formatSubqueryValue, subqueryConditionText, subqueryReturnText, buildSubqueryGroups } from './visual/subqueryVisual';
import { SUBQUERY_STEP_TYPE, buildVisualSteps, writtenOrderIndex } from './visual/visualSteps';

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

const queryKeywords = (sql) => sql.match(/\b(?:SELECT|DISTINCT|FROM|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN|WHERE|GROUP BY|HAVING|ORDER BY|UNION|INTERSECT|EXCEPT|EXISTS|ANY|SOME|ALL|GETDATE|YEAR|CAST|CONVERT|OFFSET|FETCH|VALUES|SET|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE TABLE|CREATE INDEX|CREATE VIEW)\b/gi) || [];
const sqlFileAccept = '.sql,.txt';
const isSqlImportFile = (fileName) => /\.(sql|txt)$/i.test(fileName);

function Editor({ sql, setSql, setError, setImportMessage, onRun, onStep, onReset, onImportSqlFile, selectedExample, setSelectedExample, error, importMessage, activeClause, stepMode }) {
  const textarea = useRef(null);
  const fileInput = useRef(null);
  const lineCount = sql.split('\n').length;
  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isSqlImportFile(file.name)) {
      setError('Solo se pueden importar archivos .sql o .txt con instrucciones SQL.');
      setImportMessage('');
      event.target.value = '';
      return;
    }
    await onImportSqlFile(await file.text(), file.name);
    event.target.value = '';
  };
  return <section className="editor-card">
    <div className="editor-toolbar">
      <div><span className="status-dot" /><strong>Editor SQL</strong><span className="dialect">SQL Server compatible</span></div>
      <div className="editor-toolbar-tools"><button className="import-file-button" onClick={() => fileInput.current?.click()}><Icon name="upload" /> Importar Archivo SQL</button><input ref={fileInput} type="file" accept={sqlFileAccept} hidden onChange={handleFile} /><div className="example-picker"><label htmlFor="examples">Ejemplo</label><select id="examples" value={selectedExample} onChange={(e) => { const val = e.target.value; setSelectedExample(val); if (!val) { setSql(''); setError(''); setImportMessage(''); } }}><option value="">Seleccionar</option>{examples.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div></div>
    </div>
    <div className="code-editor">
      <div className="line-numbers">{Array.from({ length: lineCount }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      <textarea ref={textarea} value={sql} onChange={(e) => { setSql(e.target.value); setSelectedExample(''); }} spellCheck="false" aria-label="Consulta SQL" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onRun(); }} />
    </div>
    <div className="query-tracker" aria-label="Clausulas detectadas">
      <span>Consulta:</span>{queryKeywords(sql).map((keyword, index) => {
        const normalized = keyword.toUpperCase();
        const active = normalized === activeClause || (activeClause === 'JOIN' && normalized.includes('JOIN')) || (activeClause === 'LIMIT' && ['OFFSET', 'FETCH'].includes(normalized));
        return <mark className={active ? 'active' : ''} key={`${keyword}-${index}`}>{keyword}</mark>;
      })}
    </div>
    {error && <div className="error-message"><strong>No se pudo ejecutar.</strong> {error}</div>}
    {importMessage && <div className="success-message"><strong>Archivo SQL importado.</strong> {importMessage}</div>}
    <div className="editor-footer">
      <span className="shortcut"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> para ejecutar</span>
      <div className="actions"><button className="ghost-button" onClick={onReset}><Icon name="reset" /> Reset</button><button className={stepMode ? 'primary-button' : 'secondary-button'} aria-pressed={stepMode} onClick={onStep}><Icon name="steps" /> Paso a paso</button><button className="primary-button" onClick={onRun}><Icon name="play" /> Ejecutar</button></div>
    </div>
  </section>;
}

const subqueryVerdictText = (summary) => summary.verdict ? `Resultado: ${summary.verdict} (${summary.rowCount} ${summary.rowCount === 1 ? 'fila' : 'filas'})` : `Retorno: ${subqueryReturnText(summary)}`;
const parameterText = (summary) => summary.parameters?.length ? summary.parameters.map((param) => `${param.name} = ${formatSubqueryValue(param.value)}`).join(', ') : 'sin parámetro externo';

function ParameterChips({ summary }) {
  if (!summary.parameters?.length) return <span>Parámetro: sin referencia externa detectada</span>;
  return <div className="subquery-keyline"><span>Llave de correlación</span>{summary.parameters.map((param) => <code className="external-key" key={param.name}>{param.name} = {formatSubqueryValue(param.value)}</code>)}</div>;
}

function ShortCircuitNote({ summary }) {
  if (!/EXISTS/i.test(summary.operator || '')) return null;
  return <div className="subquery-short-circuit"><b>Ciclo Corto de EXISTS</b><span>El motor se detiene apenas encuentra una fila interna que cumple la condición. No evalúa el contenido de esa fila: solo necesita saber si existe al menos una coincidencia.</span></div>;
}

function SubqueryCycleDetail({ summary }) {
  if (summary.mode !== 'correlated') return null;
  return <div className="subquery-cycle-detail"><div><b>Inyección de parámetro</b><ParameterChips summary={summary} /></div><div><b>Condición evaluada</b><span>{subqueryConditionText(summary)}</span></div><div><b>Veredicto del ciclo</b><span>{subqueryVerdictText(summary)}</span></div><ShortCircuitNote summary={summary} /></div>;
}

function SubqueryStepCard({ step, index }) {
  return <div className="subquery-flow-item" key={`${step.subqueryTraceId || 'legacy'}-${step.type}-${index}`}>{index > 0 && <div className="flow-arrow"><span>↓</span><small>{step.type}</small></div>}<article className={`stage-card accent-${step.accent} subquery-card`}><header><div className="stage-number">{index + 1}</div><div><span className="clause-chip">{step.type}</span><h3>{step.title}</h3></div><strong>{step.count} {step.count === 1 ? 'fila' : 'filas'}</strong></header><p>{step.detail}</p><DataTable rows={step.rows} compact compare={step.compare} /><JoinKeyNote compare={step.type === 'JOIN' ? step.compare : null} /></article></div>;
}

function SubqueryBranch({ summary, steps, traced, compactHeader = false, hideCycleDetail = false }) {
  const currentSteps = traced ? steps.filter((step) => step.subqueryTraceId === summary.id) : steps;
  const correlated = summary.mode === 'correlated';
  return <section className={`subquery-branch ${correlated ? 'correlated' : 'uncorrelated'} ${compactHeader ? 'carousel-slide' : ''}`}><div className="subquery-branch-head"><strong>{correlated ? `Iteración N${summary.iteration}` : 'Evaluación única'}</strong><span>{correlated ? 'subconsulta correlacionada' : 'subconsulta no correlacionada'}</span></div>{!hideCycleDetail && <SubqueryCycleDetail summary={summary} />}{currentSteps.map((sqStep, sqIndex) => <SubqueryStepCard step={sqStep} index={sqIndex} key={`${summary.id || 'legacy'}-${sqIndex}`} />)}{!hideCycleDetail && <div className="subquery-return"><span>Retorno a la condición</span><code>{subqueryReturnText(summary)}</code></div>}</section>;
}

function ExternalIterationTable({ rows = [], activeIndex, summary }) {
  if (!rows.length) return null;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith('__'))))].slice(0, 6);
  const verdictClass = summary.verdict === 'TRUE' ? 'passes-true' : summary.verdict === 'FALSE' ? 'passes-false' : 'passes-unknown';
  return <aside className="external-row-panel"><div className="external-row-head"><strong>Tabla externa</strong><span>Fila evaluada por WHERE/HAVING</span></div><div className="external-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className={index === activeIndex ? `current ${verdictClass}` : ''} key={index}>{columns.map((column) => <td key={column}>{row[column] == null ? <span className="null">NULL</span> : String(row[column])}</td>)}</tr>)}</tbody></table></div><p>La fila resaltada es la que inyecta su llave en la subconsulta. Verde pasa el filtro; rojo se descarta.</p></aside>;
}

function CorrelatedSubqueryCarousel({ summaries, steps, traced, externalRows }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showInternalTrace, setShowInternalTrace] = useState(false);
  const total = summaries.length;
  const index = Math.min(activeIndex, Math.max(total - 1, 0));
  const summary = summaries[index];
  if (!summary) return null;
  return <div className="subquery-carousel"><div className="subquery-carousel-head"><button className="subquery-nav-button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); setActiveIndex((value) => Math.max(value - 1, 0)); }} aria-label="Iteración anterior">←</button><div className="subquery-carousel-title"><strong>Iteración {index + 1} de {total}</strong><span>El motor ejecuta esta subconsulta por cada fila externa antes de avanzar al siguiente paso de la regla.</span></div><button className="subquery-nav-button" disabled={index === total - 1} onClick={(event) => { event.stopPropagation(); setActiveIndex((value) => Math.min(value + 1, total - 1)); }} aria-label="Iteración siguiente">→</button></div><div className="subquery-carousel-body"><div className="subquery-cycle-shell"><SubqueryCycleDetail summary={summary} /><div className="subquery-return"><span>Resultado del ciclo</span><code>{subqueryReturnText(summary)}</code></div><button className="subquery-trace-toggle" onClick={(event) => { event.stopPropagation(); setShowInternalTrace((value) => !value); }}>{showInternalTrace ? 'Ocultar ejecución interna' : 'Ver ejecución interna'}</button>{showInternalTrace && <SubqueryBranch summary={summary} steps={steps} traced={traced} compactHeader hideCycleDetail />}</div><ExternalIterationTable rows={externalRows} activeIndex={index} summary={summary} /></div><p className="subquery-carousel-note">Aunque navegues las iteraciones, conceptualmente el motor repite este ciclo fila externa → subconsulta → retorno → decisión antes de pasar a SELECT u ORDER BY.</p></div>;
}

function SubqueryQueryBlock({ group }) {
  const query = group.summaries.find((summary) => summary.innerSql)?.innerSql;
  if (!query) return null;
  return <div className="subquery-query-block"><strong>Consulta interna</strong><code>{query}</code></div>;
}

function SubqueryGroupFlow({ group }) {
  const correlatedSummaries = group.summaries.filter((summary) => summary.mode === 'correlated');
  const plainSummaries = group.summaries.filter((summary) => summary.mode !== 'correlated');
  return <div className="subquery-nested standalone"><div className="subquery-label">↳ Subconsulta</div><SubqueryQueryBlock group={group} />{correlatedSummaries.length ? <CorrelatedSubqueryCarousel summaries={correlatedSummaries} steps={group.steps} traced={group.traced} externalRows={group.externalRows} /> : plainSummaries.map((summary, summaryIndex) => <SubqueryBranch summary={summary} steps={group.steps} traced={group.traced} key={summary.id || summaryIndex} />)}</div>;
}

function SubqueryFlow({ compare, group }) {
  const groups = group ? [group] : buildSubqueryGroups(compare);
  if (!groups.length) return null;
  return <>{groups.map((item) => <SubqueryGroupFlow group={item} key={item.key} />)}</>;
}

function SubqueryDependencyNote({ step }) {
  if (!hasSubqueryTrace(step)) return null;
  return <div className="subquery-parent-note"><strong>Condición con subconsulta</strong><code>{parentConditionText(step)}</code><p>La condición utiliza una subconsulta. En el siguiente paso se muestra cómo se obtiene su resultado.</p></div>;
}

function JourneyStepCard({ step, displayIndex, focused, highlighted, showArrow, onSelect }) {
  const item = step.item;
  if (step.kind === 'subquery') {
    return <div className="flow-item" id={`visual-step-${step.id}`} key={step.id}>{showArrow && <div className="flow-arrow"><span>↓</span><small>{item.type}</small></div>}<article className={`stage-card accent-${item.accent} subquery-stage ${focused ? 'focused' : ''} ${highlighted ? 'jump-highlight' : ''}`} onClick={onSelect}><header><div className="stage-number">{displayIndex}</div><div><span className="clause-chip">{item.type}</span><h3>{item.title}</h3></div><strong>{item.count} {item.count === 1 ? 'ciclo' : 'ciclos'}</strong></header><p>{item.detail}</p><SubqueryFlow group={item.subqueryGroup} /></article></div>;
  }
  return <div className="flow-item" id={`visual-step-${step.id}`} key={step.id}>{showArrow && <div className="flow-arrow"><span>↓</span><small>{item.type}</small></div>}<article className={`stage-card accent-${item.accent} ${focused ? 'focused' : ''} ${highlighted ? 'jump-highlight' : ''}`} onClick={onSelect}><header><div className="stage-number">{displayIndex}</div><div><span className="clause-chip">{item.type}</span><h3>{item.title}</h3></div><strong>{item.count} {item.count === 1 ? 'fila' : 'filas'}</strong></header><p>{parentStepDetail(item)}</p><SubqueryDependencyNote step={item} /><DataTable rows={item.rows} compact compare={item.compare} /><JoinKeyNote compare={item.type === 'JOIN' ? item.compare : null} /></article></div>;
}

function Journey({ execution, visualSteps, activeStep, setActiveStep, showAll, setShowAll, stepMode, setStepMode, sql }) {
  const [orderMode, setOrderMode] = useState('logical');
  const [highlightedStep, setHighlightedStep] = useState(null);
  const orderedSteps = useMemo(() => execution ? visualSteps.map((step, index) => ({ step, visualIndex: index })).sort((a, b) => orderMode === 'logical' ? a.visualIndex - b.visualIndex : (writtenOrderIndex(sql, a.step.parentStep, a.step.originalIndex) + a.step.orderOffset) - (writtenOrderIndex(sql, b.step.parentStep, b.step.originalIndex) + b.step.orderOffset)) : [], [execution, orderMode, sql, visualSteps]);
  if (!execution) return <section className="welcome-state"><div className="welcome-graphic"><span>SELECT</span><i /><span>FROM</span><i /><span>WHERE</span></div><h2>Tu consulta se convertirá en un recorrido</h2><p>Elige un ejemplo o escribe SQL. Verás cómo cada cláusula transforma los datos.</p></section>;
  const activeVisibleIndex = Math.max(orderedSteps.findIndex((entry) => entry.visualIndex === activeStep), 0);
  const showAllSteps = showAll || orderMode === 'written';
  const visible = showAllSteps ? orderedSteps : orderedSteps.slice(activeVisibleIndex, activeVisibleIndex + 1);
  const navigateToStep = (step, visualIndex) => {
    setActiveStep(visualIndex);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = document.getElementById(`visual-step-${step.id}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        setHighlightedStep(step.id);
        window.setTimeout(() => setHighlightedStep((current) => current === step.id ? null : current), 1000);
      }, target ? 350 : 0);
    }));
  };
  return <section className="journey">
    <div className="section-title journey-title"><div><span className="eyebrow">RECORRIDO DE LA CONSULTA</span><h2>{orderMode === 'logical' ? 'Orden lógico de ejecución' : 'Orden escrito'}</h2></div><div className="journey-tools"><div className="order-switch" role="group" aria-label="Tipo de orden"><button className={orderMode === 'logical' ? 'active' : ''} onClick={() => setOrderMode('logical')}>Orden lógico</button><button className={orderMode === 'written' ? 'active' : ''} onClick={() => { setOrderMode('written'); setStepMode(false); setShowAll(true); }}>Orden escrito</button></div><span className="result-badge">{execution.message}</span></div></div>
    <div className="logical-order">{orderedSteps.map(({ step, visualIndex }, index) => <React.Fragment key={step.id}>{index > 0 && <i className="logical-order-arrow">→</i>}<button className={`${visualIndex === activeStep ? 'active' : index < activeVisibleIndex || showAllSteps ? 'done' : ''} ${step.kind === 'subquery' ? 'subquery-order-step' : ''}`} onClick={() => navigateToStep(step, visualIndex)}><span>{index + 1}</span>{step.item.type}</button></React.Fragment>)}</div>
    <div className="flow">{visible.map(({ step, visualIndex }, index) => {
      const displayIndex = showAllSteps ? index + 1 : activeVisibleIndex + 1;
      return <JourneyStepCard step={step} displayIndex={displayIndex} focused={visualIndex === activeStep || showAllSteps} highlighted={highlightedStep === step.id} showArrow={showAllSteps && index > 0} onSelect={() => setActiveStep(visualIndex)} key={step.id} />;
    })}</div>
    {!showAll && orderMode === 'logical' && <div className="step-controls"><button disabled={activeVisibleIndex === 0} onClick={() => setActiveStep(orderedSteps[activeVisibleIndex - 1]?.visualIndex ?? activeStep)}>Anterior</button><span>Paso {activeVisibleIndex + 1} de {orderedSteps.length}: {orderedSteps[activeVisibleIndex]?.step.item.type}</span><button disabled={activeVisibleIndex === orderedSteps.length - 1} onClick={() => setActiveStep(orderedSteps[activeVisibleIndex + 1]?.visualIndex ?? activeStep)}>Siguiente</button></div>}
  </section>;
}

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
  const [importMessage, setImportMessage] = useState('');
  const [history, setHistory] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const timer = useRef();
  const databaseRef = useRef(database);
  const { schemaOpen, explainOpen, historyOpen, libraryOpen, overlayOpen, openSchema, openLibrary, openHistory, closeSchema, closeLibrary, closeHistory, closeOverlays, toggleExplain } = useOverlayState();

  useEffect(() => { const example = examples.find((item) => item.id === selectedExample); if (example) { setSql(example.sql); setError(''); setImportMessage(''); } }, [selectedExample]);
  useEffect(() => { databaseRef.current = database; }, [database]);
  useEffect(() => () => clearInterval(timer.current), []);
  const visualSteps = useMemo(() => buildVisualSteps(execution), [execution]);
  useEffect(() => { if (activeStep >= visualSteps.length) setActiveStep(Math.max(visualSteps.length - 1, 0)); }, [activeStep, visualSteps.length]);
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
      const next = statements.length > 1 ? executeSqlScript(sql, databaseRef.current) : executeSql(sql, databaseRef.current); databaseRef.current = next.db; setExecution(next); setDatabase(next.db); setError(''); setImportMessage(''); setActiveStep(0); setShowAll(!startStep); setStepMode(startStep);
      setHistory((items) => [{ sql, time: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) }, ...items.filter((x) => x.sql !== sql)].slice(0, 8));
    } catch (err) { setError(err.message); setImportMessage(''); setExecution(null); }
  };
  const toggleStepMode = () => {
    if (stepMode) { setStepMode(false); setShowAll(true); }
    else if (execution) { setStepMode(true); setShowAll(false); setActiveStep(0); }
    else { run(true); }
  };
  const importSqlFile = async (content, fileName) => {
    clearInterval(timer.current);
    try {
      if (!hasTerminatingSemicolon(content)) throw new Error('El archivo SQL debe finalizar cada sentencia con punto y coma (;).');
      const next = executeSqlScript(content, databaseRef.current);
      databaseRef.current = next.db; setDatabase(next.db); setExecution(null); setError(''); setActiveStep(0); setShowAll(true);
      setImportMessage(`${fileName}: ${next.importedStatements} sentencias ejecutadas sobre la base local.`);
    } catch (err) { setError(err.message); setImportMessage(''); }
  };
  const reset = () => { clearInterval(timer.current); const initial = createSeedDatabase(); databaseRef.current = initial; setDatabase(initial); setExecution(null); setError(''); setImportMessage(''); setActiveStep(0); setHistory([]); setSelectedExample(''); setSql(''); };
  const activeVisualStep = visualSteps[Math.min(activeStep, Math.max(visualSteps.length - 1, 0))]?.item;
  const activeResult = useMemo(() => activeVisualStep?.rows || [], [activeVisualStep]);
  const activeClause = activeVisualStep?.parentType || activeVisualStep?.type || '';
  useBodyScrollLock(overlayOpen);

  return <div className={`app-shell ${darkMode ? 'dark-mode' : ''}`}>
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Icon name="database" /></span><span>SQL <strong>Tutor</strong><small>Explorador Visual Consultas</small></span></a><nav><button className="nav-icon-button" onClick={openSchema} aria-label="Abrir base de datos" title="Base de datos"><Icon name="database" /></button><button className={`nav-icon-button ${explainOpen ? 'active' : ''}`} onClick={toggleExplain} aria-label="Ir a explicación" aria-pressed={explainOpen} title="Explicación"><Icon name="bulb" /></button><button className="nav-icon-button library-shortcut" onClick={openLibrary} aria-label="Abrir Biblioteca SQL" title="Biblioteca SQL"><Icon name="book" /></button><button className="library-text-button" onClick={openLibrary}><Icon name="book" /> Biblioteca SQL</button></nav><div className="header-actions"><button className="theme-toggle" onClick={() => setDarkMode((value) => !value)} aria-label={darkMode ? 'Activar modo claro' : 'Activar modo oscuro'} title={darkMode ? 'Modo claro' : 'Modo oscuro'}><Icon name={darkMode ? 'sun' : 'moon'} /></button><button className="theme-toggle header-history-button" onClick={openHistory} aria-label="Abrir historial" title="Historial"><Icon name="history" /></button><div className="session-pill"><span /> Sesión temporal</div></div></header>
    <main id="top"><SchemaPanel database={database} open={schemaOpen} onClose={closeSchema} onCreateTable={createSandboxTable} onDeleteTable={deleteSandboxTable} /><div className="workspace-layout"><div className="workspace"><div className="editor-container-split"><Editor {...{ sql, setSql, setError, setImportMessage, selectedExample, setSelectedExample, error, importMessage, stepMode }} activeClause={activeClause} onImportSqlFile={importSqlFile} onRun={() => run(false)} onStep={toggleStepMode} onReset={reset} /><ResultPanel execution={execution} /></div><div className={`execution-guide-layout ${explainOpen ? 'guide-open' : ''}`}><div className="execution-main-column"><div className="content-grid"><Journey {...{ execution, visualSteps, activeStep, setActiveStep, showAll, setShowAll, stepMode, setStepMode, sql }} /></div>{execution && <section className="final-result"><div className="section-title"><div><span className="eyebrow">SALIDA</span><h2>Resultado {showAll ? 'final' : 'de la etapa'}</h2></div><span>{showAll ? execution.result.length : activeResult.length} filas</span></div><DataTable rows={showAll ? execution.result : activeResult} /></section>}</div>{explainOpen && <ExplainPanel {...{ visualSteps, activeStep, stepMode }} open={explainOpen} onClose={toggleExplain} />}</div></div></div></main>
    <footer className="app-footer">
      <div className="footer-main"><span>Página realizada por <strong>Prieto Agustin</strong></span><span>Alumno UTNFRC</span><span className="footer-badge">Fase de Pruebas</span></div>
      <p className="footer-legal">Copyright © 2026 Prieto Agustin. Todos los derechos reservados. Uso educativo autorizado. Prohibida la copia, redistribución o explotación comercial sin permiso.</p>
    </footer>
    {overlayOpen && <Scrim onClick={closeOverlays} />}
    <LibraryDrawer open={libraryOpen} onClose={closeLibrary} />
    <HistoryModal open={historyOpen} history={history} onClose={closeHistory} onSelect={(value) => setSql(value)} />
  </div>;
}
