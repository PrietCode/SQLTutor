import { useRef, useState } from 'react';
import { createSeedDatabase } from '../data/seed';
import { executeSql, executeSqlScript, splitSqlStatements } from '../lib/sqlEngine';

const hasTerminatingSemicolon = (input) => {
  let quoted = false; let lineComment = false; let blockComment = false; let last = '';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]; const next = input[i + 1];
    if (lineComment) { if (char === '\n') lineComment = false; continue; }
    if (blockComment) { if (char === '*' && next === '/') { blockComment = false; i += 1; } continue; }
    if (!quoted && char === '-' && next === '-') { lineComment = true; i += 1; continue; }
    if (!quoted && char === '/' && next === '*') { blockComment = true; i += 1; continue; }
    if (char === "'" && next === "'") { if (!/\s/.test(char)) last = char; i += 1; continue; }
    if (!quoted && char === ';') { last = ';'; continue; }
    if (char === "'") quoted = !quoted;
    if (!/\s/.test(char)) last = char;
  }
  return last === ';';
};

export function useSqlRuntime() {
  const [database, setDatabase] = useState(createSeedDatabase);
  const [execution, setExecution] = useState(null);
  const [error, setError] = useState('');
  const databaseRef = useRef(database);

  const commitDatabase = (nextDatabase) => {
    databaseRef.current = nextDatabase;
    setDatabase(nextDatabase);
  };
  const executeQuery = (sql) => {
    try {
      if (!hasTerminatingSemicolon(sql)) throw new Error('La sentencia SQL debe finalizar con punto y coma (;).');
      const statements = splitSqlStatements(sql);
      const next = statements.length > 1 ? executeSqlScript(sql, databaseRef.current) : executeSql(sql, databaseRef.current);
      databaseRef.current = next.db; setExecution(next); setDatabase(next.db); setError('');
      return next;
    } catch (err) {
      setError(err.message);
      setExecution(null);
      return null;
    }
  };
  const executeScript = (content) => {
    if (!hasTerminatingSemicolon(content)) throw new Error('El archivo SQL debe finalizar cada sentencia con punto y coma (;).');
    const next = executeSqlScript(content, databaseRef.current);
    databaseRef.current = next.db; setDatabase(next.db); setExecution(null); setError('');
    return next;
  };
  const executeSandboxSql = (sql) => {
    const result = executeSql(sql, databaseRef.current);
    commitDatabase(result.db);
    return result;
  };
  const deleteTable = (name) => {
    const next = { ...databaseRef.current };
    delete next[name];
    commitDatabase(next);
    return next;
  };
  const clearExecution = () => { setExecution(null); setError(''); };
  const clearError = () => setError('');
  const showError = (message) => setError(message);

  return { database, execution, error, executeQuery, executeScript, executeSandboxSql, deleteTable, clearExecution, clearError, showError };
}
