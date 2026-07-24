import { act, renderHook } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { useSqlRuntime } from './useSqlRuntime';

describe('useSqlRuntime restoreSeedDatabase', () => {
  test('restores the seed database and clears execution state', () => {
    const { result } = renderHook(() => useSqlRuntime());

    expect(Object.keys(result.current.database)).toEqual(['Customers', 'Categories', 'Products', 'Orders', 'CustomerImports', 'Employees']);
    expect(result.current.database.Customers[0].first_name).toBe('Ana');

    act(() => {
      result.current.executeSandboxSql('CREATE TABLE SessionNotes (id INT PRIMARY KEY, title VARCHAR(40));');
    });
    act(() => {
      result.current.executeSandboxSql("UPDATE Customers SET first_name = 'Alicia' WHERE customer_id = 1;");
    });
    act(() => {
      result.current.deleteTable('Employees');
    });
    act(() => {
      result.current.executeQuery('SELECT first_name FROM Customers WHERE customer_id = 1;');
    });
    act(() => {
      result.current.showError('Error temporal');
    });

    expect(result.current.database.SessionNotes).toBeTruthy();
    expect(result.current.database.Customers[0].first_name).toBe('Alicia');
    expect(result.current.database.Employees).toBeUndefined();
    expect(result.current.execution).toBeTruthy();
    expect(result.current.error).toBe('Error temporal');

    act(() => {
      result.current.restoreSeedDatabase();
    });

    expect(result.current.database.SessionNotes).toBeUndefined();
    expect(result.current.database.Employees).toBeTruthy();
    expect(result.current.database.Customers[0].first_name).toBe('Ana');
    expect(result.current.database.Categories).toHaveLength(3);
    expect(result.current.execution).toBeNull();
    expect(result.current.error).toBe('');
  });
});
