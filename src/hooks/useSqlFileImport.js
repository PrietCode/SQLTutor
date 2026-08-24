import { useRef, useState } from 'react';
import {
  SQL_IMPORT_FILE_ACCEPT,
  SQL_IMPORT_MESSAGES,
  prepareImportedSql,
  validateSqlImportFile,
} from '../services/sqlImportService';

export function useSqlFileImport({ onImportSqlFile, onError }) {
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef(null);

  const clearImportMessage = () => setImportMessage('');
  const openImportFileDialog = () => fileInputRef.current?.click();

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = '';
      return;
    }
    try {
      validateSqlImportFile(file);
      let rawContent = '';
      try {
        rawContent = await file.text();
      } catch {
        throw new Error(SQL_IMPORT_MESSAGES.readError);
      }
      const content = prepareImportedSql(rawContent);
      const message = await onImportSqlFile(content, file.name);
      setImportMessage(message || '');
    } catch (err) {
      onError(err.message);
      clearImportMessage();
    } finally {
      event.target.value = '';
    }
  };

  return {
    fileInputRef,
    importMessage,
    sqlFileAccept: SQL_IMPORT_FILE_ACCEPT,
    clearImportMessage,
    openImportFileDialog,
    handleImportFileChange,
  };
}
