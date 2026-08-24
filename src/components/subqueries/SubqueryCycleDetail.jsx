import React from 'react';
import { subqueryConditionText, subqueryReturnText } from '../../visual/subqueryVisual';
import { ParameterChips } from './ParameterChips';
import { ShortCircuitNote } from './ShortCircuitNote';

const subqueryVerdictText = (summary) =>
  summary.verdict
    ? `Resultado: ${summary.verdict} (${summary.rowCount} ${summary.rowCount === 1 ? 'fila' : 'filas'})`
    : `Retorno: ${subqueryReturnText(summary)}`;

export function SubqueryCycleDetail({ summary }) {
  if (summary.mode !== 'correlated') return null;
  return (
    <div className="subquery-cycle-detail">
      <div>
        <b>Inyección de parámetro</b>
        <ParameterChips summary={summary} />
      </div>
      <div>
        <b>Condición evaluada</b>
        <span>{subqueryConditionText(summary)}</span>
      </div>
      <div>
        <b>Veredicto del ciclo</b>
        <span>{subqueryVerdictText(summary)}</span>
      </div>
      <ShortCircuitNote summary={summary} />
    </div>
  );
}
