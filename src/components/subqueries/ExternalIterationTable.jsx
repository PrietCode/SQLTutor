import React from 'react';

export function ExternalIterationTable({ rows = [], activeIndex, summary }) {
  if (!rows.length) return null;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith('__'))))].slice(0, 6);
  const verdictClass = summary.verdict === 'TRUE' ? 'passes-true' : summary.verdict === 'FALSE' ? 'passes-false' : 'passes-unknown';
  return <aside className="external-row-panel"><div className="external-row-head"><strong>Tabla externa</strong><span>Fila evaluada por WHERE/HAVING</span></div><div className="external-table-wrap"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr className={index === activeIndex ? `current ${verdictClass}` : ''} key={index}>{columns.map((column) => <td key={column}>{row[column] == null ? <span className="null">NULL</span> : String(row[column])}</td>)}</tr>)}</tbody></table></div><p>La fila resaltada es la que inyecta su llave en la subconsulta. Verde pasa el filtro; rojo se descarta.</p></aside>;
}
