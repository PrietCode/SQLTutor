import React from 'react';
import { parentStepDetail } from '../../visual/subqueryVisual';
import { DataTable } from '../tables/DataTable';
import { SubqueryFlow } from '../subqueries/SubqueryFlow';
import { JoinKeyNote } from './JoinKeyNote';
import { SubqueryDependencyNote } from './SubqueryDependencyNote';

export function JourneyStepCard({ step, displayIndex, focused, highlighted, showArrow, onSelect }) {
  const item = step.item;
  if (step.kind === 'subquery') {
    return <div className="flow-item" id={`visual-step-${step.id}`} key={step.id}>{showArrow && <div className="flow-arrow"><span>↓</span><small>{item.type}</small></div>}<article className={`stage-card accent-${item.accent} subquery-stage ${focused ? 'focused' : ''} ${highlighted ? 'jump-highlight' : ''}`} onClick={onSelect}><header><div className="stage-number">{displayIndex}</div><div><span className="clause-chip">{item.type}</span><h3>{item.title}</h3></div><strong>{item.count} {item.count === 1 ? 'ciclo' : 'ciclos'}</strong></header><p>{item.detail}</p><SubqueryFlow group={item.subqueryGroup} /></article></div>;
  }
  return <div className="flow-item" id={`visual-step-${step.id}`} key={step.id}>{showArrow && <div className="flow-arrow"><span>↓</span><small>{item.type}</small></div>}<article className={`stage-card accent-${item.accent} ${focused ? 'focused' : ''} ${highlighted ? 'jump-highlight' : ''}`} onClick={onSelect}><header><div className="stage-number">{displayIndex}</div><div><span className="clause-chip">{item.type}</span><h3>{item.title}</h3></div><strong>{item.count} {item.count === 1 ? 'fila' : 'filas'}</strong></header><p>{parentStepDetail(item)}</p><SubqueryDependencyNote step={item} /><DataTable rows={item.rows} compact compare={item.compare} /><JoinKeyNote compare={item.type === 'JOIN' ? item.compare : null} /></article></div>;
}
