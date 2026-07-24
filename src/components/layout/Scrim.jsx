import React from 'react';

export function Scrim({ onClick }) {
  return <button className="scrim" onClick={onClick} aria-label="Cerrar ventana" />;
}
