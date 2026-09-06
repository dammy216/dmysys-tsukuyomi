"use client";

import { useCallback, useRef, useState, type PointerEvent } from "react";

/**
 * EditorLayout の Outline/Details/Sequence Editor の大きさを、境界線を
 * ドラッグして変えられるようにする(EditorViewport の3Dビューポート箱を
 * リサイズできるのと同じ操作感を、パネルの境界そのものにも持たせる)。
 * サイズは localStorage へ覚える。
 */

const STORAGE_PREFIX = "editor-gutter-";

function loadStored(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw == null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function saveStored(key: string, value: number) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(value));
  } catch {
    // プライベートブラウズ等で書けなくても致命的ではないので無視する
  }
}

export function useResizableEdge({
  storageKey,
  initial,
  min,
  max,
  /** ポインタの移動量(px)にこの符号を掛けてサイズへ足す(境界ごとに向きが違う) */
  sign,
  /** "x": clientX を見る(左右の境界)。"y": clientY を見る(上下の境界) */
  axis,
}: {
  storageKey: string;
  initial: number;
  min: number;
  max: number;
  sign: 1 | -1;
  axis: "x" | "y";
}) {
  const [size, setSize] = useState(() => loadStored(storageKey, initial));
  const dragRef = useRef<{ start: number; startSize: number } | null>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        start: axis === "x" ? e.clientX : e.clientY,
        startSize: size,
      };
    },
    [axis, size],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pos = axis === "x" ? e.clientX : e.clientY;
      const next = Math.min(
        Math.max(drag.startSize + (pos - drag.start) * sign, min),
        max,
      );
      setSize(next);
    },
    [axis, sign, min, max],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
      setSize((current) => {
        saveStored(storageKey, current);
        return current;
      });
    },
    [storageKey],
  );

  return { size, onPointerDown, onPointerMove, onPointerUp };
}
