const table = (rows, columns, columnTypes, constraints = []) => {
  rows.columns = columns;
  rows.columnTypes = columnTypes;
  rows.constraints = constraints;
  return rows;
};

export const createSeedDatabase = () => ({
  Customers: table([
    { customer_id: 1, first_name: 'Ana', last_name: 'Torres', email: 'ana@example.com', city: 'Buenos Aires' },
    { customer_id: 2, first_name: 'Bruno', last_name: 'Luna', email: 'bruno@example.com', city: 'Cordoba' },
    { customer_id: 3, first_name: 'Carla', last_name: 'Mendez', email: null, city: 'Rosario' },
    { customer_id: 4, first_name: 'Diego', last_name: 'Sosa', email: 'diego@example.com', city: 'Buenos Aires' },
    { customer_id: 5, first_name: 'Elena', last_name: 'Vega', email: null, city: 'Mendoza' }
  ], ['customer_id', 'first_name', 'last_name', 'email', 'city'], { customer_id: 'INT', first_name: 'VARCHAR(50)', last_name: 'VARCHAR(50)', email: 'VARCHAR(120)', city: 'VARCHAR(80)' }, [{ type: 'PRIMARY KEY', columns: ['customer_id'] }]),
  Categories: table([
    { category_id: 1, name: 'Electronics' },
    { category_id: 2, name: 'Home' },
    { category_id: 3, name: 'Sportswear' }
  ], ['category_id', 'name'], { category_id: 'INT', name: 'VARCHAR(80)' }, [{ type: 'PRIMARY KEY', columns: ['category_id'] }]),
  Products: table([
    { product_id: 1, name: 'Laptop Pro', price: 1299.99, category_id: 1, stock: 8 },
    { product_id: 2, name: 'Smartphone X', price: 799.99, category_id: 1, stock: 15 },
    { product_id: 3, name: 'Wireless Headphones', price: 159.99, category_id: 1, stock: 24 },
    { product_id: 4, name: 'Coffee Maker', price: 89.99, category_id: 2, stock: 12 },
    { product_id: 5, name: 'Running Shoes', price: 79.99, category_id: 3, stock: 20 },
    { product_id: 6, name: 'Blender', price: 69.99, category_id: 2, stock: 0 }
  ], ['product_id', 'name', 'price', 'category_id', 'stock'], { product_id: 'INT', name: 'VARCHAR(120)', price: 'DECIMAL(10,2)', category_id: 'INT', stock: 'INT' }, [
    { type: 'PRIMARY KEY', columns: ['product_id'] },
    { type: 'FOREIGN KEY', columns: ['category_id'], references: { table: 'Categories', columns: ['category_id'] } }
  ]),
  Orders: table([
    { order_id: 101, customer_id: 1, total: 1459.98, status: 'completed', order_date: '2026-01-12' },
    { order_id: 102, customer_id: 2, total: 89.99, status: 'completed', order_date: '2026-02-03' },
    { order_id: 103, customer_id: 1, total: 159.99, status: 'pending', order_date: '2026-02-18' },
    { order_id: 104, customer_id: 4, total: 799.99, status: 'completed', order_date: '2026-03-05' },
    { order_id: 105, customer_id: 3, total: 79.99, status: 'cancelled', order_date: '2026-03-22' }
  ], ['order_id', 'customer_id', 'total', 'status', 'order_date'], { order_id: 'INT', customer_id: 'INT', total: 'DECIMAL(10,2)', status: 'VARCHAR(20)', order_date: 'DATE' }, [
    { type: 'PRIMARY KEY', columns: ['order_id'] },
    { type: 'FOREIGN KEY', columns: ['customer_id'], references: { table: 'Customers', columns: ['customer_id'] } }
  ]),
  Employees: table([
    { employee_id: 1, name: 'Laura Perez', department: 'Ventas', salary: 950000 },
    { employee_id: 2, name: 'Mateo Ruiz', department: 'Tecnologia', salary: 1350000 },
    { employee_id: 3, name: 'Sofia Diaz', department: 'Ventas', salary: 1020000 }
  ], ['employee_id', 'name', 'department', 'salary'], { employee_id: 'INT', name: 'VARCHAR(100)', department: 'VARCHAR(80)', salary: 'DECIMAL(12,2)' }, [{ type: 'PRIMARY KEY', columns: ['employee_id'] }])
});

export const examples = [
  { id: 'select', label: 'SELECT columnas', level: 'Inicial', sql: 'SELECT customer_id, first_name, last_name, email\nFROM Customers;' },
  { id: 'where', label: 'WHERE y ORDER BY', level: 'Inicial', sql: 'SELECT name, price, stock\nFROM Products\nWHERE price > 70\nORDER BY price DESC;' },
  { id: 'logic', label: 'AND / OR', level: 'Inicial', sql: "SELECT name, price, stock\nFROM Products\nWHERE (price > 100 AND stock > 10) OR stock = 0;" },
  { id: 'like', label: 'LIKE', level: 'Inicial', sql: "SELECT first_name, last_name, city\nFROM Customers\nWHERE first_name LIKE 'A%';" },
  { id: 'join', label: 'INNER JOIN', level: 'Intermedio', sql: 'SELECT c.first_name, c.last_name, o.order_id, o.total\nFROM Customers c\nINNER JOIN Orders o ON c.customer_id = o.customer_id\nORDER BY o.total DESC;' },
  { id: 'left', label: 'LEFT JOIN y NULL', level: 'Intermedio', sql: 'SELECT c.first_name, c.city, o.order_id, o.status\nFROM Customers c\nLEFT JOIN Orders o ON c.customer_id = o.customer_id;' },
  { id: 'group', label: 'GROUP BY + AVG', level: 'Intermedio', sql: 'SELECT category_id, COUNT(*) AS products, ROUND(AVG(price), 2) AS average_price\nFROM Products\nGROUP BY category_id\nHAVING COUNT(*) >= 2\nORDER BY average_price DESC;' },
  { id: 'sum', label: 'SUM + GROUP BY', level: 'Intermedio', sql: 'SELECT status, COUNT(*) AS orders, SUM(total) AS revenue\nFROM Orders\nGROUP BY status\nORDER BY revenue DESC;' },
  { id: 'aggregates', label: 'MIN / MAX / AVG', level: 'Intermedio', sql: 'SELECT MIN(price) AS cheapest, MAX(price) AS most_expensive, ROUND(AVG(price), 2) AS average\nFROM Products;' },
  { id: 'between', label: 'BETWEEN', level: 'Inicial', sql: 'SELECT name, price\nFROM Products\nWHERE price BETWEEN 70 AND 200;' },
  { id: 'in', label: 'IN', level: 'Inicial', sql: "SELECT first_name, city\nFROM Customers\nWHERE city IN ('Buenos Aires', 'Rosario');" },
  { id: 'null', label: 'IS NULL', level: 'Inicial', sql: 'SELECT first_name, last_name, email\nFROM Customers\nWHERE email IS NULL;' },
  { id: 'functions', label: 'Funciones de texto', level: 'Intermedio', sql: "SELECT customer_id, CONCAT(UPPER(last_name), ', ', first_name) AS display_name, COALESCE(email, 'Sin email') AS contact\nFROM Customers\nORDER BY customer_id;" },
  { id: 'substring', label: 'SUBSTRING y fecha', level: 'Intermedio', sql: 'SELECT name, SUBSTRING(name, 1, 4) AS short_name, CURRENT_DATE AS today\nFROM Products;' },
  { id: 'pagination', label: 'OFFSET / FETCH', level: 'Intermedio', sql: 'SELECT product_id, name, price\nFROM Products\nORDER BY price DESC\nOFFSET 2 ROWS FETCH NEXT 3 ROWS ONLY;' },
  { id: 'right', label: 'RIGHT JOIN', level: 'Avanzado', sql: 'SELECT c.first_name, o.order_id, o.status\nFROM Customers c\nRIGHT JOIN Orders o ON c.customer_id = o.customer_id;' },
  { id: 'full', label: 'FULL JOIN', level: 'Avanzado', sql: 'SELECT c.first_name, o.order_id, o.status\nFROM Customers c\nFULL JOIN Orders o ON c.customer_id = o.customer_id;' },
  { id: 'update', label: 'UPDATE', level: 'Intermedio', sql: "UPDATE Products\nSET stock = 10\nWHERE name = 'Blender';" },
  { id: 'insert', label: 'INSERT', level: 'Intermedio', sql: "INSERT INTO Categories (category_id, name)\nVALUES (4, 'Books');" },
  { id: 'delete', label: 'DELETE', level: 'Intermedio', sql: "DELETE FROM Orders\nWHERE status = 'cancelled';" },
  { id: 'create', label: 'CREATE TABLE', level: 'Avanzado', sql: 'CREATE TABLE Suppliers (\n  supplier_id INT PRIMARY KEY,\n  name VARCHAR(100) NOT NULL\n);' },
  { id: 'alter', label: 'ALTER TABLE', level: 'Avanzado', sql: "ALTER TABLE Products ADD featured INT DEFAULT 0;" },
  { id: 'view', label: 'CREATE VIEW', level: 'Avanzado', sql: "CREATE VIEW ActiveOrders AS\nSELECT order_id, customer_id, total\nFROM Orders\nWHERE status = 'completed';" },
  { id: 'index', label: 'CREATE INDEX', level: 'Avanzado', sql: 'CREATE INDEX idx_products_category\nON Products (category_id);' },
  { id: 'truncate', label: 'TRUNCATE', level: 'Avanzado', sql: 'TRUNCATE TABLE Employees;' },
  { id: 'drop', label: 'DROP TABLE', level: 'Avanzado', sql: 'DROP TABLE Employees;' }
];

export const concepts = [
  { term: 'SELECT', text: 'Elige las columnas que formaran el resultado.' },
  { term: 'WHERE', text: 'Filtra filas antes de agrupar o calcular agregados.' },
  { term: 'JOIN', text: 'Combina filas relacionadas de dos tablas.' },
  { term: 'GROUP BY', text: 'Reune filas que comparten uno o mas valores.' },
  { term: 'HAVING', text: 'Filtra grupos despues de calcular agregados.' },
  { term: 'NULL', text: 'Representa un dato ausente; se evalua con IS NULL.' },
  { term: 'PK / FK', text: 'Una clave primaria identifica; una foranea relaciona tablas.' },
  { term: 'INDEX', text: 'Estructura auxiliar que acelera busquedas a cambio de espacio y escritura.' },
  { term: 'VIEW', text: 'Consulta guardada que se comporta como una tabla virtual.' },
  { term: 'ACID', text: 'Atomicidad, consistencia, aislamiento y durabilidad hacen confiables las transacciones.' },
  { term: 'Data Types', text: 'INT, DECIMAL, VARCHAR, DATE y otros tipos restringen los valores permitidos.' },
  { term: 'Transaction', text: 'Agrupa operaciones como una unidad que puede confirmarse con COMMIT o revertirse con ROLLBACK.' },
  { term: 'Normalization', text: 'Organiza datos para reducir duplicacion y dependencias incorrectas mediante formas normales.' },
  { term: 'String Functions', text: 'CONCAT, SUBSTRING, LOWER y UPPER transforman texto dentro de una consulta.' },
  { term: 'Date Functions', text: 'CURRENT_DATE y CURRENT_TIMESTAMP obtienen la fecha o instante actual.' },
  { term: 'Wildcards', text: 'En LIKE, % representa cualquier secuencia y _ representa exactamente un caracter.' },
  { term: 'COALESCE', text: 'Devuelve el primer valor que no sea NULL de una lista.' },
  { term: 'DDL', text: 'CREATE, ALTER, DROP y TRUNCATE definen o modifican la estructura de los datos.' }
];
