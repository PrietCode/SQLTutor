export const SQL_IMPORT_ALLOWED_EXTENSIONS = ['.sql', '.txt'];
export const SQL_IMPORT_FILE_ACCEPT = SQL_IMPORT_ALLOWED_EXTENSIONS.join(',');
export const SQL_IMPORT_MAX_BYTES = 1024 * 1024;
export const SQL_IMPORT_MAX_SIZE_LABEL = '1 MB';

export const SQL_IMPORT_MESSAGES = {
  invalidFile: 'Solo se pueden importar archivos .sql o .txt con instrucciones SQL.',
  tooLarge: `El archivo SQL es demasiado grande. El limite es ${SQL_IMPORT_MAX_SIZE_LABEL} para mantener la ejecucion en memoria.`,
  empty: 'El archivo SQL esta vacio. Agrega instrucciones SQL antes de importarlo.',
  readError: 'No se pudo leer el archivo SQL. Intenta seleccionarlo nuevamente.',
};

const fileExtension = (fileName) => {
  const name = String(fileName ?? '').trim();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex < 0) return '';
  return name.slice(dotIndex).toLowerCase();
};

export const isSqlImportFile = (fileName) =>
  SQL_IMPORT_ALLOWED_EXTENSIONS.includes(fileExtension(fileName));

export const validateSqlImportFile = (file) => {
  if (!isSqlImportFile(file?.name)) throw new Error(SQL_IMPORT_MESSAGES.invalidFile);
  if (typeof file.size === 'number' && file.size > SQL_IMPORT_MAX_BYTES)
    throw new Error(SQL_IMPORT_MESSAGES.tooLarge);
  return file;
};

export const normalizeImportedSql = (content) => String(content ?? '').replace(/^\uFEFF/, '');

export const prepareImportedSql = (content) => {
  const normalized = normalizeImportedSql(content);
  if (!normalized.trim()) throw new Error(SQL_IMPORT_MESSAGES.empty);
  return normalized;
};
