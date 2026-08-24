import React from 'react';
import { JoinKeyNote } from '../journey/JoinKeyNote';
import { DataTable } from '../tables/DataTable';

export function SubqueryStepCard({ step, index }) {
  return (
    <div
      className="subquery-flow-item"
      key={`${step.subqueryTraceId || 'legacy'}-${step.type}-${index}`}
    >
      {index > 0 && (
        <div className="flow-arrow">
          <span>↓</span>
          <small>{step.type}</small>
        </div>
      )}
      <article className={`stage-card accent-${step.accent} subquery-card`}>
        <header>
          <div className="stage-number">{index + 1}</div>
          <div>
            <span className="clause-chip">{step.type}</span>
            <h3>{step.title}</h3>
          </div>
          <strong>
            {step.count} {step.count === 1 ? 'fila' : 'filas'}
          </strong>
        </header>
        <p>{step.detail}</p>
        <DataTable rows={step.rows} compact compare={step.compare} />
        <JoinKeyNote compare={step.type === 'JOIN' ? step.compare : null} />
      </article>
    </div>
  );
}
