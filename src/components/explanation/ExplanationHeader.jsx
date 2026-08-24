import React from 'react';
import { Icon } from '../ui/Icon';

export function ExplanationHeader({ onClose }) {
  return (
    <div className="drawer-head explain-drawer-head">
      <div>
        <span className="eyebrow">EXPLICACIÓN</span>
        <h2>
          <Icon name="bulb" /> Guía contextual
        </h2>
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Cerrar explicación">
        <Icon name="close" />
      </button>
    </div>
  );
}
