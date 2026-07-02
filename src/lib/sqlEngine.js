const clean = (sql) => sql.trim().replace(/;\s*$/, '');
const unquote = (value) => {
  const v = String(value).trim();
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^null$/i.test(v)) return null;
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  return Number.isNaN(Number(v)) ? v : Number(v);
};
const stripAlias = (key) => key.includes('.') ? key.split('.').pop() : key;
const valueOf = (row, token) => {
  const key = token.trim().replace(/[\[\]"`]/g, '');
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase())
    || Object.keys(row).find((k) => stripAlias(k).toLowerCase() === key.toLowerCase());
  return found ? row[found] : unquote(key);
};
const displayRows = (rows) => rows.map((row) => Object.fromEntries(
  Object.entries(row).filter(([key]) => !key.includes('.') || !(stripAlias(key) in row))
));
const findTable = (db, name) => Object.keys(db).find((key) => key.toLowerCase() === name.toLowerCase());
const tableColumns = (rows) => rows.columns || Object.keys(rows[0] || {});
const tableColumnTypes = (rows) => rows.columnTypes || {};
const columnDefinition = (definition) => {
  const match = definition.trim().match(/^(\w+)\s+([A-Za-z]+(?:\s*\([^)]*\))?)/);
  return match ? { name: match[1], type: match[2].replace(/\s+/g, '').toUpperCase() } : { name: definition.trim().split(/\s+/)[0], type: 'UNKNOWN' };
};
const rememberColumns = (rows, columns, columnTypes = {}) => { rows.columns = columns; rows.columnTypes = columnTypes; return rows; };
const qualify = (row, alias) => Object.fromEntries([
  ...Object.entries(row), ...Object.entries(row).map(([key, value]) => [`${alias}.${key}`, value])
]);

function splitLogic(expression, operator) {
  let depth = 0; let quoted = false;
  const upper = expression.toUpperCase();
  for (let i = 0; i < upper.length; i += 1) {
    if (expression[i] === "'") quoted = !quoted;
    if (quoted) continue;
    if (expression[i] === '(') depth += 1;
    if (expression[i] === ')') depth -= 1;
    const word = ` ${operator} `;
    if (depth === 0 && upper.slice(i, i + word.length) === word) {
      if (operator === 'AND' && /BETWEEN\s+[^\s]+$/i.test(expression.slice(0, i))) continue;
      return [expression.slice(0, i), expression.slice(i + word.length)];
    }
  }
  return null;
}

function testCondition(row, raw) {
  let expr = raw.trim();
  while (expr.startsWith('(') && expr.endsWith(')')) expr = expr.slice(1, -1).trim();
  const or = splitLogic(expr, 'OR');
  if (or) return testCondition(row, or[0]) || testCondition(row, or[1]);
  const and = splitLogic(expr, 'AND');
  if (and) return testCondition(row, and[0]) && testCondition(row, and[1]);
  if (/^NOT\s+/i.test(expr)) return !testCondition(row, expr.replace(/^NOT\s+/i, ''));

  let match = expr.match(/^(.+?)\s+IS\s+(NOT\s+)?NULL$/i);
  if (match) return match[2] ? valueOf(row, match[1]) != null : valueOf(row, match[1]) == null;
  match = expr.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
  if (match) { const v = valueOf(row, match[1]); return v >= unquote(match[2]) && v <= unquote(match[3]); }
  match = expr.match(/^(.+?)\s+(NOT\s+)?IN\s*\((.+)\)$/i);
  if (match) {
    const values = match[3].split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map(unquote);
    const has = values.some((item) => item === valueOf(row, match[1]));
    return match[2] ? !has : has;
  }
  match = expr.match(/^(.+?)\s+(NOT\s+)?LIKE\s+(.+)$/i);
  if (match) {
    const pattern = String(unquote(match[3])).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
    const has = new RegExp(`^${pattern}$`, 'i').test(String(valueOf(row, match[1]) ?? ''));
    return match[2] ? !has : has;
  }
  match = expr.match(/^(.+?)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/);
  if (!match) throw new Error(`No pude interpretar la condicion: ${expr}`);
  const left = valueOf(row, match[1]); const right = valueOf(row, match[3]);
  return ({ '=': left === right, '!=': left !== right, '<>': left !== right, '>': left > right, '<': left < right, '>=': left >= right, '<=': left <= right })[match[2]];
}

function splitComma(text) {
  const result = []; let current = ''; let depth = 0; let quoted = false;
  for (const char of text) {
    if (char === "'") quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth -= 1;
    if (char === ',' && depth === 0 && !quoted) { result.push(current.trim()); current = ''; } else current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function clause(sql, name, stops) {
  const stop = stops.length ? `(?=\\s+(?:${stops.join('|')})\\b|$)` : '$';
  return sql.match(new RegExp(`\\b${name}\\s+([\\s\\S]*?)${stop}`, 'i'))?.[1]?.trim();
}

function aggregateValue(expression, rows) {
  const match = expression.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\((.*?)\)$/i);
  if (!match) return valueOf(rows[0] || {}, expression);
  const fn = match[1].toUpperCase();
  const values = match[2] === '*' ? rows : rows.map((row) => valueOf(row, match[2])).filter((v) => v != null);
  if (fn === 'COUNT') return values.length;
  if (!values.length) return null;
  if (fn === 'SUM') return values.reduce((a, b) => a + Number(b), 0);
  if (fn === 'AVG') return values.reduce((a, b) => a + Number(b), 0) / values.length;
  if (fn === 'MIN') return values.reduce((a, b) => a < b ? a : b);
  return values.reduce((a, b) => a > b ? a : b);
}

function calculate(expression, rows) {
  const expr = expression.trim();
  if (/^CURRENT_DATE(?:\(\))?$/i.test(expr)) return new Date().toISOString().slice(0, 10);
  if (/^CURRENT_TIMESTAMP(?:\(\))?$/i.test(expr)) return new Date().toISOString();
  const round = expr.match(/^ROUND\s*\((.*),\s*(\d+)\)$/i);
  if (round) {
    const value = calculate(round[1], rows);
    return value == null ? null : Number(Number(value).toFixed(Number(round[2])));
  }
  const lower = expr.match(/^(LOWER|UPPER)\s*\((.+)\)$/i);
  if (lower) return String(valueOf(rows[0], lower[2]))[lower[1].toUpperCase() === 'LOWER' ? 'toLowerCase' : 'toUpperCase']();
  const concat = expr.match(/^CONCAT\s*\((.*)\)$/i);
  if (concat) return splitComma(concat[1]).map((item) => calculate(item, rows) ?? '').join('');
  const substring = expr.match(/^SUBSTRING\s*\((.*)\)$/i);
  if (substring) {
    const [value, start, length] = splitComma(substring[1]).map((item) => calculate(item, rows));
    return String(value ?? '').substring(Number(start) - 1, Number(start) - 1 + Number(length));
  }
  const coalesce = expr.match(/^COALESCE\s*\((.*)\)$/i);
  if (coalesce) {
    for (const item of splitComma(coalesce[1])) {
      const value = calculate(item, rows);
      if (value != null) return value;
    }
    return null;
  }
  return aggregateValue(expr, rows);
}

function project(groups, selectText) {
  const fields = splitComma(selectText);
  if (fields.length === 1 && fields[0] === '*') return groups.flatMap((g) => displayRows(g.rows));
  return groups.map(({ rows }) => Object.fromEntries(fields.map((field) => {
    const aliasMatch = field.match(/^(.*?)\s+(?:AS\s+)?([A-Za-z_]\w*)$/i);
    const expression = (aliasMatch ? aliasMatch[1] : field).trim();
    const alias = aliasMatch ? aliasMatch[2] : stripAlias(expression).replace(/\W+/g, '_');
    return [alias, calculate(expression, rows)];
  })));
}

const step = (type, title, detail, rows, accent = 'blue', compare = null) => ({ type, title, detail, rows: displayRows(rows).slice(0, 12), count: rows.length, accent, compare });

function executeSelect(sql, db) {
  const selectText = clause(sql, 'SELECT', ['FROM']);
  const fromText = clause(sql, 'FROM', ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'OFFSET', 'LIMIT']);
  if (!selectText || !fromText) throw new Error('Una consulta SELECT necesita las clausulas SELECT y FROM.');
  const baseMatch = fromText.match(/^(\w+)(?:\s+(?:AS\s+)?(\w+))?/i);
  const baseName = findTable(db, baseMatch[1]);
  if (!baseName) throw new Error(`La tabla "${baseMatch[1]}" no existe en este sandbox.`);
  const baseAlias = baseMatch[2] || baseName;
  let rows = db[baseName].map((row) => qualify(row, baseAlias));
  const steps = [step('FROM', `Leer ${baseName}`, `${rows.length} filas entran al flujo desde la tabla original.`, db[baseName], 'violet')];

  const joinRegex = /\b(?:(INNER|LEFT|RIGHT|FULL)\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+([\s\S]*?)(?=\s+(?:INNER|LEFT|RIGHT|FULL)?\s*JOIN\b|\s+WHERE\b|\s+GROUP\s+BY\b|\s+HAVING\b|\s+ORDER\s+BY\b|$)/gi;
  let join;
  while ((join = joinRegex.exec(sql))) {
    const kind = (join[1] || 'INNER').toUpperCase(); const tableName = findTable(db, join[2]);
    if (!tableName) throw new Error(`La tabla "${join[2]}" no existe.`);
    const alias = join[3] || tableName; const rightRows = db[tableName].map((r) => qualify(r, alias));
    const beforeJoin = rows;
    const combined = [];
    rows.forEach((left) => {
      const matches = rightRows.filter((right) => testCondition({ ...left, ...right }, join[4]));
      if (matches.length) matches.forEach((right) => combined.push({ ...left, ...right }));
      else if (kind === 'LEFT' || kind === 'FULL') combined.push({ ...left, ...Object.fromEntries(Object.keys(rightRows[0] || {}).map((k) => [k, null])) });
    });
    if (kind === 'RIGHT' || kind === 'FULL') rightRows.forEach((right) => {
      if (!rows.some((left) => testCondition({ ...left, ...right }, join[4]))) combined.push(right);
    });
    rows = combined;
    const beforeColumns = new Set(displayRows(beforeJoin).flatMap((row) => Object.keys(row)));
    const addedColumns = [...new Set(displayRows(rows).flatMap((row) => Object.keys(row)).filter((column) => !beforeColumns.has(column)))];
    steps.push(step('SOURCE', `Leer ${tableName}`, `${rightRows.length} filas entran desde la tabla relacionada.`, db[tableName], 'violet'));
    steps.push(step('JOIN', `${kind} JOIN con ${tableName}`, `Se comparan las claves de ambas tablas mediante ${join[4]}. Las columnas nuevas se resaltan en verde.`, rows, 'cyan', { kind: 'join', addedColumns }));
  }

  const whereText = clause(sql, 'WHERE', ['GROUP BY', 'HAVING', 'ORDER BY', 'OFFSET', 'LIMIT']);
  if (whereText) {
    const beforeRows = rows; const before = rows.length; rows = rows.filter((row) => testCondition(row, whereText));
    steps.push(step('WHERE', 'Filtrar filas', `${whereText}. Se conservan ${rows.length} de ${before} filas. Las filas descartadas se muestran en rojo.`, rows, 'amber', { kind: 'filter', beforeRows: displayRows(beforeRows).slice(0, 12) }));
  }
  const groupText = clause(sql, 'GROUP BY', ['HAVING', 'ORDER BY', 'OFFSET', 'LIMIT']);
  let groups = [{ key: 'all', rows }];
  if (groupText) {
    const keys = splitComma(groupText);
    const map = new Map();
    rows.forEach((row) => { const key = JSON.stringify(keys.map((k) => valueOf(row, k))); if (!map.has(key)) map.set(key, []); map.get(key).push(row); });
    groups = [...map.entries()].map(([key, groupedRows]) => ({ key, rows: groupedRows }));
    steps.push(step('GROUP BY', 'Formar grupos', `${groupText} genera ${groups.length} grupos para calcular agregados.`, groups.map((g) => ({
      grupo: JSON.parse(g.key).join(' / '),
      filas: g.rows.length,
      muestra: g.rows.slice(0, 3).map((row) => JSON.stringify(displayRows([row])[0])).join(' | ')
    })), 'green'));
  } else if (!/(COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(selectText)) groups = rows.map((row, i) => ({ key: i, rows: [row] }));

  const havingText = clause(sql, 'HAVING', ['ORDER BY', 'OFFSET', 'LIMIT']);
  if (havingText) {
    const before = groups.length;
    groups = groups.filter((group) => {
      const expanded = havingText.replace(/(COUNT|SUM|AVG|MIN|MAX)\s*\((.*?)\)/gi, (m) => String(aggregateValue(m, group.rows)));
      return testCondition(group.rows[0] || {}, expanded);
    });
    steps.push(step('HAVING', 'Filtrar grupos', `${havingText}. Se conservan ${groups.length} de ${before} grupos.`, groups.map((g) => ({ grupo: g.key, filas: g.rows.length })), 'orange'));
  }

  let result = project(groups, selectText.replace(/^TOP\s+\d+\s+/i, ''));
  steps.push(step('SELECT', 'Proyectar columnas', `Solo permanecen: ${selectText}.`, result, 'blue'));
  const orderText = clause(sql, 'ORDER BY', ['OFFSET', 'LIMIT']);
  if (orderText) {
    const fields = splitComma(orderText).map((item) => { const m = item.match(/^(.*?)(?:\s+(ASC|DESC))?$/i); return { key: m[1].trim(), dir: (m[2] || 'ASC').toUpperCase() }; });
    result = [...result].sort((a, b) => { for (const f of fields) { const av = valueOf(a, f.key); const bv = valueOf(b, f.key); if (av < bv) return f.dir === 'ASC' ? -1 : 1; if (av > bv) return f.dir === 'ASC' ? 1 : -1; } return 0; });
    steps.push(step('ORDER BY', 'Ordenar resultado', `${orderText} define la secuencia final.`, result, 'pink'));
  }
  const top = sql.match(/^\s*SELECT\s+TOP\s+(\d+)/i)?.[1];
  const limitMatch = sql.match(/\bLIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
  const offsetFetch = sql.match(/\bOFFSET\s+(\d+)\s+ROWS?(?:\s+FETCH\s+(?:FIRST|NEXT)\s+(\d+)\s+ROWS?\s+ONLY)?/i);
  const offset = Number(limitMatch?.[2] || offsetFetch?.[1] || 0);
  const take = top || limitMatch?.[1] || offsetFetch?.[2];
  if (offset || take) {
    result = result.slice(offset, take ? offset + Number(take) : undefined);
    steps.push(step('LIMIT', 'Paginar filas', `Se omiten ${offset} filas y se muestran ${take || 'las restantes'}. SQL Server usa OFFSET/FETCH.`, result, 'slate'));
  }
  return { result, steps, statement: 'SELECT', message: `${result.length} filas devueltas` };
}

function executeMutation(sql, db) {
  const next = structuredClone(db); let match;
  if ((match = sql.match(/^INSERT\s+INTO\s+(\w+)\s*\((.*?)\)\s*VALUES\s*\((.*?)\)$/is))) {
    const table = findTable(next, match[1]); if (!table) throw new Error(`La tabla "${match[1]}" no existe.`);
    const row = Object.fromEntries(splitComma(match[2]).map((key, i) => [key.trim(), unquote(splitComma(match[3])[i])]));
    next[table].columns = [...new Set([...tableColumns(next[table]), ...Object.keys(row)])];
    next[table].columnTypes = tableColumnTypes(next[table]);
    next[table].push(row); return { db: next, result: [row], statement: 'INSERT', message: '1 fila insertada', steps: [step('TARGET', `Abrir ${table}`, 'La tabla destino se prepara para recibir una fila.', db[table], 'violet'), step('VALUES', 'Construir nueva fila', 'VALUES asigna cada dato a la columna correspondiente.', [row], 'amber'), step('INSERT', 'Insertar fila', 'El cambio vive solo durante esta sesion.', next[table], 'green')] };
  }
  if ((match = sql.match(/^UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:\s+WHERE\s+([\s\S]+))?$/i))) {
    const table = findTable(next, match[1]); if (!table) throw new Error(`La tabla "${match[1]}" no existe.`);
    const assignments = splitComma(match[2]).map((item) => item.match(/^(\w+)\s*=\s*(.+)$/)).filter(Boolean);
    const affected = [];
    const columns = [...new Set([...tableColumns(next[table]), ...assignments.map((a) => a[1])])];
    next[table] = rememberColumns(next[table].map((row) => { if (match[3] && !testCondition(row, match[3])) return row; const changed = { ...row }; assignments.forEach((a) => { changed[a[1]] = unquote(a[2]); }); affected.push(changed); return changed; }), columns, tableColumnTypes(next[table]));
    return { db: next, result: affected, statement: 'UPDATE', message: `${affected.length} filas actualizadas`, steps: [step('WHERE', 'Localizar filas', match[3] || 'Sin WHERE: se seleccionan todas las filas.', affected, 'amber'), step('SET', 'Aplicar cambios', match[2], affected, 'blue'), step('UPDATE', 'Tabla actualizada', 'El cambio no sale de este sandbox.', next[table], 'green')] };
  }
  if ((match = sql.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+))?$/i))) {
    const table = findTable(next, match[1]); if (!table) throw new Error(`La tabla "${match[1]}" no existe.`);
    const columns = tableColumns(next[table]);
    const removed = next[table].filter((r) => !match[2] || testCondition(r, match[2])); next[table] = rememberColumns(next[table].filter((r) => match[2] && !testCondition(r, match[2])), columns, tableColumnTypes(next[table]));
    return { db: next, result: next[table], statement: 'DELETE', message: `${removed.length} filas eliminadas`, steps: [step('WHERE', 'Identificar filas', match[2] || 'Sin WHERE: todas las filas.', removed, 'amber'), step('DELETE', 'Eliminar seleccionadas', 'La tabla conserva las filas no coincidentes.', next[table], 'red')] };
  }
  throw new Error('Esta sentencia de modificacion aun no esta soportada. Prueba INSERT, UPDATE o DELETE simples.');
}

function executeDdl(sql, db) {
  const command = sql.match(/^(CREATE\s+(?:TABLE|VIEW|INDEX)|ALTER\s+TABLE|DROP\s+TABLE|TRUNCATE\s+TABLE)/i)?.[1]?.toUpperCase();
  if (!command) return null;
  const next = structuredClone(db);
  let match;
  let target = 'objeto';
  let detail = 'La instruccion se valida y se explica dentro del sandbox.';
  if ((match = sql.match(/^CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]+)\)$/i))) {
    target = match[1];
    if (findTable(next, target)) throw new Error(`La tabla "${target}" ya existe.`);
    const definitions = splitComma(match[2]).map(columnDefinition);
    const columns = definitions.map((definition) => definition.name);
    const columnTypes = Object.fromEntries(definitions.map((definition) => [definition.name, definition.type]));
    next[target] = rememberColumns([], columns, columnTypes);
    detail = `Se crea la tabla temporal con columnas: ${columns.join(', ')}.`;
  } else if ((match = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)(?:\s+[\w()]+)?(?:\s+DEFAULT\s+(.+))?$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    const initial = match[3] == null ? null : unquote(match[3]);
    const typeMatch = sql.match(/^ALTER\s+TABLE\s+\w+\s+ADD\s+(?:COLUMN\s+)?\w+\s+([\w]+(?:\([^)]*\))?)/i);
    next[target] = rememberColumns(next[target].map((row) => ({ ...row, [match[2]]: initial })), [...new Set([...tableColumns(next[target]), match[2]])], { ...tableColumnTypes(next[target]), [match[2]]: typeMatch?.[1]?.toUpperCase() || 'UNKNOWN' });
    detail = `La columna ${match[2]} se agrega a todas las filas.`;
  } else if ((match = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    next[target] = rememberColumns(next[target].map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key.toLowerCase() !== match[2].toLowerCase()))), tableColumns(next[target]).filter((key) => key.toLowerCase() !== match[2].toLowerCase()), Object.fromEntries(Object.entries(tableColumnTypes(next[target])).filter(([key]) => key.toLowerCase() !== match[2].toLowerCase())));
    detail = `La columna ${match[2]} se elimina del esquema temporal.`;
  } else if ((match = sql.match(/^DROP\s+TABLE\s+(\w+)$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    delete next[target];
    detail = 'La tabla se elimina del sandbox hasta reiniciar.';
  } else if ((match = sql.match(/^TRUNCATE\s+TABLE\s+(\w+)$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    next[target] = rememberColumns([], tableColumns(next[target]), tableColumnTypes(next[target]));
    detail = 'Todas las filas se eliminan sin borrar la tabla.';
  } else if ((match = sql.match(/^CREATE\s+VIEW\s+(\w+)\s+AS\s+(SELECT[\s\S]+)$/i))) {
    target = match[1];
    const viewResult = executeSelect(match[2], next).result;
    next[target] = viewResult;
    detail = `La vista del sandbox contiene ${viewResult.length} filas.`;
  } else if ((match = sql.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)$/i))) {
    target = match[1];
    if (!findTable(next, match[2])) throw new Error(`La tabla "${match[2]}" no existe.`);
    detail = `El indice sobre ${match[2]} (${match[3]}) se explica; los arrays en memoria no requieren un indice fisico.`;
  } else {
    throw new Error(`La variante de ${command} no esta soportada. Usa la sintaxis mostrada en los ejemplos.`);
  }
  const rows = [{ instruccion: command, objeto: target, estado: 'Aplicado al sandbox' }];
  return { db: next, result: rows, statement: command, message: `${command} procesado`, steps: [step('PARSE', 'Validar definicion', 'Se identifican el comando, el objeto y sus opciones.', rows, 'violet'), step(command, `${command}: ${target}`, detail, rows, 'blue')] };
}

export function executeSql(input, database) {
  const sql = clean(input);
  if (!sql) throw new Error('Escribe una consulta antes de ejecutar.');
  if (/^SELECT\b/i.test(sql)) return { ...executeSelect(sql, database), db: database };
  if (/^(INSERT|UPDATE|DELETE)\b/i.test(sql)) return executeMutation(sql, database);
  const ddl = executeDdl(sql, database);
  if (ddl) return ddl;
  throw new Error('Comando no reconocido. Usa SELECT, INSERT, UPDATE, DELETE o una sentencia DDL basica.');
}
