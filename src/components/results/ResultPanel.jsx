import React from 'react';
import { DataTable } from '../tables/DataTable';
import { Icon } from '../ui/Icon';

export function ResultPanel({ execution }) {
  return (
    <section className={`step-controller-card ${!execution ? 'empty' : ''}`}>
      <div className="controller-header">
        <div className="title-area">
          <Icon name="table" />
          <h3>Resultados</h3>
        </div>
        {execution && <span className="result-badge">{execution.result.length} filas</span>}
      </div>
      <div className="controller-body">
        {execution ? (
          <DataTable rows={execution.result} compact />
        ) : (
          <p className="muted">Ejecuta una consulta para ver los resultados aquí.</p>
        )}
      </div>
      {execution && (
        <div className="controller-footer">
          <span className="muted">{execution.message}</span>
        </div>
      )}
    </section>
  );
}
