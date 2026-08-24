import React, { useState } from 'react';
import { concepts } from '../../data/concepts';
import { useBlockingOverlayAccessibility } from '../../hooks/useBlockingOverlayAccessibility';
import { Icon } from '../ui/Icon';

export function LibraryDrawer({ open, onClose }) {
  const [search, setSearch] = useState('');
  const drawerRef = useBlockingOverlayAccessibility(open, onClose);
  const filtered = concepts.filter((item) =>
    `${item.term} ${item.text}`.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div
      ref={drawerRef}
      id="biblioteca-sql"
      className={`library-drawer ${open ? 'open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Biblioteca SQL"
      aria-hidden={open ? undefined : true}
      inert={open ? undefined : ''}
      tabIndex={-1}
    >
      <div className="drawer-head">
        <div>
          <span className="eyebrow">BIBLIOTECA SQL</span>
          <h2>Conceptos esenciales</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Cerrar biblioteca"
        >
          <Icon name="close" />
        </button>
      </div>
      <input
        className="search"
        placeholder="Buscar concepto..."
        aria-label="Buscar concepto"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="library-grid">
        {filtered.map((item) => (
          <article key={item.term}>
            <strong>{item.term}</strong>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
