"use client";

import { useEffect, useState } from "react";

/**
 * EditorLayout の3Dビューポート右上に置くFPS表示(通常画面・編集モード共通)。
 * 以前は通常画面だけ stats.js(SceneStats)の右上固定パネルを使っていたが、
 * ビューポートを両画面で共通化したのに合わせてこちらへ統一した(stats.jsは
 * 廃止)。rAFの間隔から単純計算する独立した実装。
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
