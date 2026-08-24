import React from 'react';

export function CreateTableForm({ createSql, onCreateSqlChange, onSubmit, onCancel }) {
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(createSql);
  };

  return (
    <form onSubmit={handleSubmit} className="add-table-form">
      <label>Escribe SQL para crear tabla:</label>
      <textarea
        value={createSql}
        onChange={(e) => onCreateSqlChange(e.target.value)}
        spellCheck="false"
      />
      <div className="form-buttons">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="primary-button">
          Crear
        </button>
      </div>
    </form>
  );
}
