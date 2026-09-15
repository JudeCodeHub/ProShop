"use client";

import { useEffect, useRef } from "react";

const MAX_KEY_GAP_MS = 50;
const MIN_CODE_LENGTH = 4;

function isEditable(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function useBarcodeScanner(onScan) {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let buffer = "";
    let lastKeyAt = 0;

    function handleKeyDown(event) {
      if (isEditable(event.target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === "Enter") {
        if (buffer.length >= MIN_CODE_LENGTH) {
          event.preventDefault();
          onScanRef.current(buffer);
        }
        buffer = "";
        return;
      }
      if (event.key.length !== 1) {
        return;
      }
      const now = performance.now();
      buffer = now - lastKeyAt > MAX_KEY_GAP_MS ? event.key : buffer + event.key;
      lastKeyAt = now;
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
