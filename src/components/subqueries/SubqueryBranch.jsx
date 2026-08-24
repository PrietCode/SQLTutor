import React from 'react';
import { subqueryReturnText } from '../../visual/subqueryVisual';
import { SubqueryCycleDetail } from './SubqueryCycleDetail';
import { SubqueryStepCard } from './SubqueryStepCard';

export function SubqueryBranch({
  summary,
  steps,
  traced,
  compactHeader = false,
  hideCycleDetail = false,
}) {
  const currentSteps = traced ? steps.filter((step) => step.subqueryTraceId === summary.id) : steps;
  const correlated = summary.mode === 'correlated';
  return (
    <section
      className={`subquery-branch ${correlated ? 'correlated' : 'uncorrelated'} ${compactHeader ? 'carousel-slide' : ''}`}
    >
      <div className="subquery-branch-head">
        <strong>{correlated ? `Iteración N${summary.iteration}` : 'Evaluación única'}</strong>
        <span>{correlated ? 'subconsulta correlacionada' : 'subconsulta no correlacionada'}</span>
      </div>
      {!hideCycleDetail && <SubqueryCycleDetail summary={summary} />}
      {currentSteps.map((sqStep, sqIndex) => (
        <SubqueryStepCard
          step={sqStep}
          index={sqIndex}
          key={`${summary.id || 'legacy'}-${sqIndex}`}
        />
      ))}
      {!hideCycleDetail && (
        <div className="subquery-return">
          <span>Retorno a la condición</span>
          <code>{subqueryReturnText(summary)}</code>
        </div>
      )}
    </section>
  );
}
