import React from 'react';

export function JoinKeyNote({ compare }) {
  const keys = compare?.joinKeys || [];
  if (!keys.length) return null;
  const pairs = keys.map((key) => `[${key.left}] y [${key.right}]`).join(', ');
  return (
    <div className="join-note">
      <strong>Punto de unión</strong>
      <p>
        FROM arma primero el producto cartesiano candidato; ON conserva solo los pares donde {pairs}{' '}
        cumplen la relación PK = FK.
      </p>
      {compare.outerVirtualRows?.length > 0 && (
        <p>
          Como es un OUTER JOIN, las filas sin pareja no se pierden: se completa el lado faltante
          con <code>NULL</code>.
        </p>
      )}
      {compare.selectAll && (
        <p>
          Con <code>SELECT *</code> ambas columnas pertenecen a tablas distintas aunque tengan el
          mismo valor; si hay ambigüedad, cualificalas como <code>{keys[0].left}</code>.
        </p>
      )}
    </div>
  );
}
