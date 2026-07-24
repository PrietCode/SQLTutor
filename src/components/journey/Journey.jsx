import React, { useMemo, useState } from 'react';
import { writtenOrderIndex } from '../../visual/visualSteps';
import { JourneyStepCard } from './JourneyStepCard';

export function Journey({ execution, visualSteps, activeStep, setActiveStep, showAll, setShowAll, stepMode, setStepMode, sql }) {
  const [orderMode, setOrderMode] = useState('logical');
  const [highlightedStep, setHighlightedStep] = useState(null);
  const orderedSteps = useMemo(() => execution ? visualSteps.map((step, index) => ({ step, visualIndex: index })).sort((a, b) => orderMode === 'logical' ? a.visualIndex - b.visualIndex : (writtenOrderIndex(sql, a.step.parentStep, a.step.originalIndex) + a.step.orderOffset) - (writtenOrderIndex(sql, b.step.parentStep, b.step.originalIndex) + b.step.orderOffset)) : [], [execution, orderMode, sql, visualSteps]);
  if (!execution) return <section className="welcome-state"><div className="welcome-graphic"><span>SELECT</span><i /><span>FROM</span><i /><span>WHERE</span></div><h2>Tu consulta se convertirá en un recorrido</h2><p>Elige un ejemplo o escribe SQL. Verás cómo cada cláusula transforma los datos.</p></section>;
  const activeVisibleIndex = Math.max(orderedSteps.findIndex((entry) => entry.visualIndex === activeStep), 0);
  const showAllSteps = showAll || orderMode === 'written';
  const visible = showAllSteps ? orderedSteps : orderedSteps.slice(activeVisibleIndex, activeVisibleIndex + 1);
  const navigateToStep = (step, visualIndex) => {
    setActiveStep(visualIndex);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const target = document.getElementById(`visual-step-${step.id}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        setHighlightedStep(step.id);
        window.setTimeout(() => setHighlightedStep((current) => current === step.id ? null : current), 1000);
      }, target ? 350 : 0);
    }));
  };
  return <section className="journey">
    <div className="section-title journey-title"><div><span className="eyebrow">RECORRIDO DE LA CONSULTA</span><h2>{orderMode === 'logical' ? 'Orden lógico de ejecución' : 'Orden escrito'}</h2></div><div className="journey-tools"><div className="order-switch" role="group" aria-label="Tipo de orden"><button className={orderMode === 'logical' ? 'active' : ''} onClick={() => setOrderMode('logical')}>Orden lógico</button><button className={orderMode === 'written' ? 'active' : ''} onClick={() => { setOrderMode('written'); setStepMode(false); setShowAll(true); }}>Orden escrito</button></div><span className="result-badge">{execution.message}</span></div></div>
    <div className="logical-order">{orderedSteps.map(({ step, visualIndex }, index) => <React.Fragment key={step.id}>{index > 0 && <i className="logical-order-arrow">→</i>}<button className={`${visualIndex === activeStep ? 'active' : index < activeVisibleIndex || showAllSteps ? 'done' : ''} ${step.kind === 'subquery' ? 'subquery-order-step' : ''}`} onClick={() => navigateToStep(step, visualIndex)}><span>{index + 1}</span>{step.item.type}</button></React.Fragment>)}</div>
    <div className="flow">{visible.map(({ step, visualIndex }, index) => {
      const displayIndex = showAllSteps ? index + 1 : activeVisibleIndex + 1;
      return <JourneyStepCard step={step} displayIndex={displayIndex} focused={visualIndex === activeStep || showAllSteps} highlighted={highlightedStep === step.id} showArrow={showAllSteps && index > 0} onSelect={() => setActiveStep(visualIndex)} key={step.id} />;
    })}</div>
    {!showAll && orderMode === 'logical' && <div className="step-controls"><button disabled={activeVisibleIndex === 0} onClick={() => setActiveStep(orderedSteps[activeVisibleIndex - 1]?.visualIndex ?? activeStep)}>Anterior</button><span>Paso {activeVisibleIndex + 1} de {orderedSteps.length}: {orderedSteps[activeVisibleIndex]?.step.item.type}</span><button disabled={activeVisibleIndex === orderedSteps.length - 1} onClick={() => setActiveStep(orderedSteps[activeVisibleIndex + 1]?.visualIndex ?? activeStep)}>Siguiente</button></div>}
  </section>;
}
