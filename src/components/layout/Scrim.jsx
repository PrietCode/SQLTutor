import React from 'react';

export function Scrim({ onClick }) {
  return (
    <button type="button" className="scrim" onClick={onClick} aria-hidden="true" tabIndex={-1} />
  );
}
