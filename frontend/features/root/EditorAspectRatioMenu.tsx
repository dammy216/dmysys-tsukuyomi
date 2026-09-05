"use client";

import type { RefObject } from "react";
import type { EditorViewportHandle } from "./EditorViewport";

/**
 * よく見るデバイスの画面比率プリセット。選ぶと EditorViewport の箱を
 * その比率に合わせる(高さはユーザーが今リサイズしている高さのまま、
 * 幅をその比率から逆算する)。
 */
const PRESETS: { label: string; ratioW: number; ratioH: number }[] = [
  { label: "16:9(PC / 1920×1080)", ratioW: 16, ratioH: 9 },
  { label: "16:10(1920×1200)", ratioW: 16, ratioH: 10 },
  { label: "21:9(ウルトラワイド)", ratioW: 21, ratioH: 9 },
  { label: "4:3", ratioW: 4, ratioH: 3 },
  { label: "1:1", ratioW: 1, ratioH: 1 },
  { label: "9:16(スマホ縦)", ratioW: 9, ratioH: 16 },
];

const PLACEHOLDER = "画面比率";

export function EditorAspectRatioMenu({
  viewportRef,
  value,
  onSelect,
}: {
  viewportRef: RefObject<EditorViewportHandle | null>;
  /**
   * 現在有効なプリセットのラベル(選んだプリセット名をそのまま表示に使う)。
   * 手でリサイズしたら EditorLayout 側が null に戻し、プレースホルダー
   * 表示("画面比率")に戻る。
   */
  value: string | null;
  onSelect: (label: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        const preset = PRESETS.find((p) => p.label === e.target.value);
        if (!preset) return;
        viewportRef.current?.applyAspectRatio(preset.ratioW, preset.ratioH);
        onSelect(preset.label);
      }}
      aria-label={PLACEHOLDER}
      className="rounded-md border border-white/12 bg-white/6 px-2 py-1 text-[0.75rem] text-white/70 cursor-pointer hover:border-white/25 hover:text-white"
    >
      <option value="" disabled>
        {PLACEHOLDER}
      </option>
      {PRESETS.map((p) => (
        <option key={p.label} value={p.label} className="bg-[#12161c] text-white">
          {p.label}
        </option>
      ))}
    </select>
  );
}
