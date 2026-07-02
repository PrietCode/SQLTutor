import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedDatabase, examples } from '../data/seed.js';
import { executeSql } from './sqlEngine.js';

test('all bundled examples execute without errors', () => {
  for (const example of examples) {
    assert.doesNotThrow(() => executeSql(example.sql, createSeedDatabase()), example.id);
  }
});

test('filters, groups and aggregates follow logical SQL order', () => {
  const execution = executeSql(`SELECT category_id, COUNT(*) AS products, ROUND(AVG(price), 2) AS average
    FROM Products
    WHERE stock > 0
    GROUP BY category_id
    HAVING COUNT(*) >= 2
    ORDER BY average DESC;`, createSeedDatabase());
  assert.deepEqual(execution.steps.map((item) => item.type), ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY']);
  assert.equal(execution.result.length, 2);
  assert.equal(execution.result[0].products, 2);
});

test('joins expose both sources and preserve unmatched rows', () => {
  const execution = executeSql(`SELECT c.first_name, o.order_id
    FROM Customers c
    LEFT JOIN Orders o ON c.customer_id = o.customer_id;`, createSeedDatabase());
  assert.deepEqual(execution.steps.slice(0, 3).map((item) => item.type), ['FROM', 'SOURCE', 'JOIN']);
  assert.equal(execution.result.length, 6);
  assert.ok(execution.result.some((row) => row.order_id === null));
});

test('scalar functions and SQL Server pagination are evaluated', () => {
  const functions = executeSql(`SELECT CONCAT(UPPER(last_name), ', ', first_name) AS name,
    COALESCE(email, 'Sin email') AS contact, SUBSTRING(city, 1, 3) AS city
    FROM Customers ORDER BY customer_id;`, createSeedDatabase());
  assert.equal(functions.result[0].name, 'SILVA, Ana');
  assert.equal(functions.result[2].contact, 'Sin email');
  assert.equal(functions.result[0].city, 'Bue');

  const page = executeSql(`SELECT product_id FROM Products ORDER BY product_id
    OFFSET 2 ROWS FETCH NEXT 2 ROWS ONLY;`, createSeedDatabase());
  assert.deepEqual(page.result.map((row) => row.product_id), [3, 4]);
});

test('DML changes only the returned sandbox copy', () => {
  const original = createSeedDatabase();
  const updated = executeSql(`UPDATE Products SET stock = 10 WHERE name = 'Blender';`, original);
  assert.equal(updated.db.Products.find((row) => row.name === 'Blender').stock, 10);
  assert.equal(original.Products.find((row) => row.name === 'Blender').stock, 0);

  const deleted = executeSql(`DELETE FROM Orders WHERE status = 'cancelled';`, original);
  assert.equal(deleted.db.Orders.length, original.Orders.length - 1);
});

test('DDL modifies tables, columns and views in the temporary database', () => {
  const db = createSeedDatabase();
  const created = executeSql('CREATE TABLE Suppliers (supplier_id INT, name VARCHAR(100));', db);
  assert.ok(Object.hasOwn(created.db, 'Suppliers'));

  const altered = executeSql('ALTER TABLE Products ADD featured INT DEFAULT 0;', db);
  assert.ok(altered.db.Products.every((row) => row.featured === 0));

  const view = executeSql(`CREATE VIEW CompletedOrders AS SELECT order_id, total FROM Orders WHERE status = 'completed';`, db);
  assert.equal(view.db.CompletedOrders.length, 3);

  const truncated = executeSql('TRUNCATE TABLE Employees;', db);
  assert.equal(truncated.db.Employees.length, 0);
  const dropped = executeSql('DROP TABLE Employees;', db);
  assert.equal(Object.hasOwn(dropped.db, 'Employees'), false);
});

test('unsupported or malformed SQL returns a clear error', () => {
  assert.throws(() => executeSql('MERGE Products;', createSeedDatabase()), /Comando no reconocido/);
  assert.throws(() => executeSql('SELECT * FROM Missing;', createSeedDatabase()), /no existe/);
});
