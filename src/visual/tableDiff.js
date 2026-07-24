export const rowSignature = (row) => JSON.stringify(Object.entries(row).filter(([key]) => !key.startsWith('__')).sort(([a], [b]) => a.localeCompare(b)));

export const findDisplayColumn = (columns, qualified, short) => columns.find((column) => column.toLowerCase() === qualified.toLowerCase()) || columns.find((column) => column.toLowerCase() === short.toLowerCase());
