import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

interface UsePopoverMenuOptions {
  alignEnd?: boolean;
  deps?: readonly unknown[];
}

export function usePopoverMenu({ alignEnd = false, deps = [] }: UsePopoverMenuOptions = {}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const enterOnOpenRef = useRef(false);
  const spacePressedRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const trigger = triggerRef.current;
    const pop = popoverRef.current;
    const group = groupRef.current;
    if (!pop || !trigger || !group) return;

    const getMenuItems = () =>
      Array.from(group.querySelectorAll<HTMLButtonElement>('button')).filter(
        (btn) => !btn.disabled && btn.getAttribute('aria-disabled') !== 'true'
      );

    const positionPopoverFallback = () => {
      if (typeof CSS !== 'undefined' && CSS.supports('position-area: block-end')) return;
      const rect = trigger.getBoundingClientRect();
      const popRect = pop.getBoundingClientRect();
      const gap = 6;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const top =
        spaceBelow >= popRect.height || rect.top < popRect.height
          ? Math.min(rect.bottom + gap, Math.max(8, window.innerHeight - popRect.height - 8))
          : Math.max(8, rect.top - popRect.height - gap);
      const rawLeft = alignEnd ? rect.right - popRect.width : rect.left;
      const left = Math.min(
        Math.max(8, rawLeft),
        Math.max(8, window.innerWidth - popRect.width - 8)
      );
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;
    };

    const handleToggle = (event: Event) => {
      const nextOpen = (event as ToggleEvent).newState === 'open';
      setIsOpen(nextOpen);
      if (nextOpen) {
        positionPopoverFallback();
        if (enterOnOpenRef.current) {
          enterOnOpenRef.current = false;
          getMenuItems()[0]?.focus({ preventScroll: true });
        }
      }
    };

    const hasNativeFocusgroup = 'focusGroup' in HTMLElement.prototype;
    if (!hasNativeFocusgroup) {
      group.setAttribute('role', 'menu');
      group.querySelectorAll('button:not([role])').forEach((btn) => {
        btn.setAttribute('role', 'menuitem');
      });
    }

    const handleGroupKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        try {
          pop.hidePopover();
        } catch {
          // Ignore
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        try {
          pop.hidePopover();
        } catch {
          // Ignore
        }
        trigger.focus({ preventScroll: true });
        return;
      }
      if (hasNativeFocusgroup) return;
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = getMenuItems();
      if (items.length === 0) return;
      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : current < 0
              ? 0
              : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      event.preventDefault();
      event.stopImmediatePropagation();
      items[next].focus({ preventScroll: true });
    };

    const handleTriggerKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        enterOnOpenRef.current = true;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!pop.matches(':popover-open')) {
          trigger.click();
        } else {
          getMenuItems()[0]?.focus({ preventScroll: true });
        }
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const target = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('button');
      if (
        target &&
        group.contains(target) &&
        !target.disabled &&
        document.activeElement !== target
      ) {
        target.focus({ preventScroll: true });
      }
    };

    const handleDocumentFocusIn = (event: FocusEvent) => {
      if (!pop.matches(':popover-open')) return;
      const target = event.target as Node | null;
      if (target && !pop.contains(target) && target !== trigger) {
        try {
          pop.hidePopover();
        } catch {
          // Ignore
        }
      }
    };

    pop.addEventListener('toggle', handleToggle);
    group.addEventListener('keydown', handleGroupKeyDown, true);
    group.addEventListener('pointermove', handlePointerMove);
    trigger.addEventListener('keydown', handleTriggerKeyDown);
    document.addEventListener('focusin', handleDocumentFocusIn);

    return () => {
      pop.removeEventListener('toggle', handleToggle);
      group.removeEventListener('keydown', handleGroupKeyDown, true);
      group.removeEventListener('pointermove', handlePointerMove);
      trigger.removeEventListener('keydown', handleTriggerKeyDown);
      document.removeEventListener('focusin', handleDocumentFocusIn);
    };
  }, [alignEnd, ...deps]);

  const close = useCallback((delayMs: number = 0) => {
    const hide = () => {
      try {
        popoverRef.current?.hidePopover();
      } catch {
        // Ignore if already closed
      }
    };
    if (delayMs > 0) {
      setTimeout(hide, delayMs);
    } else {
      hide();
    }
  }, []);

  const onCheckboxKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === ' ') {
      spacePressedRef.current = true;
    }
  }, []);

  const closeAfterCheckboxAction = useCallback(() => {
    if (spacePressedRef.current) {
      spacePressedRef.current = false;
      return; // APG: Space toggles a menuitemcheckbox and leaves the menu open
    }
    close(250);
  }, [close]);

  const onTriggerClick = useCallback(() => {
    if (
      typeof HTMLButtonElement !== 'undefined' &&
      'commandForElement' in HTMLButtonElement.prototype
    ) {
      return;
    }
    try {
      popoverRef.current?.togglePopover();
    } catch {
      // Ignore if unsupported
    }
  }, []);

  return {
    triggerRef,
    popoverRef,
    groupRef,
    isOpen,
    close,
    closeAfterCheckboxAction,
    onCheckboxKeyDown,
    onTriggerClick,
  };
}
