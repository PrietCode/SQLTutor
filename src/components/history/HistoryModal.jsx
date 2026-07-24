import React from 'react';
import { Icon } from '../ui/Icon';

export function HistoryModal({ open, history, onClose, onSelect }) {
  if (!open) return null;
  return <div className="history-modal-layer" role="dialog" aria-modal="true" aria-label="Historial de consultas">
    <div className="table-detail-modal history-modal">
      <button className="detail-close-btn" onClick={onClose} aria-label="Cerrar historial"><Icon name="close" /></button>
      <div className="detail-header">
        <div><span className="eyebrow">HISTORIAL</span><h2><Icon name="history" /> Consultas recientes</h2></div>
        <span className="result-badge">{history.length} {history.length === 1 ? 'consulta' : 'consultas'}</span>
      </div>
      <div className="history-list modal-history-list">{history.length ? history.map((item, i) => <button key={`${item.time}-${i}`} onClick={() => { onSelect(item.sql); onClose(); }}><code>{item.sql.replace(/\s+/g, ' ').slice(0, 120)}</code><span>{item.time}</span></button>) : <p className="muted">Todavía no ejecutaste consultas.</p>}</div>
    </div>
  </div>;
}
