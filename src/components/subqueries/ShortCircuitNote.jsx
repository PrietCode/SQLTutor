import React from 'react';

export function ShortCircuitNote({ summary }) {
  if (!/EXISTS/i.test(summary.operator || '')) return null;
  return (
    <div className="subquery-short-circuit">
      <b>Ciclo Corto de EXISTS</b>
      <span>
        El motor se detiene apenas encuentra una fila interna que cumple la condición. No evalúa el
        contenido de esa fila: solo necesita saber si existe al menos una coincidencia.
      </span>
    </div>
  );
}
