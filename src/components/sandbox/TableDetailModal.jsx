import React from 'react';
import { useBlockingOverlayAccessibility } from '../../hooks/useBlockingOverlayAccessibility';
import { Icon } from '../ui/Icon';

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

export function TableDetailModal({ tableName, rows, onClose }) {
  const dialogRef = useBlockingOverlayAccessibility(true, onClose);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : (rows.columns || []);
  const foreignKeys = (rows.constraints || []).filter((constraint) => constraint.type === 'FOREIGN KEY');
  return <div ref={dialogRef} className="table-detail-overlay" role="dialog" aria-modal="true" aria-label={`Detalle de tabla ${tableName}`} tabIndex={-1}>
    <div className="table-detail-modal">
      <button type="button" className="detail-close-btn" onClick={onClose} aria-label="Cerrar detalle"><Icon name="close" /></button>
      <div className="detail-header">
        <div><span className="eyebrow">TABLA DEL SANDBOX</span><h2><Icon name="table" /> {tableName}</h2></div>
        <span className="result-badge">{rows.length} {rows.length === 1 ? 'fila' : 'filas'}</span>
      </div>
      <div className="detail-grid">
        <div className="detail-side">
          <section className="detail-card">
            <h3>Columnas</h3>
            <div className="detail-columns">
              {columns.length ? columns.map((column, index) => <div key={column} className="detail-column-row"><span className={index === 0 ? 'key-dot' : 'column-dot'}>{index === 0 ? 'PK' : ''}</span><strong>{column}</strong><em>{columnTypeLabel(rows, column)}</em></div>) : <p className="muted">Sin columnas definidas.</p>}
            </div>
          </section>
          <section className="detail-card">
            <h3>Detalles</h3>
            {foreignKeys.length ? <div className="fk-list">{foreignKeys.map((fk, index) => <div className="fk-row" key={index}><strong>{fk.columns.join(', ')}</strong><span>es clave foránea de <b>{fk.references.table}</b> ({fk.references.columns.join(', ')})</span></div>)}</div> : <p className="muted">No hay claves foráneas declaradas para esta tabla.</p>}
          </section>
        </div>
        <section className="detail-card records-detail-card">
          <h3>Registros actuales</h3>
          {columns.length ? <div className="detail-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{row[column] == null ? <span className="null">NULL</span> : String(row[column])}</td>)}</tr>) : <tr><td colSpan={columns.length}>Tabla vacía: todavía no hay registros.</td></tr>}</tbody></table></div> : <div className="no-records-note">No hay columnas para mostrar.</div>}
        </section>
      </div>
    </div>
  </div>;
}
