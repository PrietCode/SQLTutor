import React from 'react';
import { formatSubqueryValue } from '../../visual/subqueryVisual';

export function ParameterChips({ summary }) {
  if (!summary.parameters?.length) return <span>Parámetro: sin referencia externa detectada</span>;
  return <div className="subquery-keyline"><span>Llave de correlación</span>{summary.parameters.map((param) => <code className="external-key" key={param.name}>{param.name} = {formatSubqueryValue(param.value)}</code>)}</div>;
}
