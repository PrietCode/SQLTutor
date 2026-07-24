import React, { useRef } from 'react';
import { Icon } from '../ui/Icon';

const queryKeywords = (sql) => sql.match(/\b(?:SELECT|DISTINCT|FROM|INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|JOIN|WHERE|GROUP BY|HAVING|ORDER BY|UNION|INTERSECT|EXCEPT|EXISTS|ANY|SOME|ALL|GETDATE|YEAR|CAST|CONVERT|OFFSET|FETCH|VALUES|SET|INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE TABLE|CREATE INDEX|CREATE VIEW)\b/gi) || [];

export function SqlEditor({ sql, onSqlChange, examples, selectedExample, onExampleChange, onRun, onStep, onReset, error, importMessage, activeClause, stepMode, fileInputRef, sqlFileAccept, onOpenImportFile, onImportFileChange }) {
  const textarea = useRef(null);
  const lineCount = sql.split('\n').length;
  return <section className="editor-card">
    <div className="editor-toolbar">
      <div><span className="status-dot" /><strong>Editor SQL</strong><span className="dialect">SQL Server compatible</span></div>
      <div className="editor-toolbar-tools"><button className="import-file-button" onClick={onOpenImportFile}><Icon name="upload" /> Importar Archivo SQL</button><input ref={fileInputRef} type="file" accept={sqlFileAccept} hidden onChange={onImportFileChange} /><div className="example-picker"><label htmlFor="examples">Ejemplo</label><select id="examples" value={selectedExample} onChange={(e) => onExampleChange(e.target.value)}><option value="">Seleccionar</option>{examples.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></div></div>
    </div>
    <div className="code-editor">
      <div className="line-numbers">{Array.from({ length: lineCount }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
      <textarea ref={textarea} value={sql} onChange={(e) => onSqlChange(e.target.value)} spellCheck="false" aria-label="Consulta SQL" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onRun(); }} />
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
