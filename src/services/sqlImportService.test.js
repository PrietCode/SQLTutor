import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SQL_IMPORT_MAX_BYTES,
  isSqlImportFile,
  normalizeImportedSql,
  prepareImportedSql,
  validateSqlImportFile,
} from './sqlImportService.js';

const file = (name, size = 0) => ({ name, size });

test('accepts .sql files', () => {
  assert.equal(isSqlImportFile('archivo.sql'), true);
});

test('accepts valid extensions with uppercase letters', () => {
  assert.equal(isSqlImportFile('ARCHIVO.SQL'), true);
});

test('accepts .txt files because they are part of the current import contract', () => {
  assert.equal(isSqlImportFile('archivo.txt'), true);
});

test('accepts names with multiple dots when the final extension is valid', () => {
  assert.equal(isSqlImportFile('datos.test.sql'), true);
});

test('rejects invalid extensions', () => {
  assert.equal(isSqlImportFile('archivo.csv'), false);
});

test('rejects misleading names with a valid extension in the middle', () => {
  assert.equal(isSqlImportFile('archivo.sql.exe'), false);
});

test('rejects files without extension', () => {
  assert.equal(isSqlImportFile('archivo'), false);
});

test('accepts a file size within the import limit', () => {
  assert.doesNotThrow(() => validateSqlImportFile(file('archivo.sql', SQL_IMPORT_MAX_BYTES)));
});

test('rejects a file size above the import limit', () => {
  assert.throws(
    () => validateSqlImportFile(file('archivo.sql', SQL_IMPORT_MAX_BYTES + 1)),
    /demasiado grande/
  );
});

test('prepares normal SQL content without changing it', () => {
  const sql = "SELECT '  texto  ' AS valor;";
  assert.equal(prepareImportedSql(sql), sql);
});

test('rejects empty content', () => {
  assert.throws(() => prepareImportedSql(''), /vacio/);
});

test('rejects content with only whitespace', () => {
  assert.throws(() => prepareImportedSql(' \n\t\r '), /vacio/);
});

test('removes an initial UTF-8 byte order mark', () => {
  assert.equal(normalizeImportedSql('\uFEFFSELECT 1;'), 'SELECT 1;');
  assert.equal(prepareImportedSql('\uFEFFSELECT 1;'), 'SELECT 1;');
});

test('rejects content with only a byte order mark and whitespace', () => {
  assert.throws(() => prepareImportedSql('\uFEFF \n\t'), /vacio/);
});
