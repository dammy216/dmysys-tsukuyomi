"use client";

import { useRef, useState, type PointerEvent } from "react";

/**
 * 編集パネルの数値入力欄1つ。Theatre.js Studio と同じく
 * **ラベルを左右にドラッグすると値が増減する**(細かい追い込みは
 * 入力欄に直接打てる)。
 *
 * 入力中は文字列をそのままローカルに持ち、数値として読めたときだけ
 * onChange へ流す。以前の実装は `Number(e.target.value)` を毎回そのまま
 * 書き込んでいたため、値を消して打ち直そうとした瞬間に `Number("")=0` が
 * 入って 0 に飛び、先頭に 0 が残った文字列(例 "00.5")になっていた。
 */

/** step の小数桁に合わせて丸める(0.1+0.2 の類の誤差を溜めない) */
function roundToStep(value: number, step: number) {
  const decimals = Math.min(
    6,
    Math.max(0, Math.ceil(-Math.log10(Math.abs(step) || 1))),
  );
  return Number(value.toFixed(decimals));
}

/** 表示用。浮動小数の桁あふれを見せない */
function formatValue(value: number) {
  if (!Number.isFinite(value)) return "0";
  return String(Number(value.toFixed(4)));
}

export function EditorNumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  /** 入力欄の step と、ラベルを1pxドラッグしたときの変化量 */
  step: number;
  onChange: (value: number) => void;
}) {
  /** 入力中の生テキスト。null = 入力中でない(value をそのまま表示) */
  const [draft, setDraft] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startValue: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onLabelPointerDown = (e: PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startValue: value };
    setDragging(true);
  };
  const onLabelPointerMove = (e: PointerEvent<HTMLSpanElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onChange(roundToStep(drag.startValue + (e.clientX - drag.startX) * step, step));
  };
  const endDrag = (e: PointerEvent<HTMLSpanElement>) => {
    if (!dragRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <label className="flex items-center gap-2">
      <span
        onPointerDown={onLabelPointerDown}
        onPointerMove={onLabelPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="ドラッグで増減"
        className={
          "w-[7.5rem] shrink-0 cursor-ew-resize truncate text-[0.7rem] select-none " +
          (dragging ? "text-ed-accent" : "text-ed-dim hover:text-ed-text")
        }
      >
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={draft ?? formatValue(value)}
        onChange={(e) => {
          setDraft(e.target.value);
          const parsed = Number(e.target.value);
          // 空・途中入力("-" や "1." など)のときは書き込まない
          if (e.target.value.trim() !== "" && Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => setDraft(null)}
        className={
          "min-w-0 flex-1 rounded-sm border border-ed-line bg-ed-row px-1.5 py-1 " +
          "font-mono text-[0.72rem] text-ed-text tabular-nums " +
          "focus:border-ed-accent focus:outline-none"
        }
      />
    </label>
  );
}
