import React, { useState } from 'react';
import { findDisplayColumn, rowSignature } from '../../visual/tableDiff';

export function DataTable({ rows = [], compact = false, faded = false, compare = null }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedColumns, setExpandedColumns] = useState(false);
  const currentRows = rows.map((row) => ({ ...row, __diffStatus: 'kept' }));
  if (compare?.kind === 'insert') {
    const addedCounts = new Map((compare.addedRows || []).map((row) => [rowSignature(row), 0]));
    (compare.addedRows || []).forEach((row) =>
      addedCounts.set(rowSignature(row), (addedCounts.get(rowSignature(row)) || 0) + 1)
    );
    for (let i = currentRows.length - 1; i >= 0; i -= 1) {
      const signature = rowSignature(currentRows[i]);
      const count = addedCounts.get(signature) || 0;
      if (count > 0) {
        currentRows[i].__diffStatus = 'added';
        addedCounts.set(signature, count - 1);
      }
    }
  }
  if (compare?.kind === 'join' && compare.outerVirtualRows?.length) {
    const virtualCounts = new Map();
    compare.outerVirtualRows.forEach((row) =>
      virtualCounts.set(rowSignature(row), (virtualCounts.get(rowSignature(row)) || 0) + 1)
    );
    for (let i = currentRows.length - 1; i >= 0; i -= 1) {
      const signature = rowSignature(currentRows[i]);
      const count = virtualCounts.get(signature) || 0;
      if (count > 0) {
        currentRows[i].__diffStatus = 'added';
        virtualCounts.set(signature, count - 1);
      }
    }
  }
  const currentSignatures = new Set(rows.map(rowSignature));
  const removedRows = ['filter', 'join'].includes(compare?.kind)
    ? (compare.beforeRows || [])
        .filter((row) => !currentSignatures.has(rowSignature(row)))
        .map((row) => ({ ...row, __diffStatus: 'removed' }))
    : [];
  const addedRowCount = currentRows.filter((row) => row.__diffStatus === 'added').length;
  const visualRows = [...currentRows, ...removedRows];
  const addedColumns = new Set(compare?.kind === 'join' ? compare.addedColumns || [] : []);
  const removedColumns = new Set(compare?.kind === 'project' ? compare.removedColumns || [] : []);
  const allColumnNames = [
    ...new Set(
      visualRows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith('__')))
    ),
  ];
  const projectionSourceByIndex = compare?.kind === 'project' ? compare.beforeRows || [] : [];
  const joinLinks = (compare?.joinKeys || [])
    .map((pair) => {
      const leftKey = findDisplayColumn(allColumnNames, pair.left, pair.leftColumn);
      const rightKey = findDisplayColumn(allColumnNames, pair.right, pair.rightColumn);
      return leftKey && rightKey && leftKey !== rightKey ? { ...pair, leftKey, rightKey } : null;
    })
    .filter(Boolean);
  const hiddenJoinColumns = new Set(joinLinks.flatMap((link) => [link.leftKey, link.rightKey]));
  const joinKeyColumns = new Set(joinLinks.map((link) => link.label));
  const columns = [
    ...new Set([
      ...allColumnNames.flatMap((column) => {
        const link = joinLinks.find((item) => item.leftKey === column);
        if (link) return [link.label];
        return hiddenJoinColumns.has(column) ? [] : [column];
      }),
      ...removedColumns,
    ]),
  ];
  const tableRows = visualRows
    .map((row) => {
      const next = { ...row };
      joinLinks.forEach((link) => {
        const leftValue = row[link.leftKey];
        const rightValue = row[link.rightKey];
        next[link.label] =
          leftValue === rightValue
            ? leftValue
            : leftValue == null && rightValue == null
              ? null
              : `${leftValue ?? 'NULL'} ↔ ${rightValue ?? 'NULL'}`;
        delete next[link.leftKey];
        delete next[link.rightKey];
      });
      return next;
    })
    .map((row, index) => {
      if (compare?.kind !== 'project') return row;
      const source = projectionSourceByIndex[index] || {};
      return {
        ...row,
        ...Object.fromEntries([...removedColumns].map((column) => [column, source[column]])),
      };
    });
  if (!visualRows.length) return <div className="empty-table">Sin filas en esta etapa</div>;
  const limit = compact ? 6 : 10;
  const hasExtra = visualRows.length > limit;
  const columnLimit = compact ? 6 : 9;
  const pinnedColumns = new Set([...addedColumns, ...removedColumns, ...joinKeyColumns]);
  const baseColumns = columns.filter((column) => !pinnedColumns.has(column));
  const visibleColumns = expandedColumns
    ? columns
    : [
        ...baseColumns.slice(0, columnLimit),
        ...columns.filter(
          (column) =>
            pinnedColumns.has(column) && !baseColumns.slice(0, columnLimit).includes(column)
        ),
      ];
  const hasExtraColumns = columns.length > visibleColumns.length;
  const hasAddRemove =
    removedRows.length > 0 || addedRowCount > 0 || addedColumns.size > 0 || removedColumns.size > 0;
  const removedLabel =
    compare?.unit === 'grupos'
      ? 'grupos recortados'
      : compare?.kind === 'join'
        ? 'pares descartados por ON'
        : 'filas recortadas';
  const columnClass = (column) =>
    removedColumns.has(column)
      ? 'removed-column'
      : joinKeyColumns.has(column)
        ? 'join-key-column'
        : addedColumns.has(column)
          ? 'added-column'
          : compare?.comparedColumn === column
            ? 'compared-column'
            : '';
  return (
    <div className={`table-wrap ${faded ? 'faded' : ''}`}>
      <table className={compact ? 'compact-table' : ''}>
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th className={columnClass(column)} key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(expanded ? tableRows : tableRows.slice(0, limit)).map((row, index) => (
            <tr
              className={
                row.__diffStatus === 'removed'
                  ? 'removed-row'
                  : row.__diffStatus === 'added'
                    ? 'added-row'
                    : ''
              }
              key={index}
            >
              {visibleColumns.map((column) => (
                <td key={column} className={columnClass(column)}>
                  {row[column] == null ? <span className="null">NULL</span> : String(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(hasExtra || hasExtraColumns) && (
        <div className="table-expand-controls">
          {hasExtraColumns && (
            <button
              className="more-rows-btn"
              onClick={(event) => {
                event.stopPropagation();
                setExpandedColumns(!expandedColumns);
              }}
            >
              {expandedColumns ? (
                <>
                  <span className="collapse-circle">−</span> ocultar columnas
                </>
              ) : (
                <span>+ {columns.length - visibleColumns.length} columnas</span>
              )}
            </button>
          )}
          {hasExtra && (
            <button
              className="more-rows-btn"
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? (
                <>
                  <span className="collapse-circle">−</span> ocultar filas
                </>
              ) : (
                <span>+ {visualRows.length - limit} filas</span>
              )}
            </button>
          )}
        </div>
      )}
      {hasAddRemove && (
        <div className="comparison-legend">
          {removedRows.length > 0 && (
            <span>
              <i className="legend-dot removed" />
              {removedLabel}
            </span>
          )}
          {removedColumns.size > 0 && (
            <span>
              <i className="legend-dot removed" />
              columnas recortadas
            </span>
          )}
          {addedColumns.size > 0 && (
            <span>
              <i className="legend-dot added" />
              columnas agregadas
            </span>
          )}
          {addedRowCount > 0 && (
            <span>
              <i className="legend-dot added" />
              filas agregadas
            </span>
          )}
        </div>
      )}
    </div>
  );
}
