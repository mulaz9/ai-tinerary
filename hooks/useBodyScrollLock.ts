"use client";

import { useEffect } from "react";

/**
 * Locks background page scrolling while a modal/dialog is open.
 * Restores the previous overflow value on close/unmount.
 */
export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [active]);
}
