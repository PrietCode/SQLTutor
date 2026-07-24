const subqueryGroupKey = (summary, index) => summary.mode === 'correlated'
  ? `correlated|${summary.operator}|${summary.innerSql || summary.innerCondition || ''}`
  : `plain|${summary.id ?? index}`;

export const hasSubqueryTrace = (step) => Boolean(step?.compare?.subquerySteps?.length);

export function buildSubqueryGroups(compare) {
  const steps = compare?.subquerySteps || [];
  if (!steps.length) return [];
  const summaries = compare.subqueryResults?.length ? compare.subqueryResults : [{ id: 'legacy', mode: 'uncorrelated', operator: 'SUBCONSULTA', rowCount: steps.at(-1)?.count || 0, values: [] }];
  const traced = steps.some((step) => step.subqueryTraceId != null);
  const groups = [];
  const byKey = new Map();
  summaries.forEach((summary, index) => {
    const key = subqueryGroupKey(summary, index);
    if (!byKey.has(key)) {
      const group = { key, summaries: [], steps, traced, externalRows: compare.beforeRows || [], mode: summary.mode, order: groups.length };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).summaries.push(summary);
  });
  return groups;
}

export function hideSubquerySql(condition) {
  let output = '';
  for (let index = 0; index < condition.length; index += 1) {
    const char = condition[index];
    if (char === "'") {
      let end = index + 1;
      while (end < condition.length) {
        if (condition[end] === "'" && condition[end + 1] === "'") { end += 2; continue; }
        if (condition[end] === "'") { end += 1; break; }
        end += 1;
      }
      output += condition.slice(index, end);
      index = end - 1;
      continue;
    }
    if (char === '(' && /^\s*SELECT\b/i.test(condition.slice(index + 1))) {
      let depth = 0; let quoted = false; let end = index;
      for (; end < condition.length; end += 1) {
        const current = condition[end];
        if (current === "'" && condition[end + 1] === "'") { end += 1; continue; }
        if (current === "'") { quoted = !quoted; continue; }
        if (quoted) continue;
        if (current === '(') depth += 1;
        if (current === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      output += '(resultado de la subconsulta)';
      index = end;
      continue;
    }
    output += char;
  }
  return output;
}

export const parentConditionText = (step) => hideSubquerySql((step.detail || '').split(/\.\s+Se conservan/i)[0]);

export const parentStepDetail = (step) => {
  if (!hasSubqueryTrace(step)) return step.detail;
  const countText = (step.detail || '').match(/Se conservan[\s\S]*$/i)?.[0] || '';
  return `${parentConditionText(step)}. ${countText}`.trim();
};

export const formatSubqueryValue = (value) => value == null ? 'NULL' : typeof value === 'string' ? `'${value}'` : String(value);

export const conditionWithValues = (summary, condition) => {
  if (!summary.conditionValues?.length) return condition;
  const values = new Map(summary.conditionValues.map((item) => [item.name.toLowerCase(), item.value]));
  return condition.replace(/\b[A-Za-z_]\w*\.[A-Za-z_]\w*\b/g, (identifier) => values.has(identifier.toLowerCase()) ? `${identifier} (${formatSubqueryValue(values.get(identifier.toLowerCase()))})` : identifier);
};

export const subqueryReturnText = (summary) => {
  if (/EXISTS/i.test(summary.operator || '')) return `${summary.operator}: ${summary.verdict || (summary.rowCount > 0 ? 'TRUE' : 'FALSE')} (${summary.rowCount} filas)`;
  if (!summary.values?.length) return 'conjunto vacío';
  const values = summary.values.map(formatSubqueryValue).join(', ');
  return summary.rowCount === 1 ? `valor ${values}` : `conjunto { ${values}${summary.rowCount > summary.values.length ? ', ...' : ''} }`;
};

export const subqueryConditionText = (summary) => {
  const inner = summary.innerCondition || 'la condición interna';
  const annotatedInner = conditionWithValues(summary, inner);
  if (/EXISTS/i.test(summary.operator || '')) return `¿Existe alguna fila que cumpla ${annotatedInner}?`;
  if (/ANY|SOME|ALL/i.test(summary.operator || '')) return `Se compara el valor externo contra el conjunto devuelto por la subconsulta usando ${summary.operator}.`;
  if (/IN/i.test(summary.operator || '')) return `Se verifica pertenencia contra la columna devuelta por la subconsulta.`;
  return `Se evalúa ${summary.evaluatedCondition || annotatedInner}.`;
};
