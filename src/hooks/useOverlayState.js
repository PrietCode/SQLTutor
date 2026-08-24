import { useState } from 'react';

const scrollIntoView = (id, options) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView(options));
};

export function useOverlayState() {
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const overlayOpen = schemaOpen || libraryOpen || historyOpen;

  const closeOverlays = () => {
    setSchemaOpen(false);
    setLibraryOpen(false);
    setHistoryOpen(false);
  };
  const closeSchema = () => setSchemaOpen(false);
  const closeLibrary = () => setLibraryOpen(false);
  const closeHistory = () => setHistoryOpen(false);
  const openSchema = () => {
    setSchemaOpen(true);
    setLibraryOpen(false);
    setHistoryOpen(false);
  };
  const openHistory = () => {
    setSchemaOpen(false);
    setLibraryOpen(false);
    setHistoryOpen(true);
  };
  const openLibrary = () => {
    setSchemaOpen(false);
    setLibraryOpen(true);
    setHistoryOpen(false);
    scrollIntoView('biblioteca-sql', { behavior: 'smooth', block: 'nearest' });
  };
  const toggleExplain = () => {
    setExplainOpen((value) => {
      const next = !value;
      if (next) scrollIntoView('guia-contextual', { behavior: 'smooth', block: 'start' });
      return next;
    });
  };

  return {
    schemaOpen,
    explainOpen,
    historyOpen,
    libraryOpen,
    overlayOpen,
    openSchema,
    openLibrary,
    openHistory,
    closeSchema,
    closeLibrary,
    closeHistory,
    closeOverlays,
    toggleExplain,
  };
}
