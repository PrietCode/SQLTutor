import React, { useState } from 'react';
import { concepts } from '../../data/concepts';
import { Icon } from '../ui/Icon';

export function LibraryDrawer({ open, onClose }) {
  const [search, setSearch] = useState('');
  const filtered = concepts.filter((item) => `${item.term} ${item.text}`.toLowerCase().includes(search.toLowerCase()));
  return <div id="biblioteca-sql" className={`library-drawer ${open ? 'open' : ''}`}><div className="drawer-head"><div><span className="eyebrow">BIBLIOTECA SQL</span><h2>Conceptos esenciales</h2></div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></div><input className="search" placeholder="Buscar concepto..." value={search} onChange={(e) => setSearch(e.target.value)} /><div className="library-grid">{filtered.map((item) => <article key={item.term}><strong>{item.term}</strong><p>{item.text}</p></article>)}</div></div>;
}
