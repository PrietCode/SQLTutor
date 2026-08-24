import { buildSubqueryGroups } from './subqueryVisual';

export const SUBQUERY_STEP_TYPE = '↳ SUBCONSULTA';

export const writtenOrderIndex = (sql, step, index) => {
  const upper = sql.toUpperCase();
  const type = step.type === 'SOURCE' ? 'FROM' : step.type;
  const patterns = {
    SELECT: /\bSELECT\b/,
    FROM: /\bFROM\b/,
    SOURCE: /\bJOIN\b/,
    JOIN: /\b(?:INNER|LEFT|RIGHT|FULL)?\s*JOIN\b/,
    WHERE: /\bWHERE\b/,
    'GROUP BY': /\bGROUP\s+BY\b/,
    HAVING: /\bHAVING\b/,
    'ORDER BY': /\bORDER\s+BY\b/,
    UNION: /\bUNION\b/,
    INTERSECT: /\bINTERSECT\b/,
    EXCEPT: /\bEXCEPT\b|\bMINUS\b/,
    LIMIT: /\b(?:LIMIT|OFFSET|FETCH|TOP)\b/,
    VALUES: /\bVALUES\b/,
    SET: /\bSET\b/,
    INSERT: /\bINSERT\b/,
    UPDATE: /\bUPDATE\b/,
    DELETE: /\bDELETE\b/,
    TARGET: /\b(?:INTO|UPDATE|FROM)\b/,
    PARSE: /\b(?:CREATE|ALTER|DROP|TRUNCATE)\b/,
  };
  const match = upper.match(
    patterns[step.type] || patterns[type] || new RegExp(`\\b${type.replace(/\s+/g, '\\s+')}\\b`)
  );
  return (match ? match.index : index * 1000) + index / 100;
};

function subqueryRows(group) {
  const firstSummary = group.summaries[0];
  const matchingSteps =
    group.traced && firstSummary?.id != null
      ? group.steps.filter((step) => step.subqueryTraceId === firstSummary.id)
      : group.steps;
  return matchingSteps.at(-1)?.rows || [];
}

function subqueryStepTitle(parentStep, group, index, total) {
  const suffix = total > 1 ? ` ${index + 1}` : '';
  return group.mode === 'correlated'
    ? `Subconsulta correlacionada${suffix} de ${parentStep.type}`
    : `Subconsulta${suffix} de ${parentStep.type}`;
}

export function buildVisualSteps(execution) {
  if (!execution) return [];
  return execution.steps.flatMap((item, originalIndex) => {
    const mainStep = {
      id: `main-${originalIndex}`,
      kind: 'main',
      item,
      parentStep: item,
      originalIndex,
      orderOffset: 0,
    };
    const groups = buildSubqueryGroups(item.compare);
    return [
      mainStep,
      ...groups.map((group, groupIndex) => {
        const rows = subqueryRows(group);
        return {
          id: `subquery-${originalIndex}-${groupIndex}`,
          kind: 'subquery',
          originalIndex,
          parentStep: item,
          orderOffset: (groupIndex + 1) / 100,
          item: {
            type: SUBQUERY_STEP_TYPE,
            title: subqueryStepTitle(item, group, groupIndex, groups.length),
            detail:
              group.mode === 'correlated'
                ? 'La subconsulta se ejecuta una vez por cada fila externa. Usá las iteraciones para ver qué valor se inyecta y qué devuelve cada ciclo.'
                : 'La subconsulta se ejecuta como recorrido interno y su resultado vuelve a la condición externa.',
            rows,
            count: group.mode === 'correlated' ? group.summaries.length : rows.length,
            accent: 'amber',
            parentType: item.type,
            subqueryGroup: group,
            parentStep: item,
          },
        };
      }),
    ];
  });
}
