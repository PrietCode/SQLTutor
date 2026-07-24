import React, { useState } from 'react';
import { subqueryReturnText } from '../../visual/subqueryVisual';
import { ExternalIterationTable } from './ExternalIterationTable';
import { SubqueryBranch } from './SubqueryBranch';
import { SubqueryCycleDetail } from './SubqueryCycleDetail';

export function CorrelatedSubqueryCarousel({ summaries, steps, traced, externalRows }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showInternalTrace, setShowInternalTrace] = useState(false);
  const total = summaries.length;
  const index = Math.min(activeIndex, Math.max(total - 1, 0));
  const summary = summaries[index];
  if (!summary) return null;
  return <div className="subquery-carousel"><div className="subquery-carousel-head"><button className="subquery-nav-button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); setActiveIndex((value) => Math.max(value - 1, 0)); }} aria-label="Iteración anterior">←</button><div className="subquery-carousel-title"><strong>Iteración {index + 1} de {total}</strong><span>El motor ejecuta esta subconsulta por cada fila externa antes de avanzar al siguiente paso de la regla.</span></div><button className="subquery-nav-button" disabled={index === total - 1} onClick={(event) => { event.stopPropagation(); setActiveIndex((value) => Math.min(value + 1, total - 1)); }} aria-label="Iteración siguiente">→</button></div><div className="subquery-carousel-body"><div className="subquery-cycle-shell"><SubqueryCycleDetail summary={summary} /><div className="subquery-return"><span>Resultado del ciclo</span><code>{subqueryReturnText(summary)}</code></div><button className="subquery-trace-toggle" onClick={(event) => { event.stopPropagation(); setShowInternalTrace((value) => !value); }}>{showInternalTrace ? 'Ocultar ejecución interna' : 'Ver ejecución interna'}</button>{showInternalTrace && <SubqueryBranch summary={summary} steps={steps} traced={traced} compactHeader hideCycleDetail />}</div><ExternalIterationTable rows={externalRows} activeIndex={index} summary={summary} /></div><p className="subquery-carousel-note">Aunque navegues las iteraciones, conceptualmente el motor repite este ciclo fila externa → subconsulta → retorno → decisión antes de pasar a SELECT u ORDER BY.</p></div>;
}
