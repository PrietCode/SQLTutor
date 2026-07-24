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
  CustomerImports: table([
    { import_id: 9001, customer_id: 1, source: 'web' },
    { import_id: 9002, customer_id: 99, source: 'legacy' },
    { import_id: 9003, customer_id: null, source: 'manual' }
  ], ['import_id', 'customer_id', 'source'], { import_id: 'INT', customer_id: 'INT', source: 'VARCHAR(40)' }, [{ type: 'PRIMARY KEY', columns: ['import_id'] }]),
  Employees: table([
    { employee_id: 1, name: 'Laura Perez', department: 'Ventas', salary: 950000, manager_id: null },
    { employee_id: 2, name: 'Mateo Ruiz', department: 'Tecnologia', salary: 1350000, manager_id: null },
    { employee_id: 3, name: 'Sofia Diaz', department: 'Ventas', salary: 1020000, manager_id: 1 }
  ], ['employee_id', 'name', 'department', 'salary', 'manager_id'], { employee_id: 'INT', name: 'VARCHAR(100)', department: 'VARCHAR(80)', salary: 'DECIMAL(12,2)', manager_id: 'INT' }, [{ type: 'PRIMARY KEY', columns: ['employee_id'] }])
});
