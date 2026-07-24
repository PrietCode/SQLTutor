import React, { useState } from 'react';
import { Icon } from '../ui/Icon';
import { CreateTableForm } from './CreateTableForm';
import { TableDetailModal } from './TableDetailModal';

export function SchemaPanel({ database, open, onClose, onCreateTable, onDeleteTable }) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createSql, setCreateSql] = useState(`CREATE TABLE Proveedores (
  id INT PRIMARY KEY,
  nombre VARCHAR(100),
  ciudad VARCHAR(50)
);`);

  const handleCreateTable = (sql) => {
    const createdTableName = onCreateTable(sql);
    if (createdTableName) {
      setIsCreateOpen(false);
      setSelectedTable(createdTableName);
    }
  };
  const handleDeleteTable = (name) => {
    if (onDeleteTable(name) && selectedTable === name) setSelectedTable(null);
  };

  return <aside className={`side-panel schema-panel ${open ? 'open' : ''}`}>
    <div className="panel-heading">
      <div>
        <span className="eyebrow">SANDBOX LOCAL</span>
        <h2><Icon name="database" /> Base de datos</h2>
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
    </div>
    <p className="muted">Los cambios viven solo en esta pestaña.</p>

    <div className="schema-actions">
      <button className="secondary-button add-table-btn" onClick={() => setIsCreateOpen(!isCreateOpen)}>
        {isCreateOpen ? 'Cancelar' : '+ Nueva Tabla (SQL)'}
      </button>
    </div>

    {isCreateOpen && <CreateTableForm createSql={createSql} onCreateSqlChange={setCreateSql} onSubmit={handleCreateTable} onCancel={() => setIsCreateOpen(false)} />}

    <div className="schema-list">
      {Object.entries(database).map(([name, rows]) => {
        const isSelected = selectedTable === name;
        return (
          <div className={`schema-card ${isSelected ? 'expanded' : ''}`} key={name}>
            <div className="schema-card-header">
              <button className="expand-toggle-btn" onClick={() => setSelectedTable(name)}>
                <span><Icon name="table" size={16} />{name}</span>
                <small>{rows.length} filas</small>
                <Icon name="chevron" size={15} />
              </button>
              <button className="delete-table-btn" onClick={() => handleDeleteTable(name)} title={`Borrar tabla ${name}`}>
                <Icon name="close" size={14} />
              </button>
            </div>
          </div>
        );
      })}
    </div>

    {selectedTable && database[selectedTable] && <TableDetailModal tableName={selectedTable} rows={database[selectedTable]} onClose={() => setSelectedTable(null)} />}

    <div className="sandbox-note">
      <Icon name="bulb" />
      <div>
        <strong>Entorno seguro</strong>
        <span>Los cambios y tablas nuevas viven solo en esta sesión.</span>
      </div>
    </div>
  </aside>;
}
