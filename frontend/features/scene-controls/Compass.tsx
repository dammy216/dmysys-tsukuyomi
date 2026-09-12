"use client";

import { useEffect, useRef } from "react";
import { cameraHeading } from "./cameraHeading";

/*
  カメラの向いている方位。**北 = 0°**、時計回りに東90/南180/西270。
  初期状態はカメラが北(-Z)を向いているので 0°。FPSバッジ(EditorFpsBadge)と
  同じ体裁の数値だけをビューポート左上に出す(方位磁石UIは廃止済み。
  通常画面も編集画面と同じビューポートの見た目にする指定に合わせて
  EditorFpsBadge 側の体裁へ統一した)。

  値(cameraHeading.deg)は SceneContents の useFrame が書く。ここは
  requestAnimationFrame で読んで DOM を直接書き換える(毎フレーム更新なので
  state にすると重い)。
*/
export function Compass() {
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastLabel = "";
    const tick = () => {
      const deg = cameraHeading.deg;
      const label = `${Math.round(deg) % 360}°`;
      if (label !== lastLabel && labelRef.current) {
        labelRef.current.textContent = label;
        lastLabel = label;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-black/50 px-2 py-1 font-mono text-[0.75rem] text-white/70 tabular-nums">
      <span ref={labelRef}>0°</span>
    </div>
  );
}
