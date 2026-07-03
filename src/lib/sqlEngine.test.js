import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedDatabase, examples } from '../data/seed.js';
import { executeSql, executeSqlScript, splitSqlStatements } from './sqlEngine.js';

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
  assert.equal(execution.result.length, 1);
  assert.equal(execution.result[0].products, 3);
});

test('joins expose both sources and preserve unmatched rows', () => {
  const execution = executeSql(`SELECT c.first_name, o.order_id
    FROM Customers c
    LEFT JOIN Orders o ON c.customer_id = o.customer_id;`, createSeedDatabase());
  assert.deepEqual(execution.steps.slice(0, 3).map((item) => item.type), ['FROM', 'SOURCE', 'JOIN']);
  assert.equal(execution.result.length, 6);
  assert.ok(execution.result.some((row) => row.order_id === null));
});

test('qualified columns require declared aliases', () => {
  assert.throws(() => executeSql(`SELECT c.first_name, o.order_id, o.status
    FROM Customers
    FULL JOIN Orders ON c.customer_id = o.customer_id;`, createSeedDatabase()), /alias "c"/);
});

test('scalar functions and SQL Server pagination are evaluated', () => {
  const functions = executeSql(`SELECT CONCAT(UPPER(last_name), ', ', first_name) AS name,
    COALESCE(email, 'Sin email') AS contact, SUBSTRING(city, 1, 3) AS city
    FROM Customers ORDER BY customer_id;`, createSeedDatabase());
  assert.equal(functions.result[0].name, 'TORRES, Ana');
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

test('INSERT supports multiple VALUES rows and stops at the first statement', () => {
  const created = executeSql('CREATE TABLE CIUDADES (Id INT, Nombre VARCHAR(80), Provincia INT);', createSeedDatabase());
  const inserted = executeSql(`INSERT INTO CIUDADES (Id, Nombre, Provincia)
    VALUES
    (1,'Cordoba Capital',1),
    (2,'Rio Cuarto',1),
    (3,'Mendoza Capital',2),
    (4,'San Rafael',2),
    (5,'Rosario',3),
    (6,'Santa Fe',3),
    (7,'La Plata',4);`, created.db);

  assert.equal(inserted.result.length, 7);
  assert.equal(inserted.db.CIUDADES.length, 7);
  assert.deepEqual(inserted.db.CIUDADES[1], { Id: 2, Nombre: 'Rio Cuarto', Provincia: 1 });
  assert.equal(inserted.steps.find((step) => step.type === 'INSERT').compare.kind, 'insert');
  assert.equal(inserted.steps.find((step) => step.type === 'INSERT').compare.addedRows.length, 7);

  const onlyFirst = executeSql(`INSERT INTO CIUDADES (Id, Nombre, Provincia) VALUES (8,'Primera',4);
    INSERT INTO CIUDADES (Id, Nombre, Provincia) VALUES (9,'Segunda',4);`, inserted.db);
  assert.equal(onlyFirst.db.CIUDADES.length, 8);
  assert.equal(onlyFirst.db.CIUDADES.at(-1).Nombre, 'Primera');
});

test('SQL scripts execute all statements and ignore comments', () => {
  const script = `-- Provincias base
    CREATE TABLE PROVINCIAS (Id INT PRIMARY KEY, Nombre VARCHAR(50));
    /* Inserciones iniciales */
    INSERT INTO PROVINCIAS (Id, Nombre)
    VALUES
    (1,'Cordoba'),
    (2,'Mendoza'),
    (3,'Santa Fe'),
    (4,'Buenos Aires');
    -- Esta consulta tambien forma parte del archivo
    CREATE TABLE CIUDADES (Id INT, Nombre VARCHAR(80), Provincia INT, FOREIGN KEY (Provincia) REFERENCES PROVINCIAS(Id));`;

  assert.equal(splitSqlStatements(script).length, 3);
  const imported = executeSqlScript(script, createSeedDatabase());
  assert.equal(imported.importedStatements, 3);
  assert.equal(imported.db.PROVINCIAS.length, 4);
  assert.deepEqual(imported.db.PROVINCIAS.at(-1), { Id: 4, Nombre: 'Buenos Aires' });
  assert.deepEqual(imported.db.CIUDADES.columns, ['Id', 'Nombre', 'Provincia']);
});

test('INSERT without explicit columns uses table schema order', () => {
  let db = executeSql(`CREATE TABLE EMPLEADOS (
    Legajo INT PRIMARY KEY,
    Nombre VARCHAR(40),
    Apellido VARCHAR(40),
    FechaNacimiento DATE,
    Jefe INT
  );`, createSeedDatabase()).db;

  const inserted = executeSql(`INSERT INTO EMPLEADOS
    VALUES
    (100,'Juan','Perez','1980-05-15',NULL),
    (101,'Raul','Gomez','1992-10-20',100);`, db);

  assert.equal(inserted.db.EMPLEADOS.length, 2);
  assert.deepEqual(inserted.db.EMPLEADOS[0], { Legajo: 100, Nombre: 'Juan', Apellido: 'Perez', FechaNacimiento: '1980-05-15', Jefe: null });
  assert.deepEqual(inserted.db.EMPLEADOS[1], { Legajo: 101, Nombre: 'Raul', Apellido: 'Gomez', FechaNacimiento: '1992-10-20', Jefe: 100 });
  assert.equal(inserted.steps.find((step) => step.type === 'INSERT').compare.addedRows.length, 2);
});

test('SQL script imports table setup and columnless inserts in sequence', () => {
  const script = `CREATE TABLE PROVINCIAS (Id INT PRIMARY KEY, Nombre VARCHAR(50));
    CREATE TABLE EMPLEADOS (Legajo INT PRIMARY KEY, Nombre VARCHAR(40), Apellido VARCHAR(40), FechaNacimiento DATE, Jefe INT);
    INSERT INTO PROVINCIAS (Id, Nombre) VALUES (1,'Cordoba'), (2,'Mendoza');
    INSERT INTO EMPLEADOS VALUES (100,'Juan','Perez','1980-05-15',NULL);
    INSERT INTO EMPLEADOS VALUES (101,'Raul','Gomez','1992-10-20',100), (102,'Maria','Lopez','1995-04-12',100);`;

  const imported = executeSqlScript(script, createSeedDatabase());
  assert.equal(imported.importedStatements, 5);
  assert.equal(imported.db.PROVINCIAS.length, 2);
  assert.equal(imported.db.EMPLEADOS.length, 3);
  assert.equal(imported.db.EMPLEADOS[2].Nombre, 'Maria');
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

test('CREATE TABLE preserves many columns and table-level foreign keys', () => {
  let db = executeSql('CREATE TABLE PROVINCIAS (Id INT PRIMARY KEY, Nombre VARCHAR(50));', createSeedDatabase()).db;
  db = executeSql(`CREATE TABLE CIUDADES (
    Id INT PRIMARY KEY,
    Nombre VARCHAR(80) NOT NULL,
    Provincia INT,
    CodigoPostal VARCHAR(20),
    Latitud FLOAT,
    Longitud FLOAT,
    FOREIGN KEY (Provincia) REFERENCES PROVINCIAS(Id)
  );`, db).db;

  assert.deepEqual(db.CIUDADES.columns, ['Id', 'Nombre', 'Provincia', 'CodigoPostal', 'Latitud', 'Longitud']);
  assert.equal(db.CIUDADES.columnTypes.Nombre, 'VARCHAR(80)');
  assert.equal(db.CIUDADES.columnTypes.Latitud, 'FLOAT');
  assert.equal(db.CIUDADES.constraints.length, 2);
  assert.ok(db.CIUDADES.constraints.find(c => c.type === 'PRIMARY KEY' && c.columns[0] === 'Id'));
  assert.ok(db.CIUDADES.constraints.find(c => c.type === 'FOREIGN KEY' && c.references.table === 'PROVINCIAS'));
  assert.equal(db.CIUDADES.columns.includes('FOREIGN'), false);
});

test('INSERT rejects duplicate PRIMARY KEY values with SQL-Server-style error', () => {
  let db = executeSql('CREATE TABLE PROVINCIAS (Id INT PRIMARY KEY, Nombre VARCHAR(50));', createSeedDatabase()).db;
  db = executeSql("INSERT INTO PROVINCIAS (Id, Nombre) VALUES (1,'Cordoba');", db).db;
  assert.throws(() => executeSql("INSERT INTO PROVINCIAS (Id, Nombre) VALUES (1,'Mendoza');", db), /Infraccion de la restriccion PRIMARY KEY/);
  assert.throws(() => executeSql("INSERT INTO PROVINCIAS (Id, Nombre) VALUES (1,'Buenos Aires');", db), /clave duplicada.*\(1\)/);
  assert.equal(db.PROVINCIAS.length, 1);
});

test('INSERT catches duplicate PK across multiple VALUES rows', () => {
  const db = executeSql('CREATE TABLE TEST (Id INT PRIMARY KEY, Val INT);', createSeedDatabase()).db;
  assert.throws(() => executeSql('INSERT INTO TEST (Id, Val) VALUES (1,10), (1,20);', db), /clave duplicada.*\(1\)/);
  assert.throws(() => executeSql('INSERT INTO TEST (Id, Val) VALUES (2,10), (1,20), (1,30);', db), /clave duplicada.*\(1\)/);
});

test('INSERT rejects NULL value in PRIMARY KEY column', () => {
  let db = executeSql('CREATE TABLE PROVINCIAS (Id INT PRIMARY KEY, Nombre VARCHAR(50));', createSeedDatabase()).db;
  assert.throws(() => executeSql("INSERT INTO PROVINCIAS (Id, Nombre) VALUES (NULL,'Cordoba');", db), /NULL.*columna 'Id'/);
  assert.throws(() => executeSql("INSERT INTO PROVINCIAS (Nombre) VALUES ('Cordoba');", db), /NULL.*columna 'Id'/);
});

test('INSERT rejects FOREIGN KEY violation when referenced value does not exist', () => {
  let db = executeSql('CREATE TABLE PROVINCIAS (Id INT PRIMARY KEY, Nombre VARCHAR(50));', createSeedDatabase()).db;
  db = executeSql(`CREATE TABLE CIUDADES (
    Id INT PRIMARY KEY, Nombre VARCHAR(80), Provincia INT,
    FOREIGN KEY (Provincia) REFERENCES PROVINCIAS(Id)
  );`, db).db;
  assert.throws(() => executeSql("INSERT INTO CIUDADES (Id, Nombre, Provincia) VALUES (1,'Carlos Paz',99);", db), /conflicto con la restriccion FOREIGN KEY/);
  assert.throws(() => executeSql("INSERT INTO CIUDADES (Id, Nombre, Provincia) VALUES (1,'Carlos Paz',99);", db), /conflicto ocurrio en la tabla 'dbo.CIUDADES'/);
  db = executeSql("INSERT INTO PROVINCIAS (Id, Nombre) VALUES (1,'Cordoba');", db).db;
  assert.doesNotThrow(() => executeSql("INSERT INTO CIUDADES (Id, Nombre, Provincia) VALUES (1,'Carlos Paz',1);", db));
});

test('INSERT with self-referencing FK allows forward references within same VALUES', () => {
  let db = executeSql(`CREATE TABLE EMPLEADOS (
    Legajo INT PRIMARY KEY, Nombre VARCHAR(50), Legajo_jefe INT,
    FOREIGN KEY (Legajo_jefe) REFERENCES EMPLEADOS(Legajo)
  );`, createSeedDatabase()).db;
  db = executeSql("INSERT INTO EMPLEADOS VALUES (100,'Juan',NULL);", db).db;
  const result = executeSql(
    "INSERT INTO EMPLEADOS VALUES (101,'Raul',100), (102,'Maria',100), (103,'Carlos',100), (104,'Lucia',101), (105,'Pedro',101);", db
  );
  assert.equal(result.db.EMPLEADOS.length, 6);
  assert.equal(result.db.EMPLEADOS.find(e => e.Legajo === 104).Legajo_jefe, 101);
});

test('INSERT with self-referencing FK correctly rejects invalid forward reference', () => {
  let db = executeSql(`CREATE TABLE EMPLEADOS (
    Legajo INT PRIMARY KEY, Nombre VARCHAR(50), Legajo_jefe INT,
    FOREIGN KEY (Legajo_jefe) REFERENCES EMPLEADOS(Legajo)
  );`, createSeedDatabase()).db;
  db = executeSql("INSERT INTO EMPLEADOS VALUES (100,'Juan',NULL);", db).db;
  assert.throws(() => executeSql(
    "INSERT INTO EMPLEADOS VALUES (101,'Raul',200);", db
  ), /conflicto con la restriccion FOREIGN KEY/);
});

test('scalar subquery with = in WHERE', () => {
  const result = executeSql(`SELECT * FROM Products WHERE price = (SELECT MIN(price) FROM Products)`, createSeedDatabase());
  assert.equal(result.result.length, 1);
  assert.equal(result.result[0].name, 'Blender');
  assert.equal(result.result[0].price, 69.99);
});

test('IN subquery in WHERE', () => {
  const result = executeSql(`SELECT * FROM Products WHERE category_id IN (SELECT category_id FROM Categories WHERE name LIKE 'E%')`, createSeedDatabase());
  assert.equal(result.result.length, 3);
  assert.ok(result.result.every(row => [1, 2, 3].includes(row.product_id)));
});

test('>= ALL subquery in WHERE', () => {
  const result = executeSql(`SELECT * FROM Employees WHERE salary >= ALL (SELECT salary FROM Employees WHERE department = 'Ventas')`, createSeedDatabase());
  assert.equal(result.result.length, 2);
  assert.ok(result.result.some(row => row.name === 'Mateo Ruiz'));
  assert.ok(result.result.some(row => row.name === 'Sofia Diaz'));
});

test('>= ALL subquery in HAVING', () => {
  const result = executeSql(`SELECT department, AVG(salary) AS avg_salary FROM Employees GROUP BY department HAVING AVG(salary) >= ALL (SELECT AVG(salary) FROM Employees GROUP BY department)`, createSeedDatabase());
  assert.equal(result.result.length, 1);
  assert.equal(result.result[0].department, 'Tecnologia');
});

test('nested subqueries', () => {
  const result = executeSql(`SELECT * FROM Products WHERE category_id IN (SELECT category_id FROM Categories WHERE category_id IN (SELECT DISTINCT category_id FROM Products WHERE stock > 0))`, createSeedDatabase());
  assert.equal(result.result.length, 6);
});

test('DISTINCT runs after SELECT and before ORDER BY', () => {
  const result = executeSql('SELECT DISTINCT city FROM Customers ORDER BY city;', createSeedDatabase());
  assert.deepEqual(result.steps.map((step) => step.type), ['FROM', 'SELECT', 'DISTINCT', 'ORDER BY']);
  assert.deepEqual(result.result.map((row) => row.city), ['Buenos Aires', 'Cordoba', 'Mendoza', 'Rosario']);
});

test('DATE filters run before SUM and COUNT aggregates', () => {
  const script = `CREATE TABLE VENTAS (
    Nro_Ticket INT PRIMARY KEY,
    Modelo VARCHAR(100),
    Marca VARCHAR(100),
    Cod_forma_pago INT,
    Legajo_vend INT,
    Fecha DATE,
    Monto DECIMAL(10,2),
    Tipo_doc_cli VARCHAR(10),
    Nro_doc_cli VARCHAR(20)
  );
  INSERT INTO VENTAS VALUES
    (1,'A','X',1,10,'2021-12-31',20,'DNI','1'),
    (2,'A','X',1,10,'2022-01-01',100,'DNI','2'),
    (3,'B','Y',2,11,'2022-06-15',250,'DNI','3'),
    (4,'C','Z',2,12,'2022-12-31',150,'DNI','4'),
    (5,'D','Z',2,12,'2023-01-01',500,'DNI','5');
  SELECT SUM(V.Monto) AS "Monto Total", COUNT(*) AS "Cantidad Ventas 2022"
  FROM VENTAS V
  WHERE V.Fecha >= '1/1/2022' AND V.Fecha < '1/1/2023';`;

  const result = executeSqlScript(script, createSeedDatabase());
  assert.deepEqual(result.result, [{ 'Monto Total': 500, 'Cantidad Ventas 2022': 3 }]);
  assert.equal(result.steps.find((step) => step.type === 'WHERE').count, 3);
  assert.equal(result.steps.find((step) => step.type === 'FROM').rows.length, 5);
  assert.ok(Object.hasOwn(result.steps.find((step) => step.type === 'FROM').rows[0], 'Fecha'));
  assert.ok(Object.hasOwn(result.steps.find((step) => step.type === 'FROM').rows[0], 'Monto'));
});

test('step rows preserve all available rows for visual expansion', () => {
  let db = executeSql('CREATE TABLE TICKETS (Id INT PRIMARY KEY, Fecha DATE, Monto DECIMAL(10,2));', createSeedDatabase()).db;
  const values = Array.from({ length: 15 }, (_, index) => `(${index + 1},'2022-01-${String(index + 1).padStart(2, '0')}',${index + 1})`).join(',');
  db = executeSql(`INSERT INTO TICKETS VALUES ${values};`, db).db;
  const result = executeSql('SELECT COUNT(*) AS "Cantidad Tickets" FROM TICKETS WHERE Fecha >= \'1/1/2022\' AND Fecha < \'1/2/2022\';', db);
  assert.equal(result.result[0]['Cantidad Tickets'], 15);
  assert.equal(result.steps.find((step) => step.type === 'FROM').rows.length, 15);
  assert.equal(result.steps.find((step) => step.type === 'WHERE').rows.length, 15);
});

test('NULL comparisons follow SQL three-valued logic', () => {
  const db = createSeedDatabase();
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email = NULL;', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email != NULL;', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email IN (NULL);', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email NOT IN (NULL);', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email IS NULL;', db).result.length, 2);
});

test('multi-table queries reject ambiguous or implicit joins', () => {
  const db = createSeedDatabase();
  assert.throws(() => executeSql('SELECT customer_id FROM Customers c INNER JOIN Orders o ON c.customer_id = o.customer_id;', db), /ambiguo/);
  assert.throws(() => executeSql('SELECT * FROM Customers, Orders;', db), /JOIN explicito/);
  assert.throws(() => executeSql('SELECT * FROM Customers JOIN Orders;', db), /condicion explicita con ON/);
});

test('RIGHT JOIN preserves unmatched right rows with NULL left columns', () => {
  let db = executeSql('CREATE TABLE L (Id INT PRIMARY KEY, Val VARCHAR(20));', createSeedDatabase()).db;
  db = executeSql("INSERT INTO L VALUES (1,'uno');", db).db;
  db = executeSql('CREATE TABLE R (Id INT PRIMARY KEY, LId INT);', db).db;
  db = executeSql('INSERT INTO R VALUES (10,2);', db).db;
  const result = executeSql('SELECT l.Val, r.Id FROM L l RIGHT JOIN R r ON l.Id = r.LId;', db);
  assert.deepEqual(result.result, [{ Val: null, Id: 10 }]);
});

test('GROUP BY rejects non-grouped non-aggregate columns', () => {
  assert.throws(() => executeSql('SELECT category_id, name FROM Products GROUP BY category_id;', createSeedDatabase()), /GROUP BY/);
  assert.throws(() => executeSql('SELECT category_id, COUNT(*) AS total FROM Products;', createSeedDatabase()), /funcion de agregado/);
});

test('seed database enforces PK and FK constraints', () => {
  const db = createSeedDatabase();
  assert.throws(() => executeSql("INSERT INTO Orders (order_id, customer_id, total, status, order_date) VALUES (101, 1, 10, 'x', '2026-01-01');", db), /PRIMARY KEY/);
  assert.throws(() => executeSql("INSERT INTO Orders (order_id, customer_id, total, status, order_date) VALUES (200, 999, 10, 'x', '2026-01-01');", db), /FOREIGN KEY/);
});

test('UPDATE and DELETE preserve relational integrity', () => {
  let db = executeSql('CREATE TABLE P (Id INT PRIMARY KEY);', createSeedDatabase()).db;
  db = executeSql('CREATE TABLE C (Id INT PRIMARY KEY, PId INT, FOREIGN KEY (PId) REFERENCES P(Id));', db).db;
  db = executeSql('INSERT INTO P VALUES (1);', db).db;
  db = executeSql('INSERT INTO C VALUES (10,1);', db).db;
  assert.throws(() => executeSql('UPDATE P SET Id = NULL WHERE Id = 1;', db), /NULL/);
  assert.throws(() => executeSql('UPDATE C SET PId = 99 WHERE Id = 10;', db), /FOREIGN KEY/);
  assert.throws(() => executeSql('DELETE FROM P WHERE Id = 1;', db), /FOREIGN KEY/);
});

test('DML and DDL reject unknown columns and invalid foreign keys', () => {
  assert.throws(() => executeSql('INSERT INTO Products (missing) VALUES (1);', createSeedDatabase()), /no existe/);
  assert.throws(() => executeSql('UPDATE Products SET missing = 1;', createSeedDatabase()), /no existe/);
  assert.throws(() => executeSql('CREATE TABLE BadChild (Id INT PRIMARY KEY, ParentId INT, FOREIGN KEY (ParentId) REFERENCES Missing(Id));', createSeedDatabase()), /referenciada/);
  assert.throws(() => executeSql('CREATE TABLE BadRef (Id INT PRIMARY KEY, ParentName VARCHAR(80), FOREIGN KEY (ParentName) REFERENCES Categories(name));', createSeedDatabase()), /PRIMARY KEY o UNIQUE/);
});

test('unsupported or malformed SQL returns a clear error', () => {
  assert.throws(() => executeSql('MERGE Products;', createSeedDatabase()), /Comando no reconocido/);
  assert.throws(() => executeSql('SELECT * FROM Missing;', createSeedDatabase()), /no existe/);
});
