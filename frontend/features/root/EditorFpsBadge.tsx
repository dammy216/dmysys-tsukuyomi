"use client";

import { useEffect, useState } from "react";

/**
 * 編集モード(EditorLayout)の3Dビューポート右上に置くFPS表示。
 * SceneStats(stats.js)は右上固定パネルで、Theatre のパネルは画面の
 * 絶対位置に浮くだけで実際の占有範囲を予測できず、CSSでの位置合わせでは
 * 重なりを避けきれなかったため編集モード中は隠している(SceneContents側)。
 * 代わりにビューポート内(=Theatreのパネルと重ならない場所)へ、
 * rAFの間隔から単純計算する独立した実装で出す(stats.jsとは連動しない)。
 */
function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let windowStart = performance.now();
    let rafId = requestAnimationFrame(function tick() {
      frames++;
      const now = performance.now();
      const elapsed = now - windowStart;
      // 0.5秒ぶん溜めてから更新(毎フレーム更新すると数字が読みにくい)
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        windowStart = now;
      }
      rafId = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(rafId);
  }, []);
  return fps;
}

export function EditorFpsBadge() {
  const fps = useFps();
  return (
    <div className="pointer-events-none absolute top-2 right-2 z-10 rounded-md bg-black/50 px-2 py-1 font-mono text-[0.75rem] text-white/70 tabular-nums">
      {fps} FPS
    </div>
  );
}
