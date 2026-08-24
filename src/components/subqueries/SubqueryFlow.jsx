import React from 'react';
import { buildSubqueryGroups } from '../../visual/subqueryVisual';
import { CorrelatedSubqueryCarousel } from './CorrelatedSubqueryCarousel';
import { SubqueryBranch } from './SubqueryBranch';

function SubqueryQueryBlock({ group }) {
  const query = group.summaries.find((summary) => summary.innerSql)?.innerSql;
  if (!query) return null;
  return (
    <div className="subquery-query-block">
      <strong>Consulta interna</strong>
      <code>{query}</code>
    </div>
  );
}

function SubqueryGroupFlow({ group }) {
  const correlatedSummaries = group.summaries.filter((summary) => summary.mode === 'correlated');
  const plainSummaries = group.summaries.filter((summary) => summary.mode !== 'correlated');
  return (
    <div className="subquery-nested standalone">
      <div className="subquery-label">↳ Subconsulta</div>
      <SubqueryQueryBlock group={group} />
      {correlatedSummaries.length ? (
        <CorrelatedSubqueryCarousel
          summaries={correlatedSummaries}
          steps={group.steps}
          traced={group.traced}
          externalRows={group.externalRows}
        />
      ) : (
        plainSummaries.map((summary, summaryIndex) => (
          <SubqueryBranch
            summary={summary}
            steps={group.steps}
            traced={group.traced}
            key={summary.id || summaryIndex}
          />
        ))
      )}
    </div>
  );
}

export function SubqueryFlow({ compare, group }) {
  const groups = group ? [group] : buildSubqueryGroups(compare);
  if (!groups.length) return null;
  return (
    <>
      {groups.map((item) => (
        <SubqueryGroupFlow group={item} key={item.key} />
      ))}
    </>
  );
}
