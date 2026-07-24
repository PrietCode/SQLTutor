import React from 'react';
import { hasSubqueryTrace, parentConditionText } from '../../visual/subqueryVisual';

export function SubqueryDependencyNote({ step }) {
  if (!hasSubqueryTrace(step)) return null;
  return <div className="subquery-parent-note"><strong>Condición con subconsulta</strong><code>{parentConditionText(step)}</code><p>La condición utiliza una subconsulta. En el siguiente paso se muestra cómo se obtiene su resultado.</p></div>;
}
