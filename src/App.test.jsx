import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import App from './App';

const runSql = async (user, sql) => {
  await user.type(screen.getByLabelText(/consulta sql/i), sql);
  await user.click(screen.getByRole('button', { name: /^Ejecutar$/i }));
};

const expectFocus = async (element) => {
  await waitFor(() => expect(document.activeElement).toBe(element));
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

    expect(await screen.findByText(/La sentencia SQL debe finalizar con punto y coma/i)).toBeTruthy();
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

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Historial de consultas/i })).toBeNull());
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

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Biblioteca SQL/i })).toBeNull());
    await expectFocus(libraryButton);
  });

  test('closes the nested table detail before the sandbox drawer on Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    const schemaButton = screen.getByRole('button', { name: /Abrir base de datos/i });

    await user.click(schemaButton);

    const schemaDialog = await screen.findByRole('dialog', { name: /Base de datos del sandbox/i });
    const schemaCloseButton = within(schemaDialog).getByRole('button', { name: /Cerrar base de datos/i });
    await expectFocus(schemaCloseButton);

    const customersButton = within(schemaDialog).getByRole('button', { name: /Ver detalle de tabla Customers/i });
    await user.click(customersButton);

    const detailDialog = await screen.findByRole('dialog', { name: /Detalle de tabla Customers/i });
    const detailCloseButton = within(detailDialog).getByRole('button', { name: /Cerrar detalle/i });
    await expectFocus(detailCloseButton);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Detalle de tabla Customers/i })).toBeNull());
    expect(screen.getByRole('dialog', { name: /Base de datos del sandbox/i })).toBeTruthy();
    await expectFocus(customersButton);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Base de datos del sandbox/i })).toBeNull());
    await expectFocus(schemaButton);
  });
});
