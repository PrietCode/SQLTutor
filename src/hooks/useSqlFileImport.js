import { useRef, useState } from 'react';
import { SQL_IMPORT_FILE_ACCEPT, isSqlImportFile, prepareImportedSql } from '../services/sqlImportService';

const invalidFileMessage = 'Solo se pueden importar archivos .sql o .txt con instrucciones SQL.';

export function useSqlFileImport({ onImportSqlFile, onError }) {
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef(null);

  const clearImportMessage = () => setImportMessage('');
  const openImportFileDialog = () => fileInputRef.current?.click();

  const handleImportFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isSqlImportFile(file.name)) {
      onError(invalidFileMessage);
      clearImportMessage();
      event.target.value = '';
      return;
    }
    try {
      const content = prepareImportedSql(await file.text());
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
