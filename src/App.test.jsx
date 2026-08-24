import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import App from './App';
import { SQL_IMPORT_MAX_BYTES } from './services/sqlImportService';

const runSql = async (user, sql) => {
  await user.type(screen.getByLabelText(/consulta sql/i), sql);
  await user.click(screen.getByRole('button', { name: /^Ejecutar$/i }));
};

const replaceSqlAndRun = async (user, sql) => {
  const editor = screen.getByLabelText(/consulta sql/i);
  fireEvent.change(editor, { target: { value: sql } });
  await user.click(screen.getByRole('button', { name: /^Ejecutar$/i }));
  return editor;
};

const openSandbox = async (user) => {
  const schemaButton = screen.getByRole('button', { name: /Abrir base de datos/i });
  await user.click(schemaButton);
  return {
    schemaButton,
    schemaDialog: await screen.findByRole('dialog', { name: /Base de datos del sandbox/i }),
  };
};

const openRestoreDialog = async (user, schemaDialog) => {
  const restoreButton = within(schemaDialog).getByRole('button', {
    name: /Restaurar base de ejemplo/i,
  });
  await user.click(restoreButton);
  return {
    restoreButton,
    restoreDialog: await screen.findByRole('dialog', { name: /Restaurar base de ejemplo/i }),
  };
};

const expectFocus = async (element) => {
  await waitFor(() => expect(document.activeElement).toBe(element));
};

const importInput = (container) => {
  const input = container.querySelector('input[type="file"]');
  expect(input).toBeTruthy();
  return input;
};

const sqlFile = ({ name = 'import.sql', content = '', size, text } = {}) => {
  const file = new File([content], name, { type: 'text/plain' });
  if (size != null) Object.defineProperty(file, 'size', { value: size });
  if (text) Object.defineProperty(file, 'text', { value: text });
  return file;
};

describe('App SQL flows', () => {
  test('renders the editor and initial journey state', () => {
    render(<App />);

    expect(screen.getByLabelText(/consulta sql/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Ejecutar$/i })).toBeTruthy();
    expect(screen.getByText(/Tu consulta se convert/i)).toBeTruthy();
  });

  test('executes a valid query and shows the result', async () => {
    const user = userEvent.setup();
    render(<App />);

    await runSql(user, 'SELECT first_name FROM Customers WHERE customer_id = 1;');

    expect((await screen.findAllByText('Ana')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 filas devueltas/i).length).toBeGreaterThan(0);
  });

  test('shows an error for an invalid query', async () => {
    const user = userEvent.setup();
    render(<App />);

    await runSql(user, 'SELECT first_name FROM Customers');

    expect(
      await screen.findByText(/La sentencia SQL debe finalizar con punto y coma/i)
    ).toBeTruthy();
  });

  test('reset clears editor and execution without restoring the temporary database', async () => {
    const user = userEvent.setup();
    render(<App />);
    const editor = screen.getByLabelText(/consulta sql/i);

    await runSql(user, "INSERT INTO Categories (category_id, name) VALUES (4, 'Books');");
    expect((await screen.findAllByText('Books')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Reset/i }));
    expect(editor.value).toBe('');
    expect(screen.getByText(/Tu consulta se convert/i)).toBeTruthy();

    await runSql(user, 'SELECT name FROM Categories WHERE category_id = 4;');

    expect((await screen.findAllByText('Books')).length).toBeGreaterThan(0);
  });

  test('adds successful executions to the history', async () => {
    const user = userEvent.setup();
    render(<App />);
    const sql = 'SELECT first_name FROM Customers WHERE customer_id = 1;';

    await runSql(user, sql);
    await user.click(screen.getByRole('button', { name: /Abrir historial/i }));

    const dialog = await screen.findByRole('dialog', { name: /Historial de consultas/i });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(sql)).toBeTruthy();
  });

  test('traps focus in the history modal, closes with Escape, and restores focus', async () => {
    const user = userEvent.setup();
    render(<App />);
    const historyButton = screen.getByRole('button', { name: /Abrir historial/i });

    await user.click(historyButton);

    const dialog = await screen.findByRole('dialog', { name: /Historial de consultas/i });
    const closeButton = within(dialog).getByRole('button', { name: /Cerrar historial/i });
    await expectFocus(closeButton);

    await user.tab();
    expect(document.activeElement).toBe(closeButton);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Historial de consultas/i })).toBeNull()
    );
    await expectFocus(historyButton);
  });

  test('exposes the library drawer as a blocking dialog and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const libraryButton = screen.getByRole('button', { name: /Abrir Biblioteca SQL/i });

    await user.click(libraryButton);

    const dialog = await screen.findByRole('dialog', { name: /Biblioteca SQL/i });
    const closeButton = within(dialog).getByRole('button', { name: /Cerrar biblioteca/i });
    const searchInput = within(dialog).getByLabelText(/Buscar concepto/i);
    await expectFocus(closeButton);

    await user.tab();
    expect(document.activeElement).toBe(searchInput);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Biblioteca SQL/i })).toBeNull()
    );
    await expectFocus(libraryButton);
  });

  test('closes the nested table detail before the sandbox drawer on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const schemaButton = screen.getByRole('button', { name: /Abrir base de datos/i });

    await user.click(schemaButton);

    const schemaDialog = await screen.findByRole('dialog', { name: /Base de datos del sandbox/i });
    const schemaCloseButton = within(schemaDialog).getByRole('button', {
      name: /Cerrar base de datos/i,
    });
    await expectFocus(schemaCloseButton);

    const customersButton = within(schemaDialog).getByRole('button', {
      name: /Ver detalle de tabla Customers/i,
    });
    await user.click(customersButton);

    const detailDialog = await screen.findByRole('dialog', { name: /Detalle de tabla Customers/i });
    const detailCloseButton = within(detailDialog).getByRole('button', { name: /Cerrar detalle/i });
    await expectFocus(detailCloseButton);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Detalle de tabla Customers/i })).toBeNull()
    );
    expect(screen.getByRole('dialog', { name: /Base de datos del sandbox/i })).toBeTruthy();
    await expectFocus(customersButton);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Base de datos del sandbox/i })).toBeNull()
    );
    await expectFocus(schemaButton);
  });

  test('opens the restore confirmation from the sandbox with cancel focused', async () => {
    const user = userEvent.setup();
    render(<App />);

    const { schemaDialog } = await openSandbox(user);
    const { restoreDialog } = await openRestoreDialog(user, schemaDialog);
    const cancelButton = within(restoreDialog).getByRole('button', { name: /Cancelar/i });

    expect(within(restoreDialog).getByText(/Se eliminaran las tablas creadas/i)).toBeTruthy();
    await expectFocus(cancelButton);
  });

  test('cancels database restoration and keeps sandbox changes', async () => {
    const user = userEvent.setup();
    render(<App />);

    await replaceSqlAndRun(user, 'CREATE TABLE TemporaryRestoreCancel (id INT PRIMARY KEY);');
    const { schemaDialog } = await openSandbox(user);
    expect(
      within(schemaDialog).getByRole('button', {
        name: /Ver detalle de tabla TemporaryRestoreCancel/i,
      })
    ).toBeTruthy();

    const { restoreButton, restoreDialog } = await openRestoreDialog(user, schemaDialog);
    await user.click(within(restoreDialog).getByRole('button', { name: /Cancelar/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Restaurar base de ejemplo/i })).toBeNull()
    );
    expect(
      within(schemaDialog).getByRole('button', {
        name: /Ver detalle de tabla TemporaryRestoreCancel/i,
      })
    ).toBeTruthy();
    await expectFocus(restoreButton);
  });

  test('Escape cancels restoration and leaves the sandbox open', async () => {
    const user = userEvent.setup();
    render(<App />);

    await replaceSqlAndRun(user, 'CREATE TABLE TemporaryRestoreEscape (id INT PRIMARY KEY);');
    const { schemaDialog } = await openSandbox(user);
    const { restoreButton } = await openRestoreDialog(user, schemaDialog);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Restaurar base de ejemplo/i })).toBeNull()
    );
    expect(screen.getByRole('dialog', { name: /Base de datos del sandbox/i })).toBeTruthy();
    expect(
      within(schemaDialog).getByRole('button', {
        name: /Ver detalle de tabla TemporaryRestoreEscape/i,
      })
    ).toBeTruthy();
    await expectFocus(restoreButton);
  });

  test('confirms restoration, keeps editor and history, and clears the visual execution', async () => {
    const user = userEvent.setup();
    render(<App />);
    const historySql = 'SELECT first_name FROM Customers WHERE customer_id = 1;';

    await replaceSqlAndRun(user, historySql);
    await replaceSqlAndRun(user, 'CREATE TABLE TemporaryRestoreConfirm (id INT PRIMARY KEY);');
    await replaceSqlAndRun(
      user,
      "UPDATE Customers SET first_name = 'Alicia' WHERE customer_id = 1;"
    );
    const editor = await replaceSqlAndRun(user, 'DROP TABLE Employees;');

    const { schemaDialog } = await openSandbox(user);
    expect(
      within(schemaDialog).getByRole('button', {
        name: /Ver detalle de tabla TemporaryRestoreConfirm/i,
      })
    ).toBeTruthy();
    expect(
      within(schemaDialog).queryByRole('button', { name: /Ver detalle de tabla Employees/i })
    ).toBeNull();

    const { restoreDialog } = await openRestoreDialog(user, schemaDialog);
    await user.click(within(restoreDialog).getByRole('button', { name: /^Restaurar base$/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Restaurar base de ejemplo/i })).toBeNull()
    );
    expect(
      within(schemaDialog).queryByRole('button', {
        name: /Ver detalle de tabla TemporaryRestoreConfirm/i,
      })
    ).toBeNull();
    expect(
      within(schemaDialog).getByRole('button', { name: /Ver detalle de tabla Employees/i })
    ).toBeTruthy();
    expect(editor.value).toBe('DROP TABLE Employees;');
    expect(screen.getByText(/Tu consulta se convert/i)).toBeTruthy();

    await user.click(within(schemaDialog).getByRole('button', { name: /Cerrar base de datos/i }));
    await replaceSqlAndRun(user, historySql);

    expect((await screen.findAllByText('Ana')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Alicia')).toBeNull();

    await user.click(screen.getByRole('button', { name: /Abrir historial/i }));
    expect(
      within(await screen.findByRole('dialog', { name: /Historial de consultas/i })).getByText(
        historySql
      )
    ).toBeTruthy();
  });

  test('Reset preserves database changes while restore returns to the seed database', async () => {
    const user = userEvent.setup();
    render(<App />);

    await replaceSqlAndRun(user, "INSERT INTO Categories (category_id, name) VALUES (4, 'Books');");
    expect((await screen.findAllByText('Books')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: /Reset/i }));
    await replaceSqlAndRun(user, 'SELECT name FROM Categories WHERE category_id = 4;');
    expect((await screen.findAllByText('Books')).length).toBeGreaterThan(0);

    const { schemaDialog } = await openSandbox(user);
    const { restoreDialog } = await openRestoreDialog(user, schemaDialog);
    await user.click(within(restoreDialog).getByRole('button', { name: /^Restaurar base$/i }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Restaurar base de ejemplo/i })).toBeNull()
    );
    await user.click(within(schemaDialog).getByRole('button', { name: /Cerrar base de datos/i }));

    await replaceSqlAndRun(user, 'SELECT name FROM Categories WHERE category_id = 4;');
    expect(screen.queryByText('Books')).toBeNull();
    expect(screen.getAllByText(/0 filas devueltas/i).length).toBeGreaterThan(0);
  });

  test('imports a valid SQL file and applies it to the temporary database', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const text = vi
      .fn()
      .mockResolvedValue("INSERT INTO Categories (category_id, name) VALUES (4, 'Books');");
    const input = importInput(container);

    await user.upload(input, sqlFile({ name: 'categories.sql', text }));

    expect(await screen.findByText(/categories.sql: 1 sentencias ejecutadas/i)).toBeTruthy();
    expect(text).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');

    await runSql(user, 'SELECT name FROM Categories WHERE category_id = 4;');

    expect((await screen.findAllByText('Books')).length).toBeGreaterThan(0);
  });

  test('rejects an oversized SQL file before reading it', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const text = vi.fn().mockResolvedValue('SELECT 1;');
    const input = importInput(container);

    await user.upload(input, sqlFile({ name: 'large.sql', size: SQL_IMPORT_MAX_BYTES + 1, text }));

    expect(await screen.findByText(/archivo SQL es demasiado grande/i)).toBeTruthy();
    expect(screen.getByText(/1 MB/i)).toBeTruthy();
    expect(text).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  test('rejects an empty SQL file without executing it', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const text = vi.fn().mockResolvedValue(' \n\t ');
    const input = importInput(container);

    await user.upload(input, sqlFile({ name: 'empty.sql', text }));

    expect(await screen.findByText(/archivo SQL esta vacio/i)).toBeTruthy();
    expect(screen.queryByText(/Archivo SQL importado/i)).toBeNull();
    expect(text).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  test('shows a readable message when the imported file cannot be read', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const text = vi.fn().mockRejectedValue(new Error('disk failure'));
    const input = importInput(container);

    await user.upload(input, sqlFile({ name: 'broken.sql', text }));

    expect(await screen.findByText(/No se pudo leer el archivo SQL/i)).toBeTruthy();
    expect(screen.queryByText(/disk failure/i)).toBeNull();
    expect(text).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('');
  });

  test('keeps SQL execution errors separate from file read errors', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const text = vi.fn().mockResolvedValue('SELECT first_name FROM Customers');
    const input = importInput(container);

    await user.upload(input, sqlFile({ name: 'invalid.sql', text }));

    expect(
      await screen.findByText(/El archivo SQL debe finalizar cada sentencia con punto y coma/i)
    ).toBeTruthy();
    expect(screen.queryByText(/No se pudo leer el archivo SQL/i)).toBeNull();
    expect(input.value).toBe('');
  });

  test('allows selecting the same imported file again after each attempt', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const text = vi
      .fn()
      .mockResolvedValue('SELECT first_name FROM Customers WHERE customer_id = 1;');
    const file = sqlFile({ name: 'same.sql', text });
    const input = importInput(container);

    await user.upload(input, file);
    expect(await screen.findByText(/same.sql: 1 sentencias ejecutadas/i)).toBeTruthy();
    expect(input.value).toBe('');

    await user.upload(input, file);

    await waitFor(() => expect(text).toHaveBeenCalledTimes(2));
    expect(input.value).toBe('');
  });
});
