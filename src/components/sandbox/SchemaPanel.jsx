import React, { useState } from 'react';
import { useBlockingOverlayAccessibility } from '../../hooks/useBlockingOverlayAccessibility';
import { Icon } from '../ui/Icon';
import { CreateTableForm } from './CreateTableForm';
import { TableDetailModal } from './TableDetailModal';

function RestoreDatabaseDialog({ open, onCancel, onConfirm }) {
  const dialogRef = useBlockingOverlayAccessibility(open, onCancel);

  if (!open) return null;
  return (
    <div
      ref={dialogRef}
      className="table-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-database-title"
      aria-describedby="restore-database-description"
      tabIndex={-1}
      onClick={onCancel}
    >
      <div
        className="table-detail-modal history-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-header">
          <div>
            <span className="eyebrow">ACCION DESTRUCTIVA</span>
            <h2 id="restore-database-title">
              <Icon name="database" /> Restaurar base de ejemplo
            </h2>
          </div>
        </div>
        <section className="detail-card" id="restore-database-description">
          <p className="muted">
            Se eliminaran las tablas creadas, se descartaran los cambios de datos y se recuperara la
            base inicial. Esta accion no puede deshacerse dentro de la sesion.
          </p>
        </section>
        <div className="form-buttons">
          <button type="button" className="ghost-button" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={onConfirm}>
            Restaurar base
          </button>
        </div>
      </div>
    </div>
  );
}

export function SchemaPanel({
  database,
  open,
  onClose,
  onCreateTable,
  onDeleteTable,
  onRestoreDatabase,
}) {
  const [selectedTable, setSelectedTable] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const panelRef = useBlockingOverlayAccessibility(open, onClose);
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
  const cancelRestoreDatabase = () => setRestoreDialogOpen(false);
  const confirmRestoreDatabase = () => {
    onRestoreDatabase();
    setSelectedTable(null);
    setRestoreDialogOpen(false);
  };

  return (
    <aside
      ref={panelRef}
      className={`side-panel schema-panel ${open ? 'open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Base de datos del sandbox"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : ''}
      tabIndex={-1}
    >
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SANDBOX LOCAL</span>
          <h2>
            <Icon name="database" /> Base de datos
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Cerrar base de datos"
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="muted">Los cambios viven solo en esta pestaña.</p>

      <div className="schema-actions">
        <button
          type="button"
          className="secondary-button add-table-btn"
          onClick={() => setIsCreateOpen(!isCreateOpen)}
          aria-expanded={isCreateOpen}
        >
          {isCreateOpen ? 'Cancelar' : '+ Nueva Tabla (SQL)'}
        </button>
      </div>

      {isCreateOpen && (
        <CreateTableForm
          createSql={createSql}
          onCreateSqlChange={setCreateSql}
          onSubmit={handleCreateTable}
          onCancel={() => setIsCreateOpen(false)}
        />
      )}

      <div className="schema-actions">
        <button
          type="button"
          className="secondary-button add-table-btn"
          onClick={() => setRestoreDialogOpen(true)}
          aria-haspopup="dialog"
        >
          Restaurar base de ejemplo
        </button>
      </div>

      <div className="schema-list">
        {Object.entries(database).map(([name, rows]) => {
          const isSelected = selectedTable === name;
          return (
            <div className={`schema-card ${isSelected ? 'expanded' : ''}`} key={name}>
              <div className="schema-card-header">
                <button
                  type="button"
                  className="expand-toggle-btn"
                  onClick={() => setSelectedTable(name)}
                  aria-label={`Ver detalle de tabla ${name}`}
                >
                  <span>
                    <Icon name="table" size={16} />
                    {name}
                  </span>
                  <small>{rows.length} filas</small>
                  <Icon name="chevron" size={15} />
                </button>
                <button
                  type="button"
                  className="delete-table-btn"
                  onClick={() => handleDeleteTable(name)}
                  title={`Borrar tabla ${name}`}
                  aria-label={`Borrar tabla ${name}`}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedTable && database[selectedTable] && (
        <TableDetailModal
          tableName={selectedTable}
          rows={database[selectedTable]}
          onClose={() => setSelectedTable(null)}
        />
      )}
      <RestoreDatabaseDialog
        open={restoreDialogOpen}
        onCancel={cancelRestoreDatabase}
        onConfirm={confirmRestoreDatabase}
      />

      <div className="sandbox-note">
        <Icon name="bulb" />
        <div>
          <strong>Entorno seguro</strong>
          <span>Los cambios y tablas nuevas viven solo en esta sesión.</span>
        </div>
      </div>
    </aside>
  );
}
