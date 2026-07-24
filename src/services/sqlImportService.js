export const SQL_IMPORT_FILE_ACCEPT = '.sql,.txt';

export const isSqlImportFile = (fileName) => /\.(sql|txt)$/i.test(fileName);

export const normalizeImportedSql = (content) => String(content ?? '');

export const prepareImportedSql = (content) => normalizeImportedSql(content);
