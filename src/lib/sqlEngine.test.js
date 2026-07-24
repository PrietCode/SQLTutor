import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../data/examples.js';
import { createSeedDatabase } from '../data/seed.js';
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
  assert.match(execution.steps.find((step) => step.type === 'JOIN').detail, /\d+ x \d+ = \d+ pares/);
  const join = execution.steps.find((step) => step.type === 'JOIN');
  assert.equal(join.compare.beforeRows.length, 25);
  assert.equal(join.compare.outerVirtualRows.length, 1);
  assert.deepEqual(join.compare.joinKeys, [{ left: 'c.customer_id', right: 'o.customer_id', leftColumn: 'customer_id', rightColumn: 'customer_id', label: 'c.customer_id = o.customer_id' }]);
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

test('SELECT projection tracks removed columns for the visual flow', () => {
  const execution = executeSql('SELECT first_name FROM Customers;', createSeedDatabase());
  const selectStep = execution.steps.find((step) => step.type === 'SELECT');
  assert.equal(selectStep.compare.kind, 'project');
  assert.deepEqual(selectStep.rows[0], { first_name: 'Ana' });
  assert.ok(selectStep.compare.removedColumns.includes('customer_id'));
  assert.ok(selectStep.compare.removedColumns.includes('last_name'));
  assert.ok(selectStep.compare.beforeRows[0].email);
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
  assert.equal(db.CIUDADES.constraints.length, 3);
  assert.ok(db.CIUDADES.constraints.find(c => c.type === 'PRIMARY KEY' && c.columns[0] === 'Id'));
  assert.ok(db.CIUDADES.constraints.find(c => c.type === 'NOT NULL' && c.columns[0] === 'Nombre'));
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

test('correlated subquery in HAVING can reference outer grouped aliases', () => {
  const script = `CREATE TABLE EMPLEADOS_TEST (
    Legajo INT PRIMARY KEY,
    Apellido VARCHAR(40),
    Nombre VARCHAR(40),
    Legajo_jefe INT
  );
  CREATE TABLE VENTAS_TEST (
    Nro_Ticket INT PRIMARY KEY,
    Legajo_vend INT,
    Monto DECIMAL(10,2)
  );
  INSERT INTO EMPLEADOS_TEST VALUES
    (100,'Jefe','Ana',NULL),
    (101,'Vendedor','Bruno',100),
    (102,'Vendedor','Carla',100);
  INSERT INTO VENTAS_TEST VALUES
    (1,100,100),
    (2,101,120),
    (3,101,90),
    (4,102,40);
  SELECT E.Legajo, E.Apellido, E.Nombre
  FROM EMPLEADOS_TEST E
  JOIN VENTAS_TEST V ON E.Legajo = V.Legajo_vend
  GROUP BY E.Legajo, E.Apellido, E.Nombre, E.Legajo_jefe
  HAVING SUM(V.Monto) > (
      SELECT SUM(V2.Monto)
      FROM VENTAS_TEST V2
      WHERE V2.Legajo_vend = E.Legajo_jefe
  );`;

  const result = executeSqlScript(script, createSeedDatabase());
  assert.deepEqual(result.result, [{ Legajo: 101, Apellido: 'Vendedor', Nombre: 'Bruno' }]);
  assert.equal(result.steps.find((step) => step.type === 'HAVING').count, 1);
  assert.ok(result.steps.find((step) => step.type === 'HAVING').compare.subquerySteps.length > 0);
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

test('HAVING explains aggregate filters and marks removed groups', () => {
  const script = `CREATE TABLE FORMAS_PAGO (Cod INT PRIMARY KEY, Descrip VARCHAR(40));
    CREATE TABLE VENTAS (Nro_Ticket INT PRIMARY KEY, Cod_forma_pago INT, Monto DECIMAL(10,2), FOREIGN KEY (Cod_forma_pago) REFERENCES FORMAS_PAGO(Cod));
    INSERT INTO FORMAS_PAGO VALUES (1,'Efectivo'), (2,'Tarjeta'), (3,'Transferencia'), (4,'Cheque');
    INSERT INTO VENTAS VALUES
      (1,1,10), (2,1,20), (3,1,30), (4,1,40),
      (5,2,50), (6,2,60), (7,2,70), (8,2,80), (9,2,90),
      (10,3,100),
      (11,4,110), (12,4,120), (13,4,130), (14,4,140), (15,4,150), (16,4,160);
    SELECT F.Descrip, COUNT(*) AS "Veces Utilizado"
    FROM FORMAS_PAGO F JOIN VENTAS V ON F.Cod = V.Cod_forma_pago
    GROUP BY F.Descrip
    HAVING COUNT(*) > 3;`;

  const result = executeSqlScript(script, createSeedDatabase());
  const having = result.steps.find((step) => step.type === 'HAVING');
  assert.equal(result.result.length, 3);
  assert.equal(having.count, 3);
  assert.equal(having.compare.kind, 'filter');
  assert.equal(having.compare.unit, 'grupos');
  assert.equal(having.compare.beforeRows.length, 4);
  assert.ok(having.detail.includes('COUNT(*)'));
  assert.ok(having.rows.every((row) => Object.hasOwn(row, 'COUNT(*)')));
  assert.ok(having.compare.beforeRows.some((row) => row.Descrip === 'Transferencia' && row['COUNT(*)'] === 1));
  assert.equal(result.steps.find((step) => step.type === 'JOIN').compare.joinKeys[0].label, 'Cod = Cod_forma_pago');
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

test('LIKE implements SQL wildcards and preserves FROM before WHERE filtering', () => {
  const script = `CREATE TABLE MODELOS_TEST (Id INT PRIMARY KEY, Modelo VARCHAR(40));
    INSERT INTO MODELOS_TEST VALUES (1,'XR1'), (2,'XR12'), (3,'AXRZ'), (4,'xR1'), (5,'ABCD');
    SELECT Modelo FROM MODELOS_TEST WHERE Modelo LIKE '%XR%';`;
  const result = executeSqlScript(script, createSeedDatabase());
  assert.deepEqual(result.result.map((row) => row.Modelo), ['XR1', 'XR12', 'AXRZ']);
  assert.equal(result.steps.find((step) => step.type === 'FROM').count, 5);
  assert.equal(result.steps.find((step) => step.type === 'WHERE').count, 3);

  const oneChar = executeSql("SELECT Modelo FROM MODELOS_TEST WHERE Modelo LIKE 'XR_';", result.db);
  assert.deepEqual(oneChar.result.map((row) => row.Modelo), ['XR1']);

  const noMatches = executeSql("SELECT Modelo FROM MODELOS_TEST WHERE Modelo LIKE '%ZZ%';", result.db);
  assert.equal(noMatches.steps.find((step) => step.type === 'FROM').count, 5);
  assert.equal(noMatches.steps.find((step) => step.type === 'WHERE').count, 0);
  assert.equal(noMatches.result.length, 0);
});

test('NULL comparisons follow SQL three-valued logic', () => {
  const db = createSeedDatabase();
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email = NULL;', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email != NULL;', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email IN (NULL);', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email NOT IN (NULL);', db).result.length, 0);
  assert.equal(executeSql('SELECT first_name FROM Customers WHERE email IS NULL;', db).result.length, 2);
});

test('set operators enforce union compatibility and treat NULL duplicates as equal', () => {
  const db = executeSqlScript(`CREATE TABLE EMPLEADOS_SET (Dni INT, Apellido VARCHAR(40));
    CREATE TABLE JEFES_SET (Dni INT, Area VARCHAR(40));
    CREATE TABLE SET_A (Val INT);
    CREATE TABLE SET_B (Val INT);
    CREATE TABLE SET_TEXT (Val VARCHAR(20));
    INSERT INTO EMPLEADOS_SET VALUES (1,'Jefe'), (2,'Perez'), (3,'Lopez');
    INSERT INTO JEFES_SET VALUES (1,'Ventas');
    INSERT INTO SET_A VALUES (1), (NULL), (NULL);
    INSERT INTO SET_B VALUES (NULL), (2);
    INSERT INTO SET_TEXT VALUES ('uno');`, createSeedDatabase()).db;

  const except = executeSql('SELECT Dni FROM EMPLEADOS_SET EXCEPT SELECT Dni FROM JEFES_SET;', db);
  assert.deepEqual(except.result.map((row) => row.Dni), [2, 3]);

  const union = executeSql('SELECT Val FROM SET_A UNION SELECT Val FROM SET_B;', db);
  assert.deepEqual([...new Set(union.result.map((row) => row.Val))].sort((a, b) => (a ?? -1) - (b ?? -1)), [null, 1, 2]);

  const intersect = executeSql('SELECT Val FROM SET_A INTERSECT SELECT Val FROM SET_B;', db);
  assert.deepEqual(intersect.result, [{ Val: null }]);

  const minus = executeSql('SELECT Val FROM SET_A MINUS SELECT Val FROM SET_B;', db);
  assert.deepEqual(minus.result, [{ Val: 1 }]);

  assert.throws(() => executeSql('SELECT Val FROM SET_A UNION SELECT Val FROM SET_TEXT;', db), /Union incompatible/i);
});

test('date and conversion scalar functions work in SELECT, WHERE and DML assignments', () => {
  const db = createSeedDatabase();
  const now = executeSql('SELECT GETDATE() AS ahora FROM Customers WHERE customer_id = 1;', db).result[0].ahora;
  assert.match(now, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);

  const byYear = executeSql('SELECT order_id FROM Orders WHERE YEAR(order_date) = 2026;', db);
  assert.equal(byYear.result.length, 5);

  const castDate = executeSql("SELECT order_id FROM Orders WHERE order_date >= CAST('2026-03-01' AS DATE);", db);
  assert.deepEqual(castDate.result.map((row) => row.order_id), [104, 105]);

  const convertDate = executeSql("SELECT order_id FROM Orders WHERE order_date >= CONVERT(DATE, '2026-03-01');", db);
  assert.deepEqual(convertDate.result.map((row) => row.order_id), [104, 105]);

  const arithmetic = executeSql('SELECT name, stock + 1 AS next_stock FROM Products WHERE product_id = 6;', db);
  assert.deepEqual(arithmetic.result, [{ name: 'Blender', next_stock: 1 }]);

  const updated = executeSql("UPDATE Products SET stock = stock + 2 WHERE name = 'Blender';", db);
  assert.equal(updated.db.Products.find((row) => row.name === 'Blender').stock, 2);
});

test('EXISTS, NOT EXISTS, ANY and SOME subqueries follow WHERE three-valued logic', () => {
  const db = executeSqlScript(`CREATE TABLE NULL_COMPARE (Id INT, Val INT);
    INSERT INTO NULL_COMPARE VALUES (1,1), (2,NULL);`, createSeedDatabase()).db;

  const exists = executeSql(`SELECT first_name FROM Customers c
    WHERE EXISTS (SELECT * FROM Orders o WHERE o.customer_id = c.customer_id)
    ORDER BY first_name;`, db);
  assert.deepEqual(exists.result.map((row) => row.first_name), ['Ana', 'Bruno', 'Carla', 'Diego']);

  const notExists = executeSql(`SELECT first_name FROM Customers c
    WHERE NOT EXISTS (SELECT 1 FROM Orders o WHERE o.customer_id = c.customer_id);`, db);
  assert.deepEqual(notExists.result, [{ first_name: 'Elena' }]);

  const any = executeSql('SELECT name FROM Products WHERE price > ANY (SELECT price FROM Products WHERE category_id = 2);', db);
  assert.equal(any.result.length, 5);
  assert.ok(any.result.every((row) => row.name !== 'Blender'));

  const some = executeSql('SELECT name FROM Products WHERE price < SOME (SELECT price FROM Products WHERE category_id = 1);', db);
  assert.equal(some.result.length, 5);
  assert.ok(some.result.every((row) => row.name !== 'Laptop Pro'));

  const unknown = executeSql('SELECT Id FROM NULL_COMPARE WHERE Val > ANY (SELECT Val FROM NULL_COMPARE WHERE Id = 2);', db);
  assert.equal(unknown.result.length, 0);
});

test('subquery visual steps preserve filter and projection comparisons', () => {
  const result = executeSql(`SELECT name
    FROM Products
    WHERE category_id IN (SELECT category_id FROM Products WHERE stock = 0);`, createSeedDatabase());
  const subquerySteps = result.steps.find((step) => step.type === 'WHERE').compare.subquerySteps;
  const innerWhere = subquerySteps.find((step) => step.type === 'WHERE');
  const innerSelect = subquerySteps.find((step) => step.type === 'SELECT');
  assert.equal(innerWhere.compare.kind, 'filter');
  assert.ok(innerWhere.compare.beforeRows.length > innerWhere.rows.length);
  assert.equal(innerSelect.compare.kind, 'project');
  assert.ok(innerSelect.compare.removedColumns.includes('name'));
});

test('non-correlated HAVING subqueries are evaluated once and returned as a fixed set', () => {
  const result = executeSql(`SELECT department, AVG(salary) AS avg_salary
    FROM Employees
    GROUP BY department
    HAVING AVG(salary) >= ALL (
      SELECT AVG(salary)
      FROM Employees
      GROUP BY department
    );`, createSeedDatabase());
  const having = result.steps.find((step) => step.type === 'HAVING');
  assert.deepEqual(having.compare.subquerySteps.map((step) => step.type), ['FROM', 'GROUP BY', 'SELECT']);
  assert.equal(having.compare.subqueryResults.length, 1);
  assert.equal(having.compare.subqueryResults[0].mode, 'uncorrelated');
  assert.deepEqual(having.compare.subqueryResults[0].values.sort((a, b) => a - b), [985000, 1350000]);
});

test('correlated EXISTS subqueries record an iteration per outer row with parameters', () => {
  const result = executeSql(`SELECT first_name
    FROM Customers c
    WHERE EXISTS (SELECT * FROM Orders o WHERE o.customer_id = c.customer_id);`, createSeedDatabase());
  const where = result.steps.find((step) => step.type === 'WHERE');
  assert.equal(where.compare.subqueryResults.length, 5);
  assert.ok(where.compare.subqueryResults.every((item) => item.mode === 'correlated'));
  assert.deepEqual(where.compare.subqueryResults[0].parameters, [{ name: 'c.customer_id', value: 1 }]);
  assert.deepEqual(where.compare.subqueryResults[0].conditionValues, [{ name: 'o.customer_id', value: 1 }, { name: 'c.customer_id', value: 1 }]);
  assert.match(where.compare.subqueryResults[0].innerCondition, /o\.customer_id = c\.customer_id/);
  assert.equal(where.compare.subqueryResults[0].verdict, 'TRUE');
  assert.equal(where.compare.subqueryResults.at(-1).verdict, 'FALSE');
  assert.match(where.compare.subqueryResults[0].evaluatedCondition, /1=1/);
  assert.match(where.compare.subqueryResults.at(-1).evaluatedCondition, /1=0/);
  assert.equal(new Set(where.compare.subquerySteps.map((step) => step.subqueryIteration)).size, 5);

  const withStatus = executeSql(`SELECT first_name
    FROM Customers c
    WHERE EXISTS (SELECT * FROM Orders o WHERE o.customer_id = c.customer_id AND o.status = 'completed');`, createSeedDatabase());
  const statusValues = withStatus.steps.find((step) => step.type === 'WHERE').compare.subqueryResults[0].conditionValues;
  assert.deepEqual(statusValues, [{ name: 'o.customer_id', value: 1 }, { name: 'c.customer_id', value: 1 }, { name: 'o.status', value: 'completed' }]);
});

test('pedagogical validation errors match processing rules', () => {
  const db = createSeedDatabase();
  assert.throws(() => executeSql('SELECT name FROM Employees WHERE AVG(salary) > 50000;', db), /NUNCA va una función sumaria en el WHERE/);
  assert.throws(() => executeSql('SELECT name, department, SUM(salary) FROM Employees GROUP BY department;', db), /Las columnas del SELECT sin función de grupo DEBEN estar en el GROUP BY/);
  assert.throws(() => executeSql('SELECT * FROM Products WHERE category_id IN (SELECT category_id FROM Categories ORDER BY category_id);', db), /subconsulta no puede contener la cláusula ORDER BY/i);
  assert.throws(() => executeSql('SELECT * FROM Products WHERE category_id IN (SELECT category_id FROM Categories UNION SELECT category_id FROM Products);', db), /No puede haber UNION de otros SELECT en una subconsulta/);
  assert.throws(() => executeSql('SELECT c.first_name FROM Customers c JOIN Orders o ON customer_id = customer_id;', db), /Referencia de columna ambigua/);
  assert.throws(() => executeSql("INSERT INTO Categories (category_id, name) VALUES (NULL, 'Books');", db), /La PK no puede asumir valor nulo/);
});

test('subquery theoretical restrictions return classroom-oriented errors', () => {
  const db = createSeedDatabase();
  assert.throws(() => executeSql('SELECT * FROM Employees WHERE (SELECT AVG(salary) FROM Employees) < salary;', db), /La subconsulta debe aparecer a la derecha del operador/);
  assert.throws(() => executeSql('SELECT * FROM Employees WHERE employee_id = (SELECT employee_id, name FROM Employees WHERE employee_id = 1);', db), /La subconsulta debe devolver una única columna para este operador/);
  assert.throws(() => executeSql('SELECT * FROM Employees WHERE salary = (SELECT salary FROM Employees);', db), /La subconsulta debe devolver una única fila para este operador/);
  assert.throws(() => executeSql('SELECT * FROM Products WHERE price > SELECT AVG(price) FROM Products;', db), /La subconsulta debe estar encerrada entre paréntesis/);
  assert.throws(() => executeSql('SELECT name, (SELECT department FROM Employees e2 WHERE e2.employee_id = e.employee_id) FROM Employees e;', db), /No se permiten subconsultas en la lista del SELECT/);
  assert.throws(() => executeSql('SELECT * FROM Categories WHERE EXISTS (SELECT * FROM Products);', db), /EXISTS debe incluir una referencia externa/);
});

test('NOT NULL columns reject NULL inserts with a clear integrity error', () => {
  const db = executeSql('CREATE TABLE NN_TEST (Id INT PRIMARY KEY, Nombre VARCHAR(40) NOT NULL);', createSeedDatabase()).db;
  assert.throws(() => executeSql('INSERT INTO NN_TEST (Id, Nombre) VALUES (1, NULL);', db), /NOT NULL.*valor nulo/i);
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

test('CREATE TABLE rejects misspelled keywords and missing commas', () => {
  let db = executeSql('CREATE TABLE PADRES (Id INT PRIMARY KEY);', createSeedDatabase()).db;
  assert.throws(() => executeSql('CREATE TABLE BadPk (Id INT PRIMARY KKEY);', db), /KKEY|sintaxis/i);
  assert.throws(() => executeSql('CREATE TABLE BadFk (Id INT PRIMARY KEY, ParentId INT, FOREIGN KEY (ParentId) REFRENCES PADRES(Id));', db), /REFRENCES|sintaxis/i);
  assert.throws(() => executeSql('CREATE TABLE MissingComma (Id INT PRIMARY KEY Nombre VARCHAR(50));', db), /Nombre VARCHAR|sintaxis/i);
  assert.throws(() => executeSql('CREATE TABLE BadType (Id INTT PRIMARY KEY);', db), /tipo de dato "INTT"/i);
  assert.throws(() => executeSql('ALTER TABLE PADRES ADD Extra INTT;', db), /tipo de dato "INTT"|variante/i);
  assert.throws(() => executeSql('ALTER TABLE PADRES ADD Extra;', db), /variante de ALTER TABLE/i);
});

test('FOREIGN KEY structure must match referenced key columns and types', () => {
  let db = executeSql('CREATE TABLE PADRES (Id INT PRIMARY KEY, Codigo VARCHAR(10) UNIQUE);', createSeedDatabase()).db;
  assert.throws(() => executeSql('CREATE TABLE BadTypeFk (Id INT PRIMARY KEY, ParentId VARCHAR(10), FOREIGN KEY (ParentId) REFERENCES PADRES(Id));', db), /no coincide en tipos/i);
  db = executeSql('CREATE TABLE PADRES_COMP (Modelo VARCHAR(100), Marca VARCHAR(100), PRIMARY KEY (Modelo, Marca));', db).db;
  assert.throws(() => executeSql('CREATE TABLE BadCountFk (Id INT PRIMARY KEY, Modelo VARCHAR(100), FOREIGN KEY (Modelo) REFERENCES PADRES_COMP(Modelo, Marca));', db), /misma cantidad/i);
  assert.doesNotThrow(() => executeSql('CREATE TABLE GoodCompositeFk (Modelo VARCHAR(100), Marca VARCHAR(100), Item INT PRIMARY KEY, FOREIGN KEY (Modelo, Marca) REFERENCES PADRES_COMP(Modelo, Marca));', db));
});

test('composite PRIMARY KEY enforces uniqueness and non-null components', () => {
  let db = executeSql('CREATE TABLE CARACTxMOTO (Modelo VARCHAR(100), Marca VARCHAR(100), Cod_caract INT, Valor VARCHAR(40), PRIMARY KEY (Modelo, Marca, Cod_caract));', createSeedDatabase()).db;
  db = executeSql("INSERT INTO CARACTxMOTO VALUES ('Wave','Honda',1,'125cc');", db).db;
  assert.throws(() => executeSql("INSERT INTO CARACTxMOTO VALUES ('Wave','Honda',1,'Repetida');", db), /PRIMARY KEY|duplicada/i);
  assert.throws(() => executeSql("INSERT INTO CARACTxMOTO VALUES ('Wave',NULL,2,'Sin marca');", db), /NULL.*Marca/i);
});

test('unsupported or malformed SQL returns a clear error', () => {
  assert.throws(() => executeSql('MERGE Products;', createSeedDatabase()), /Comando no reconocido/);
  assert.throws(() => executeSql('SELECT * FROM Missing;', createSeedDatabase()), /no existe/);
});
