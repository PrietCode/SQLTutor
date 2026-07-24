import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',');

const overlayStack = [];

const removeFromStack = (id) => {
  const index = overlayStack.indexOf(id);
  if (index >= 0) overlayStack.splice(index, 1);
};

const isTopOverlay = (id) => overlayStack[overlayStack.length - 1] === id;

const focusableElements = (container) => {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => !element.hidden && !element.closest('[inert]'));
};

const focusElement = (element) => {
  if (element && typeof element.focus === 'function') element.focus({ preventScroll: true });
};

const scheduleFrame = (callback) => {
  if (typeof window === 'undefined') return undefined;
  if (typeof window.requestAnimationFrame === 'function') return window.requestAnimationFrame(callback);
  return window.setTimeout(callback, 0);
};

const cancelFrame = (frameId) => {
  if (frameId == null || typeof window === 'undefined') return;
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameId);
  else window.clearTimeout(frameId);
};

const focusInitialElement = (container) => {
  const [firstFocusable] = focusableElements(container);
  focusElement(firstFocusable || container);
};

export function useBlockingOverlayAccessibility(open, onClose) {
  const containerRef = useRef(null);
  const openerRef = useRef(null);
  const overlayId = useRef(Symbol('blocking-overlay'));
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;

    const id = overlayId.current;
    openerRef.current = document.activeElement;
    overlayStack.push(id);

    const focusFrame = scheduleFrame(() => {
      if (isTopOverlay(id)) focusInitialElement(containerRef.current);
    });

    const handleKeyDown = (event) => {
      if (!isTopOverlay(id)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      const focusable = focusableElements(container);

      if (!focusable.length) {
        event.preventDefault();
        focusElement(container);
        return;
      }

      const firstFocusable = focusable[0];
      const lastFocusable = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!container?.contains(activeElement)) {
        event.preventDefault();
        focusElement(event.shiftKey ? lastFocusable : firstFocusable);
        return;
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault();
        focusElement(lastFocusable);
        return;
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault();
        focusElement(firstFocusable);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown, true);
      removeFromStack(id);

      const opener = openerRef.current;
      if (opener?.isConnected) scheduleFrame(() => focusElement(opener));
    };
  }, [open]);

  return containerRef;
}
