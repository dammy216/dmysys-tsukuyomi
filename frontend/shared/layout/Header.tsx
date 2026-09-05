"use client";

import { useSceneStore } from "@/features/root/store";

/** サイト共通ヘッダー。DMYSYSのロゴ+ワードマークを表示する（下部ControlBarと同じ近未来HUDデザイン） */
export function Header() {
  /*
    Theatre.js の編集モード中は隠す。編集モードでは画面をビューポートと
    パネル置き場に分けるので、画面左上へ固定されるこのヘッダーが
    Outline パネルの上に重なってしまうため。
  */
  const editorMode = useSceneStore((s) => s.editorMode);
  if (editorMode) return null;

  return (
    <header
      className="fixed top-[max(var(--header-offset),env(safe-area-inset-top))] left-[max(var(--header-offset),env(safe-area-inset-left))] z-30
        rounded-full p-0.5
        bg-[linear-gradient(90deg,var(--color-hud),#7c7ce6_50%,var(--color-hud))]
        shadow-[0_0_24px_rgb(93_227_230/0.35),0_10px_28px_rgb(0_0_0/0.35)]"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-hud-glass py-2 pr-[18px] pl-2.5 backdrop-blur-sm max-sm:py-1.5 max-sm:pr-3.5 max-sm:pl-2">
        <svg
          className="shrink-0 drop-shadow-[0_0_6px_rgb(93_227_230/0.7)]"
          width="26"
          height="26"
          viewBox="0 0 26 26"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M13 1.5L23.5 7.5V18.5L13 24.5L2.5 18.5V7.5L13 1.5Z"
            stroke="url(#dmysysGradient)"
            strokeWidth="1.6"
          />
          <path
            d="M13 8L18 11V17L13 20L8 17V11L13 8Z"
            stroke="#5de3e6"
            strokeWidth="1.2"
            opacity="0.8"
          />
          <circle cx="13" cy="13" r="2" fill="#5de3e6" />
          <defs>
            <linearGradient id="dmysysGradient" x1="2.5" y1="1.5" x2="23.5" y2="24.5">
              <stop offset="0" stopColor="#5de3e6" />
              <stop offset="1" stopColor="#7c7ce6" />
            </linearGradient>
          </defs>
        </svg>
        <span className="whitespace-nowrap text-[0.95rem] font-extrabold tracking-[0.18em] text-hud text-shadow-[0_0_12px_rgb(93_227_230/0.6)] max-sm:text-[0.8rem]">
          DMYSYS
        </span>
      </div>
    </header>
  );
}
