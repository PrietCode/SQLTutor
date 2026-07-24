import React from 'react';
import { Icon } from '../ui/Icon';

export function ExplanationEmptyState() {
  return <div className="explanation placeholder"><Icon name="bulb" size={32} /><h3>Explicación contextual</h3><p>Ejecuta una consulta y selecciona una etapa para entender qué ocurre.</p></div>;
}
