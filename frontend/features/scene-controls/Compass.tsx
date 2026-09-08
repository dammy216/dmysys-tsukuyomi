"use client";

import { useEffect, useRef } from "react";
import { cameraHeading } from "./cameraHeading";

/*
  カメラの向いている方位。**北 = 0°**、時計回りに東90/南180/西270。
  初期状態はカメラが北(-Z)を向いているので 0°。

  placement:
   - "hud"    通常時。画面左上に方位磁石UI(N/E/S/W の目盛り + 針 + 中央に度数)
   - "editor" 編集モード。FPS バッジと同じ体裁の**数値だけ**(左上)。
              編集画面では方位磁石UIは出さない指定。

  値(cameraHeading.deg)は SceneContents の useFrame が書く。ここは
  requestAnimationFrame で読んで DOM を直接書き換える(毎フレーム更新なので
  state にすると重い)。
*/

type CompassProps = {
  placement?: "hud" | "editor";
};

export function Compass({ placement = "hud" }: CompassProps) {
  const needleRef = useRef<HTMLDivElement>(null);
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
      if (needleRef.current) {
        needleRef.current.style.transform = `rotate(${deg}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* 編集モード: FPS バッジ(EditorFpsBadge)と同じ体裁の数値だけ */
  if (placement === "editor") {
    return (
      <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-black/50 px-2 py-1 font-mono text-[0.75rem] text-white/70 tabular-nums">
        <span ref={labelRef}>0°</span>
      </div>
    );
  }

  /* 通常時: 画面左上の方位磁石UI */
  return (
    <div
      className="fixed z-30 select-none rounded-full p-0.5
        top-[max(var(--header-offset,1.25rem),env(safe-area-inset-top))]
        left-[max(var(--header-offset,1.25rem),env(safe-area-inset-left))]
        bg-[linear-gradient(135deg,var(--color-hud),#7c7ce6_60%,var(--color-hud))]
        shadow-[0_0_20px_rgb(93_227_230/0.3),0_10px_24px_rgb(0_0_0/0.45)]"
      aria-hidden="true"
    >
      <div className="relative grid h-16 w-16 place-items-center rounded-full bg-hud-glass backdrop-blur-sm">
        {/* 固定の方位目盛り */}
        <span className="absolute top-[3px] text-[10px] font-extrabold leading-none text-white/90">
          N
        </span>
        <span className="absolute right-[5px] text-[9px] font-bold leading-none text-hud/55">
          E
        </span>
        <span className="absolute bottom-[3px] text-[9px] font-bold leading-none text-hud/55">
          S
        </span>
        <span className="absolute left-[5px] text-[9px] font-bold leading-none text-hud/55">
          W
        </span>

        {/* 針(向いている方向を指す)。wrapper を回して中の三角を旋回させる */}
        <div
          ref={needleRef}
          className="pointer-events-none absolute inset-0"
          style={{ transformOrigin: "50% 50%", willChange: "transform" }}
        >
          <div
            className="absolute left-1/2 top-[6px] h-0 w-0 -translate-x-1/2
              border-x-[5px] border-b-[15px] border-x-transparent border-b-[#ffb454]
              drop-shadow-[0_0_4px_rgb(255_180_84/0.7)]"
          />
        </div>

        {/* 中央の方位(度)。北 = 0° */}
        <span
          ref={labelRef}
          className="relative text-[10px] font-extrabold tabular-nums tracking-tight text-white/90"
        >
          0°
        </span>
      </div>
    </div>
  );
}
