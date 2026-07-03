const stripSqlComments = (sql) => {
  let result = ''; let quoted = false; let lineComment = false; let blockComment = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]; const next = sql[i + 1];
    if (lineComment) { if (char === '\n') { lineComment = false; result += char; } continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (!quoted && char === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (!quoted && char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === "'" && next === "'") { result += char + next; i += 1; continue; }
    if (char === "'") quoted = !quoted;
    result += char;
  }
  return result;
};

export function splitSqlStatements(input) {
  const sql = stripSqlComments(input).replace(/^\s*GO\s*$/gim, ';');
  const statements = []; let current = ''; let quoted = false;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i]; const next = sql[i + 1];
    if (char === "'" && next === "'") { current += char + next; i += 1; continue; }
    if (char === "'") quoted = !quoted;
    if (!quoted && char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const firstStatement = (sql) => {
  const statements = splitSqlStatements(sql);
  if (statements.length) return statements[0];
  let quoted = false;
  for (let i = 0; i < sql.length; i += 1) {
    if (sql[i] === "'" && sql[i + 1] === "'") { i += 1; continue; }
    if (sql[i] === "'") quoted = !quoted;
    if (!quoted && sql[i] === ';') return sql.slice(0, i).trim();
  }
  return sql.trim();
};
const clean = (sql) => firstStatement(sql).replace(/;\s*$/, '');
const unquote = (value) => {
  const v = String(value).trim();
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
  if (/^null$/i.test(v)) return null;
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  return Number.isNaN(Number(v)) ? v : Number(v);
};
const parseSqlDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  if (typeof value !== 'string') return null;
  const v = value.trim();
  let match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  let year; let month; let day;
  if (match) {
    [, year, month, day] = match.map(Number);
  } else {
    match = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return null;
    const first = Number(match[1]); const second = Number(match[2]);
    year = Number(match[3]);
    if (year < 100) year += 2000;
    if (first > 12) { day = first; month = second; }
    else if (second > 12) { month = first; day = second; }
    else { day = first; month = second; }
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? timestamp : null;
};
const compareSqlValues = (left, right) => {
  const leftDate = parseSqlDate(left); const rightDate = parseSqlDate(right);
  const a = leftDate != null && rightDate != null ? leftDate : left;
  const b = leftDate != null && rightDate != null ? rightDate : right;
  if (a === b) return 0;
  return a < b ? -1 : 1;
};
const stripAlias = (key) => key.includes('.') ? key.split('.').pop() : key;
const normalizeIdentifier = (value) => value.trim().replace(/[\[\]"`]/g, '');
const isLiteral = (value) => /^'.*'$/.test(value) || /^null$/i.test(value) || /^(true|false)$/i.test(value) || !Number.isNaN(Number(value));
const valueOf = (row, token) => {
  const key = normalizeIdentifier(token);
  if (isLiteral(key)) return unquote(key);
  const keys = Object.keys(row).filter((item) => !item.startsWith('__'));
  const qualified = key.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
  if (qualified) {
    const [, alias, column] = qualified;
    const found = keys.find((k) => k.toLowerCase() === `${alias}.${column}`.toLowerCase());
    if (found) return row[found];
    const aliasExists = keys.some((k) => k.includes('.') && k.split('.')[0].toLowerCase() === alias.toLowerCase());
    if (!aliasExists) throw new Error(`No se reconoce el identificador de tabla o alias "${alias}".`);
    throw new Error(`No se reconoce la columna "${key}".`);
  }
  const sourceMatches = keys.filter((k) => k.includes('.') && stripAlias(k).toLowerCase() === key.toLowerCase());
  const sourceAliases = [...new Set(sourceMatches.map((k) => k.split('.')[0].toLowerCase()))];
  if (sourceAliases.length > 1) throw new Error(`Nombre de columna ambiguo "${key}".`);
  if (sourceMatches.length === 1) return row[sourceMatches[0]];
  const found = keys.find((k) => k.toLowerCase() === key.toLowerCase());
  if (found) return row[found];
  throw new Error(`No se reconoce la columna "${key}".`);
};
const displayRows = (rows) => rows.map((row) => {
  const qualifiedCounts = Object.keys(row).filter((key) => key.includes('.')).reduce((acc, key) => {
    const column = stripAlias(key).toLowerCase();
    acc[column] = (acc[column] || 0) + 1;
    return acc;
  }, {});
  return Object.fromEntries(Object.entries(row).filter(([key]) => {
    if (key.startsWith('__')) return false;
    const column = stripAlias(key).toLowerCase();
    if (!key.includes('.')) return (qualifiedCounts[column] || 0) <= 1;
    return qualifiedCounts[column] > 1 || !Object.keys(row).some((item) => !item.includes('.') && item.toLowerCase() === column);
  }));
});
const rowSignature = (row) => JSON.stringify(Object.entries(row).filter(([key]) => !key.startsWith('__')).sort(([a], [b]) => a.localeCompare(b)));
const findTable = (db, name) => Object.keys(db).find((key) => key.toLowerCase() === name.toLowerCase());
const tableColumns = (rows) => rows.columns || Object.keys(rows[0] || {});
const tableColumnTypes = (rows) => rows.columnTypes || {};
const tableConstraints = (rows) => rows.constraints || [];
const columnName = (rows, name) => tableColumns(rows).find((key) => key.toLowerCase() === name.toLowerCase());
const requireColumn = (rows, table, name) => {
  const found = columnName(rows, name);
  if (!found) throw new Error(`La columna "${name}" no existe en la tabla "${table}".`);
  return found;
};
const constraintDefinition = (definition) => {
  const normalized = definition.trim().replace(/^CONSTRAINT\s+\w+\s+/i, '');
  let match = normalized.match(/^FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(\w+)\s*\(([^)]+)\)/i);
  if (match) return { type: 'FOREIGN KEY', columns: splitComma(match[1]), references: { table: match[2], columns: splitComma(match[3]) } };
  match = normalized.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  if (match) return { type: 'PRIMARY KEY', columns: splitComma(match[1]) };
  match = normalized.match(/^UNIQUE\s*\(([^)]+)\)/i);
  if (match) return { type: 'UNIQUE', columns: splitComma(match[1]) };
  if (/^CHECK\s*\(/i.test(normalized)) return { type: 'CHECK', expression: normalized };
  return null;
};
const columnDefinition = (definition) => {
  if (constraintDefinition(definition)) return null;
  const match = definition.trim().match(/^(\w+)\s+([A-Za-z]+(?:\s*\([^)]*\))?)/);
  if (!match) return null;
  const constraints = [];
  const inlineReference = definition.match(/\bREFERENCES\s+(\w+)\s*\(([^)]+)\)/i);
  if (inlineReference) constraints.push({ type: 'FOREIGN KEY', columns: [match[1]], references: { table: inlineReference[1], columns: splitComma(inlineReference[2]) } });
  if (/\bPRIMARY\s+KEY\b/i.test(definition)) constraints.push({ type: 'PRIMARY KEY', columns: [match[1]] });
  return { name: match[1], type: match[2].replace(/\s+/g, '').toUpperCase(), constraint: constraints };
};
const rememberColumns = (rows, columns, columnTypes = {}, constraints = []) => { rows.columns = columns; rows.columnTypes = columnTypes; rows.constraints = constraints; return rows; };
const qualify = (row, alias) => Object.fromEntries([
  ...Object.entries(row), ...Object.entries(row).map(([key, value]) => [`${alias}.${key}`, value])
]);

const columnValue = (row, column) => {
  const found = Object.keys(row).find((key) => key.toLowerCase() === column.toLowerCase());
  return found ? row[found] : undefined;
};

const generatedConstraintName = (prefix, table, columns, refTable = '') => {
  const tableUpper = table.toUpperCase();
  let hash = 2166136261;
  for (const c of `${tableUpper}${refTable.toUpperCase()}${columns.join('').toUpperCase()}`) {
    hash = (hash ^ c.charCodeAt(0)) * 16777619;
    hash = hash >>> 0;
  }
  const objId = hash.toString(16).toUpperCase().padStart(8, '0');
  return prefix === 'PK' ? `PK__${tableUpper}__${objId}${objId}` : `FK__${tableUpper}__${columns.join('_')}__${objId}`;
};

const primaryKeyError = (table, columns, values) => {
  const constraintName = generatedConstraintName('PK', table, columns);
  return new Error(`Infraccion de la restriccion PRIMARY KEY '${constraintName}'. No se puede insertar una clave duplicada en el objeto 'dbo.${table.toUpperCase()}'. El valor de la clave duplicada es (${values.join(', ')}).`);
};

const primaryKeyNullError = (table, column) => new Error(`No se permite insertar un valor NULL en la columna '${column}', tabla 'dbo.${table.toUpperCase()}'. La instruccion termino.`);

const foreignKeyError = (table, refTable, columns) => {
  const constraintName = generatedConstraintName('FK', table, columns, refTable);
  return new Error(`La instruccion entro en conflicto con la restriccion FOREIGN KEY '${constraintName}'. El conflicto ocurrio en la tabla 'dbo.${table.toUpperCase()}'.`);
};

const sameColumns = (left, right) => left.length === right.length && left.every((column, index) => column.toLowerCase() === right[index].toLowerCase());

function referencedKeyExists(db, refTable, refColumns) {
  const constraints = tableConstraints(db[refTable]);
  return constraints.some((constraint) => ['PRIMARY KEY', 'UNIQUE'].includes(constraint.type) && sameColumns(constraint.columns, refColumns));
}

function validateConstraintDefinitions(db, table) {
  const rows = db[table];
  for (const constraint of tableConstraints(rows)) {
    if (constraint.columns) constraint.columns.forEach((column) => requireColumn(rows, table, column));
    if (constraint.type === 'FOREIGN KEY') {
      const refTable = findTable(db, constraint.references.table);
      if (!refTable) throw new Error(`La tabla referenciada "${constraint.references.table}" no existe.`);
      constraint.references.columns.forEach((column) => requireColumn(db[refTable], refTable, column));
      if (!referencedKeyExists(db, refTable, constraint.references.columns)) throw new Error(`La clave foranea en "${table}" debe referenciar una PRIMARY KEY o UNIQUE existente.`);
    }
  }
}

function validateTableIntegrity(db, table) {
  const rows = db[table];
  validateConstraintDefinitions(db, table);
  for (const pk of tableConstraints(rows).filter((constraint) => constraint.type === 'PRIMARY KEY')) {
    const seen = new Map();
    for (const row of rows) {
      const values = pk.columns.map((column) => columnValue(row, column));
      const nullIndex = values.findIndex((value) => value === null || value === undefined);
      if (nullIndex !== -1) throw primaryKeyNullError(table, pk.columns[nullIndex]);
      const signature = JSON.stringify(values);
      if (seen.has(signature)) throw primaryKeyError(table, pk.columns, values);
      seen.set(signature, true);
    }
  }
  for (const fk of tableConstraints(rows).filter((constraint) => constraint.type === 'FOREIGN KEY')) {
    const refTable = findTable(db, fk.references.table);
    for (const row of rows) {
      const values = fk.columns.map((column) => columnValue(row, column));
      if (values.some((value) => value === null || value === undefined)) continue;
      const exists = db[refTable].some((refRow) => fk.references.columns.every((refColumn, index) => columnValue(refRow, refColumn) === values[index]));
      if (!exists) throw foreignKeyError(table, refTable, fk.columns);
    }
  }
}

function validateDatabaseIntegrity(db) {
  Object.keys(db).forEach((table) => validateTableIntegrity(db, table));
}

function ensureColumnCanBeDropped(db, table, column) {
  const normalized = column.toLowerCase();
  for (const constraint of tableConstraints(db[table])) {
    if (constraint.columns?.some((key) => key.toLowerCase() === normalized)) throw new Error(`No se puede eliminar la columna "${column}" porque participa en una restriccion.`);
  }
  for (const [otherTable, rows] of Object.entries(db)) {
    for (const constraint of tableConstraints(rows).filter((item) => item.type === 'FOREIGN KEY')) {
      const refTable = findTable(db, constraint.references.table);
      if (refTable === table && constraint.references.columns.some((key) => key.toLowerCase() === normalized)) throw new Error(`No se puede eliminar la columna "${column}" porque es referenciada por una FOREIGN KEY en "${otherTable}".`);
    }
  }
}

function ensureTableCanBeTruncated(db, table) {
  for (const [otherTable, rows] of Object.entries(db)) {
    for (const constraint of tableConstraints(rows).filter((item) => item.type === 'FOREIGN KEY')) {
      const refTable = findTable(db, constraint.references.table);
      if (refTable === table) throw new Error(`No se puede truncar la tabla "${table}" porque es referenciada por una FOREIGN KEY en "${otherTable}".`);
    }
  }
}

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

const sqlValue = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  return String(v);
};

function findOutermostSubquery(expr) {
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === "'") {
      i++;
      while (i < expr.length) {
        if (expr[i] === "'" && expr[i + 1] === "'") i += 2;
        else if (expr[i] === "'") break;
        else i++;
      }
      continue;
    }
    if (expr[i] === '(') {
      const rest = expr.slice(i + 1).trimStart();
      if (/^SELECT\b/i.test(rest)) {
        let depth = 1;
        let j = i + 1;
        for (; j < expr.length && depth > 0; j++) {
          if (expr[j] === "'") {
            j++;
            while (j < expr.length) {
              if (expr[j] === "'" && expr[j + 1] === "'") j += 2;
              else if (expr[j] === "'") break;
              else j++;
            }
            continue;
          }
          if (expr[j] === '(') depth++;
          if (expr[j] === ')') depth--;
        }
        if (depth !== 0) return null;
        return { start: i, end: j - 1 };
      }
    }
  }
  return null;
}

function resolveSubqueries(expr, db, stepsCollector) {
  const sq = findOutermostSubquery(expr);
  if (!sq) return expr;

  const innerSql = expr.slice(sq.start + 1, sq.end).trim();
  const execution = executeSql(innerSql, db);
  const values = execution.result.map(row => Object.values(row)[0]);

  if (stepsCollector) {
    stepsCollector.push(...execution.steps.map(s => ({ ...s, isSubquery: true })));
  }

  const prefix = expr.slice(0, sq.start);

  const allMatch = prefix.match(/(?:^|\s)(>=|<=|<>|!=|=|>|<)\s+ALL\s*$/i);
  if (allMatch) {
    const op = allMatch[1];
    const replaceFrom = prefix.length - allMatch[0].length;
    let replaceWith;
    if (values.length === 0) {
      replaceWith = '1=1';
    } else if (op === '=') {
      const unique = [...new Set(values)];
      replaceWith = unique.length === 1 ? ` ${op} ${sqlValue(unique[0])}` : '1=0';
    } else if (op === '<>') {
      replaceWith = ` NOT IN (${values.map(v => sqlValue(v)).join(',')})`;
    } else if (op === '>=' || op === '>') {
      const max = values.reduce((a, b) => a > b ? a : b);
      replaceWith = ` ${op} ${sqlValue(max)}`;
    } else {
      const min = values.reduce((a, b) => a < b ? a : b);
      replaceWith = ` ${op} ${sqlValue(min)}`;
    }
    return resolveSubqueries(expr.slice(0, replaceFrom) + replaceWith + expr.slice(sq.end + 1), db, stepsCollector);
  }

  const inMatch = prefix.match(/(?:^|\s)(NOT\s+)?IN\s*$/i);
  if (inMatch) {
    const not = inMatch[1] || '';
    const replaceFrom = prefix.length - inMatch[0].length;
    let replaceWith;
    if (values.length === 0) {
      replaceWith = not ? '1=1' : '1=0';
    } else {
      replaceWith = ` ${not}IN (${values.map(v => sqlValue(v)).join(',')})`;
    }
    return resolveSubqueries(expr.slice(0, replaceFrom) + replaceWith + expr.slice(sq.end + 1), db, stepsCollector);
  }

  const opMatch = prefix.match(/(?:^|\s)(>=|<=|<>|!=|=|>|<)\s*$/i);
  if (opMatch) {
    const op = opMatch[1];
    const replaceFrom = prefix.length - opMatch[0].length;
    const scalar = values.length > 0 ? values[0] : null;
    const replaceWith = ` ${op} ${sqlValue(scalar)}`;
    return resolveSubqueries(expr.slice(0, replaceFrom) + replaceWith + expr.slice(sq.end + 1), db, stepsCollector);
  }

  const replaceWith = ` ${sqlValue(values.length > 0 ? values[0] : null)}`;
  return resolveSubqueries(expr.slice(0, sq.start) + replaceWith + expr.slice(sq.end + 1), db, stepsCollector);
}

const sqlAnd = (left, right) => left === false || right === false ? false : left === null || right === null ? null : true;
const sqlOr = (left, right) => left === true || right === true ? true : left === null || right === null ? null : false;
const sqlNot = (value) => value === null ? null : !value;
const isSqlTrue = (value) => value === true;

function isWrappedExpression(expr) {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return false;
  let depth = 0; let quoted = false;
  for (let i = 0; i < expr.length; i += 1) {
    if (expr[i] === "'" && expr[i + 1] === "'") { i += 1; continue; }
    if (expr[i] === "'") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (expr[i] === '(') depth += 1;
    if (expr[i] === ')') depth -= 1;
    if (depth === 0 && i < expr.length - 1) return false;
  }
  return depth === 0;
}

function testCondition(row, raw, db) {
  let expr = raw.trim().replace(/\s+/g, ' ');
  if (db) expr = resolveSubqueries(expr, db);
  while (isWrappedExpression(expr)) expr = expr.slice(1, -1).trim();
  const or = splitLogic(expr, 'OR');
  if (or) return sqlOr(testCondition(row, or[0]), testCondition(row, or[1]));
  const and = splitLogic(expr, 'AND');
  if (and) return sqlAnd(testCondition(row, and[0]), testCondition(row, and[1]));
  if (/^NOT\s+/i.test(expr)) return sqlNot(testCondition(row, expr.replace(/^NOT\s+/i, '')));

  let match = expr.match(/^(.+?)\s+IS\s+(NOT\s+)?NULL$/i);
  if (match) return match[2] ? valueOf(row, match[1]) != null : valueOf(row, match[1]) == null;
  match = expr.match(/^(.+?)\s+BETWEEN\s+(.+?)\s+AND\s+(.+)$/i);
  if (match) {
    const value = valueOf(row, match[1]); const min = valueOf(row, match[2]); const max = valueOf(row, match[3]);
    if (value == null || min == null || max == null) return null;
    return compareSqlValues(value, min) >= 0 && compareSqlValues(value, max) <= 0;
  }
  match = expr.match(/^(.+?)\s+(NOT\s+)?IN\s*\((.+)\)$/i);
  if (match) {
    const left = valueOf(row, match[1]);
    const values = splitComma(match[3]).map((item) => valueOf(row, item));
    const result = left == null ? null : values.some((item) => item != null && item === left) ? true : values.some((item) => item == null) ? null : false;
    return match[2] ? sqlNot(result) : result;
  }
  match = expr.match(/^(.+?)\s+(NOT\s+)?LIKE\s+(.+)$/i);
  if (match) {
    const left = valueOf(row, match[1]); const patternValue = valueOf(row, match[3]);
    if (left == null || patternValue == null) return null;
    const pattern = String(patternValue).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
    const has = new RegExp(`^${pattern}$`, 'i').test(String(left));
    return match[2] ? sqlNot(has) : has;
  }
  match = expr.match(/^(.+?)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/);
  if (!match) throw new Error(`No pude interpretar la condicion: ${expr}`);
  const left = valueOf(row, match[1]); const right = valueOf(row, match[3]);
  if (left == null || right == null) return null;
  const comparison = compareSqlValues(left, right);
  return ({ '=': comparison === 0, '!=': comparison !== 0, '<>': comparison !== 0, '>': comparison > 0, '<': comparison < 0, '>=': comparison >= 0, '<=': comparison <= 0 })[match[2]];
}

function splitComma(text) {
  const result = []; let current = ''; let depth = 0; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "'" && text[i + 1] === "'") { current += char + text[i + 1]; i += 1; continue; }
    if (char === "'") quoted = !quoted;
    if (!quoted && char === '(') depth += 1;
    if (!quoted && char === ')') depth -= 1;
    if (char === ',' && depth === 0 && !quoted) { result.push(current.trim()); current = ''; } else current += char;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function clause(sql, name, stops) {
  const upper = sql.toUpperCase();
  const n = name.toUpperCase();
  let nameIdx = -1;
  let scanDepth = 0;
  let quoted = false;
  for (let i = 0; i < sql.length; i++) {
    if (upper[i] === "'" && upper[i + 1] === "'") { i++; continue; }
    if (upper[i] === "'") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (upper[i] === '(') { scanDepth++; continue; }
    if (upper[i] === ')') { scanDepth--; continue; }
    if (scanDepth === 0 && /\w/.test(upper[i]) && (i === 0 || !/\w/.test(upper[i - 1]))) {
      if (upper.startsWith(n, i) && (i + n.length >= upper.length || !/\w/.test(upper[i + n.length])) && /\s/.test(upper[i + n.length])) {
        nameIdx = i + n.length;
        break;
      }
    }
  }
  if (nameIdx === -1) return undefined;
  const contentIdx = nameIdx + 1;
  if (!stops.length) return sql.slice(contentIdx).trim();
  const stopUpper = stops.map(s => s.toUpperCase());
  let depth = 0;
  quoted = false;
  for (let i = contentIdx; i < sql.length; i++) {
    if (upper[i] === "'" && upper[i + 1] === "'") { i++; continue; }
    if (upper[i] === "'") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (upper[i] === '(') { depth++; continue; }
    if (upper[i] === ')') { depth--; continue; }
    if (depth === 0 && /\w/.test(upper[i]) && (i === contentIdx || !/\w/.test(upper[i - 1]))) {
      for (const s of stopUpper) {
        if (upper.startsWith(s, i) && (i + s.length >= upper.length || !/\w/.test(upper[i + s.length]))) {
          return sql.slice(contentIdx, i).trim();
        }
      }
    }
  }
  return sql.slice(contentIdx).trim();
}

function countTopLevelJoins(sql) {
  const upper = sql.toUpperCase();
  let depth = 0; let quoted = false; let count = 0;
  for (let i = 0; i < upper.length; i += 1) {
    if (upper[i] === "'" && upper[i + 1] === "'") { i += 1; continue; }
    if (upper[i] === "'") { quoted = !quoted; continue; }
    if (quoted) continue;
    if (upper[i] === '(') { depth += 1; continue; }
    if (upper[i] === ')') { depth -= 1; continue; }
    if (depth === 0 && upper.startsWith('JOIN', i) && (i === 0 || !/\w/.test(upper[i - 1])) && (i + 4 >= upper.length || !/\w/.test(upper[i + 4]))) count += 1;
  }
  return count;
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
  if (fn === 'MIN') return values.reduce((a, b) => compareSqlValues(a, b) < 0 ? a : b);
  return values.reduce((a, b) => compareSqlValues(a, b) > 0 ? a : b);
}

const aggregatePattern = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i;
const normalizeExpression = (expression) => normalizeIdentifier(expression).replace(/\s+/g, ' ').trim().toLowerCase();
const selectFieldParts = (field) => {
  const trimmed = field.trim();
  const aliasMatch = trimmed.match(/^([\s\S]+?)\s+AS\s+(?:"([^"]+)"|\[([^\]]+)\]|([A-Za-z_]\w*))$/i)
    || trimmed.match(/^([\s\S]+?)\s+(?:"([^"]+)"|\[([^\]]+)\])$/i)
    || trimmed.match(/^([\s\S]+?)\s+([A-Za-z_]\w*)$/i);
  const expression = (aliasMatch ? aliasMatch[1] : trimmed).trim();
  const alias = aliasMatch ? (aliasMatch[2] || aliasMatch[3] || aliasMatch[4]) : stripAlias(expression).replace(/\W+/g, '_');
  return { expression, alias };
};

function validateSelectGrouping(selectText, groupText) {
  const fields = splitComma(selectText).map(selectFieldParts);
  if (groupText) {
    const grouped = splitComma(groupText).map(normalizeExpression);
    for (const { expression } of fields) {
      if (aggregatePattern.test(expression)) continue;
      if (!grouped.includes(normalizeExpression(expression))) throw new Error(`La columna "${expression}" no es valida en la lista SELECT porque no esta contenida en GROUP BY ni en una funcion de agregado.`);
    }
    return;
  }
  const hasAggregate = fields.some(({ expression }) => aggregatePattern.test(expression));
  if (!hasAggregate) return;
  for (const { expression } of fields) {
    if (aggregatePattern.test(expression) || isLiteral(normalizeIdentifier(expression))) continue;
    throw new Error(`La columna "${expression}" no es valida en la lista SELECT porque no esta contenida en una funcion de agregado.`);
  }
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
  if (lower) { const value = valueOf(rows[0], lower[2]); return value == null ? null : String(value)[lower[1].toUpperCase() === 'LOWER' ? 'toLowerCase' : 'toUpperCase'](); }
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
    const { expression, alias } = selectFieldParts(field);
    return [alias, calculate(expression, rows)];
  })));
}

const orderValue = (resultRow, group, key) => {
  try { return valueOf(resultRow, key); }
  catch (err) { return valueOf(group.rows[0] || {}, key); }
};

const nullsForRow = (row) => Object.fromEntries(Object.keys(row || {}).filter((key) => !key.startsWith('__')).map((key) => [key, null]));

const step = (type, title, detail, rows, accent = 'blue', compare = null) => ({ type, title, detail, rows: displayRows(rows), count: rows.length, accent, compare });

function executeSelect(sql, db) {
  const rawSelectText = clause(sql, 'SELECT', ['FROM']);
  const isDistinct = /^DISTINCT\s+/i.test(rawSelectText);
  const selectText = rawSelectText.replace(/^DISTINCT\s+/i, '');
  const fromText = clause(sql, 'FROM', ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'OFFSET', 'LIMIT']);
  if (!selectText || !fromText) throw new Error('Una consulta SELECT necesita las clausulas SELECT y FROM.');
  if (fromText.includes(',')) throw new Error('FROM con multiples tablas separadas por coma no esta soportado; usa JOIN explicito con condicion ON.');
  const baseMatch = fromText.match(/^(\w+)(?:\s+(?:AS\s+)?(\w+))?$/i);
  if (!baseMatch) throw new Error(`No pude interpretar la clausula FROM: ${fromText}`);
  const baseName = findTable(db, baseMatch[1]);
  if (!baseName) throw new Error(`La tabla "${baseMatch[1]}" no existe en este sandbox.`);
  const baseAlias = baseMatch[2] || baseName;
  let rows = db[baseName].map((row) => qualify(row, baseAlias));
  const steps = [step('FROM', `Leer ${baseName}`, `${rows.length} filas entran al flujo desde la tabla original.`, db[baseName], 'violet')];

  const joinRegex = /\b(?:(INNER|LEFT|RIGHT|FULL)\s+)?JOIN\s+(\w+)(?:\s+(?:AS\s+)?(\w+))?\s+ON\s+([\s\S]*?)(?=\s+(?:INNER|LEFT|RIGHT|FULL)?\s*JOIN\b|\s+WHERE\b|\s+GROUP\s+BY\b|\s+HAVING\b|\s+ORDER\s+BY\b|$)/gi;
  let join; let joinCount = 0;
  while ((join = joinRegex.exec(sql))) {
    joinCount += 1;
    const kind = (join[1] || 'INNER').toUpperCase(); const tableName = findTable(db, join[2]);
    if (!tableName) throw new Error(`La tabla "${join[2]}" no existe.`);
    const alias = join[3] || tableName; const rightRows = db[tableName].map((r) => qualify(r, alias));
    const beforeJoin = rows;
    const leftNulls = nullsForRow(beforeJoin[0]);
    const rightNulls = nullsForRow(rightRows[0] || qualify(Object.fromEntries(tableColumns(db[tableName]).map((column) => [column, null])), alias));
    const combined = [];
    rows.forEach((left) => {
      const matches = rightRows.filter((right) => isSqlTrue(testCondition({ ...left, ...right }, join[4], db)));
      if (matches.length) matches.forEach((right) => combined.push({ ...left, ...right }));
      else if (kind === 'LEFT' || kind === 'FULL') combined.push({ ...left, ...rightNulls });
    });
    if (kind === 'RIGHT' || kind === 'FULL') rightRows.forEach((right) => {
      if (!rows.some((left) => isSqlTrue(testCondition({ ...left, ...right }, join[4], db)))) combined.push({ ...leftNulls, ...right });
    });
    rows = combined;
    const beforeColumns = new Set(displayRows(beforeJoin).flatMap((row) => Object.keys(row)));
    const addedColumns = [...new Set(displayRows(rows).flatMap((row) => Object.keys(row)).filter((column) => !beforeColumns.has(column)))];
    steps.push(step('SOURCE', `Leer ${tableName}`, `${rightRows.length} filas entran desde la tabla relacionada.`, db[tableName], 'violet'));
    steps.push(step('JOIN', `${kind} JOIN con ${tableName}`, `Se comparan las claves de ambas tablas mediante ${join[4]}. Las columnas nuevas se resaltan en verde.`, rows, 'cyan', { kind: 'join', addedColumns }));
  }
  if (joinCount !== countTopLevelJoins(sql)) throw new Error('Cada JOIN debe declarar una condicion explicita con ON.');

  const whereText = clause(sql, 'WHERE', ['GROUP BY', 'HAVING', 'ORDER BY', 'OFFSET', 'LIMIT']);
  if (whereText) {
    const subquerySteps = [];
    const hasSubq = /\(\s*SELECT\b/i.test(whereText);
    const whereComparedColumn = hasSubq ? whereText.match(/^([\s\S]+?)\s*(?:(?:>=|<=|<>|!=|=|>|<)(?:\s+ALL)?|NOT\s+IN|IN)\s*\(\s*SELECT/i)?.[1]?.trim() : undefined;
    const whereCompare = { kind: 'filter', beforeRows: displayRows(rows) };
    if (whereComparedColumn) whereCompare.comparedColumn = whereComparedColumn;
    const resolvedWhere = hasSubq ? resolveSubqueries(whereText, db, subquerySteps) : whereText;
    if (subquerySteps.length) whereCompare.subquerySteps = subquerySteps;
    const beforeRows = rows; const before = rows.length; rows = rows.filter((row) => isSqlTrue(testCondition(row, resolvedWhere)));
    steps.push(step('WHERE', 'Filtrar filas', `${whereText}. Se conservan ${rows.length} de ${before} filas. Las filas descartadas se muestran en rojo.`, rows, 'amber', whereCompare));
  }
  const groupText = clause(sql, 'GROUP BY', ['HAVING', 'ORDER BY', 'OFFSET', 'LIMIT']);
  validateSelectGrouping(selectText.replace(/^TOP\s+\d+\s+/i, ''), groupText);
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
  } else if (!aggregatePattern.test(selectText)) groups = rows.map((row, i) => ({ key: i, rows: [row] }));

  const havingText = clause(sql, 'HAVING', ['ORDER BY', 'OFFSET', 'LIMIT']);
  if (havingText) {
    const subquerySteps = [];
    const resolvedHaving = /\(\s*SELECT\b/i.test(havingText) ? resolveSubqueries(havingText, db, subquerySteps) : havingText;
    const before = groups.length;
    groups = groups.filter((group) => {
      const expanded = resolvedHaving.replace(/(COUNT|SUM|AVG|MIN|MAX)\s*\((.*?)\)/gi, (m) => String(aggregateValue(m, group.rows)));
      return isSqlTrue(testCondition(group.rows[0] || {}, expanded));
    });
    const havingCompare = {};
    if (subquerySteps.length) havingCompare.subquerySteps = subquerySteps;
    steps.push(step('HAVING', 'Filtrar grupos', `${havingText}. Se conservan ${groups.length} de ${before} grupos.`, groups.map((g) => ({ grupo: g.key, filas: g.rows.length })), 'orange', havingCompare));
  }

  let result = project(groups, selectText.replace(/^TOP\s+\d+\s+/i, ''));
  steps.push(step('SELECT', 'Proyectar columnas', `Solo permanecen: ${selectText}.`, result, 'blue'));
  if (isDistinct) {
    result = [...new Map(result.map((row) => [rowSignature(row), row])).values()];
    steps.push(step('DISTINCT', 'Eliminar duplicados', `DISTINCT conserva ${result.length} filas unicas.`, result, 'green'));
  }
  const orderText = clause(sql, 'ORDER BY', ['OFFSET', 'LIMIT']);
  if (orderText) {
    const fields = splitComma(orderText).map((item) => { const m = item.match(/^(.*?)(?:\s+(ASC|DESC))?$/i); return { key: m[1].trim(), dir: (m[2] || 'ASC').toUpperCase() }; });
    result = result.map((row, index) => ({ row, group: groups[index] })).sort((a, b) => { for (const f of fields) { const av = orderValue(a.row, a.group, f.key); const bv = orderValue(b.row, b.group, f.key); if (av == null && bv == null) continue; if (av == null) return f.dir === 'ASC' ? -1 : 1; if (bv == null) return f.dir === 'ASC' ? 1 : -1; const comparison = compareSqlValues(av, bv); if (comparison < 0) return f.dir === 'ASC' ? -1 : 1; if (comparison > 0) return f.dir === 'ASC' ? 1 : -1; } return 0; }).map((item) => item.row);
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
  if ((match = sql.match(/^INSERT\s+INTO\s+(\w+)(?:\s*\((.*?)\))?\s*VALUES\s+([\s\S]+)$/i))) {
    const table = findTable(next, match[1]); if (!table) throw new Error(`La tabla "${match[1]}" no existe.`);
    const schemaColumns = tableColumns(next[table]);
    const columns = match[2] ? splitComma(match[2]).map((key) => requireColumn(next[table], table, key.trim())) : schemaColumns;
    if (new Set(columns.map((column) => column.toLowerCase())).size !== columns.length) throw new Error('La lista de columnas de INSERT contiene nombres duplicados.');
    if (!columns.length) throw new Error(`INSERT sin lista de columnas necesita que la tabla "${table}" tenga columnas definidas.`);
    const tuples = splitComma(match[3]).map((tuple) => {
      const tupleMatch = tuple.match(/^\(([\s\S]*)\)$/);
      if (!tupleMatch) throw new Error(`No pude interpretar la fila VALUES: ${tuple}`);
      const values = splitComma(tupleMatch[1]).map(unquote);
      if (values.length !== columns.length) throw new Error(`VALUES esperaba ${columns.length} valores y recibio ${values.length}.`);
      const row = Object.fromEntries(schemaColumns.map((key) => [key, null]));
      columns.forEach((key, i) => { row[key] = values[i]; });
      return row;
    });
    next[table].push(...tuples);
    next[table] = rememberColumns(next[table], schemaColumns, tableColumnTypes(next[table]), tableConstraints(next[table]));
    validateDatabaseIntegrity(next);
    return { db: next, result: tuples, statement: 'INSERT', message: `${tuples.length} ${tuples.length === 1 ? 'fila insertada' : 'filas insertadas'}`, steps: [step('TARGET', `Abrir ${table}`, 'La tabla destino se prepara para recibir una o mas filas.', db[table], 'violet'), step('VALUES', 'Construir filas nuevas', 'VALUES asigna cada dato a su columna y permite multiples tuplas separadas por coma.', tuples, 'amber'), step('INSERT', 'Insertar filas', `${tuples.length} ${tuples.length === 1 ? 'registro nuevo queda' : 'registros nuevos quedan'} resaltados en verde dentro de la tabla.`, next[table], 'green', { kind: 'insert', addedRows: displayRows(tuples) })] };
  }
  if ((match = sql.match(/^UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:\s+WHERE\s+([\s\S]+))?$/i))) {
    const table = findTable(next, match[1]); if (!table) throw new Error(`La tabla "${match[1]}" no existe.`);
    const assignments = splitComma(match[2]).map((item) => item.match(/^(\w+)\s*=\s*(.+)$/)).filter(Boolean).map((item) => [item[0], requireColumn(next[table], table, item[1]), item[2]]);
    if (!assignments.length) throw new Error('UPDATE necesita al menos una asignacion valida en SET.');
    const affected = [];
    const columns = tableColumns(next[table]);
    next[table] = rememberColumns(next[table].map((row) => { if (match[3] && !isSqlTrue(testCondition(row, match[3], next))) return row; const changed = { ...row }; assignments.forEach((a) => { changed[a[1]] = unquote(a[2]); }); affected.push(changed); return changed; }), columns, tableColumnTypes(next[table]), tableConstraints(next[table]));
    validateDatabaseIntegrity(next);
    return { db: next, result: affected, statement: 'UPDATE', message: `${affected.length} filas actualizadas`, steps: [step('WHERE', 'Localizar filas', match[3] || 'Sin WHERE: se seleccionan todas las filas.', affected, 'amber'), step('SET', 'Aplicar cambios', match[2], affected, 'blue'), step('UPDATE', 'Tabla actualizada', 'El cambio no sale de este sandbox.', next[table], 'green')] };
  }
  if ((match = sql.match(/^DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+([\s\S]+))?$/i))) {
    const table = findTable(next, match[1]); if (!table) throw new Error(`La tabla "${match[1]}" no existe.`);
    const columns = tableColumns(next[table]);
    const removed = next[table].filter((r) => !match[2] || isSqlTrue(testCondition(r, match[2], next)));
    next[table] = rememberColumns(next[table].filter((r) => match[2] && !isSqlTrue(testCondition(r, match[2], next))), columns, tableColumnTypes(next[table]), tableConstraints(next[table]));
    validateDatabaseIntegrity(next);
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
    const rawDefinitions = splitComma(match[2]);
    const definitions = rawDefinitions.map(columnDefinition).filter(Boolean);
    const constraints = [
      ...rawDefinitions.map(constraintDefinition).filter(Boolean),
      ...definitions.flatMap((definition) => definition.constraint)
    ];
    const columns = definitions.map((definition) => definition.name);
    const columnTypes = Object.fromEntries(definitions.map((definition) => [definition.name, definition.type]));
    next[target] = rememberColumns([], columns, columnTypes, constraints);
    validateDatabaseIntegrity(next);
    detail = `Se crea la tabla temporal con columnas: ${columns.join(', ')}.`;
  } else if ((match = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+ADD\s+(?:COLUMN\s+)?(\w+)(?:\s+[\w()]+)?(?:\s+DEFAULT\s+(.+))?$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    if (columnName(next[target], match[2])) throw new Error(`La columna "${match[2]}" ya existe en la tabla "${target}".`);
    const initial = match[3] == null ? null : unquote(match[3]);
    const typeMatch = sql.match(/^ALTER\s+TABLE\s+\w+\s+ADD\s+(?:COLUMN\s+)?\w+\s+([\w]+(?:\([^)]*\))?)/i);
    next[target] = rememberColumns(next[target].map((row) => ({ ...row, [match[2]]: initial })), [...new Set([...tableColumns(next[target]), match[2]])], { ...tableColumnTypes(next[target]), [match[2]]: typeMatch?.[1]?.toUpperCase() || 'UNKNOWN' }, tableConstraints(next[target]));
    validateDatabaseIntegrity(next);
    detail = `La columna ${match[2]} se agrega a todas las filas.`;
  } else if ((match = sql.match(/^ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(\w+)$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    requireColumn(next[target], target, match[2]);
    ensureColumnCanBeDropped(next, target, match[2]);
    next[target] = rememberColumns(next[target].map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key.toLowerCase() !== match[2].toLowerCase()))), tableColumns(next[target]).filter((key) => key.toLowerCase() !== match[2].toLowerCase()), Object.fromEntries(Object.entries(tableColumnTypes(next[target])).filter(([key]) => key.toLowerCase() !== match[2].toLowerCase())), tableConstraints(next[target]).filter((constraint) => !constraint.columns?.some((column) => column.toLowerCase() === match[2].toLowerCase())));
    validateDatabaseIntegrity(next);
    detail = `La columna ${match[2]} se elimina del esquema temporal.`;
  } else if ((match = sql.match(/^DROP\s+TABLE\s+(\w+)$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    delete next[target];
    validateDatabaseIntegrity(next);
    detail = 'La tabla se elimina del sandbox hasta reiniciar.';
  } else if ((match = sql.match(/^TRUNCATE\s+TABLE\s+(\w+)$/i))) {
    target = findTable(next, match[1]);
    if (!target) throw new Error(`La tabla "${match[1]}" no existe.`);
    ensureTableCanBeTruncated(next, target);
    next[target] = rememberColumns([], tableColumns(next[target]), tableColumnTypes(next[target]), tableConstraints(next[target]));
    validateDatabaseIntegrity(next);
    detail = 'Todas las filas se eliminan sin borrar la tabla.';
  } else if ((match = sql.match(/^CREATE\s+VIEW\s+(\w+)\s+AS\s+(SELECT[\s\S]+)$/i))) {
    target = match[1];
    if (findTable(next, target)) throw new Error(`La tabla o vista "${target}" ya existe.`);
    const viewResult = executeSelect(match[2], next).result;
    next[target] = viewResult;
    validateDatabaseIntegrity(next);
    detail = `La vista del sandbox contiene ${viewResult.length} filas.`;
  } else if ((match = sql.match(/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)$/i))) {
    target = match[1];
    const indexedTable = findTable(next, match[2]);
    if (!indexedTable) throw new Error(`La tabla "${match[2]}" no existe.`);
    splitComma(match[3]).forEach((column) => requireColumn(next[indexedTable], indexedTable, column));
    validateDatabaseIntegrity(next);
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

export function executeSqlScript(input, database) {
  const statements = splitSqlStatements(input);
  if (!statements.length) throw new Error('El archivo SQL no contiene sentencias ejecutables.');
  let currentDb = database;
  const results = [];
  statements.forEach((statement, index) => {
    try {
      const result = executeSql(statement, currentDb);
      currentDb = result.db;
      results.push({ statement, result });
    } catch (err) {
      throw new Error(`Error en sentencia ${index + 1}: ${err.message}`);
    }
  });
  const last = results.at(-1).result;
  return { ...last, db: currentDb, importedStatements: statements.length, scriptResults: results };
}
