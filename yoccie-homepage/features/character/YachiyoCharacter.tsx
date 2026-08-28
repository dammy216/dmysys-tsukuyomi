"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  useRive,
  useViewModel,
  useViewModelInstance,
  Layout,
  Fit,
} from "@rive-app/react-webgl2";
import { ARTBOARD, RIV_SRC, STATE_MACHINE, VM_SING_AMPLITUDE } from "./constants";

// "ベース"アートボードは正方形(1025x1025)。既定のFit.Containだと、パネルの
// 短い方の辺だけを基準にキャラの大きさが決まるため、リサイズハンドルで
// 片方の辺だけ伸ばしても見た目の大きさが変わらない(余白が増減するだけ)。
// Fit.Coverにすると常に枠いっぱいに拡大されるので、どちらの辺をリサイズしても
// かぐや(KaguyaCharacter)と同様に追従して拡大縮小するようになる。
const YACHIYO_LAYOUT = new Layout({ fit: Fit.Cover });

type YachiyoCharacterProps = {
  onAmplitude?: (value: number) => void;
  placeholder?: ReactNode;
  /** 振幅の取得元（動画/音声の解析結果など） */
  getAmplitude: () => number;
};

export function YachiyoCharacter({
  onAmplitude,
  placeholder,
  getAmplitude,
}: YachiyoCharacterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { rive, RiveComponent } = useRive({
    src: RIV_SRC,
    artboard: ARTBOARD,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    layout: YACHIYO_LAYOUT,
  });

  const viewModel = useViewModel(rive, { useDefault: true });
  const vmInstance = useViewModelInstance(viewModel, {
    useDefault: true,
    rive,
  });

  // 振幅を毎フレーム ViewModel に書き込む
  useEffect(() => {
    if (!rive || !vmInstance) return;

    const ampProp = vmInstance.number(VM_SING_AMPLITUDE);
    let raf = 0;

    const tick = () => {
      const amp = getAmplitude();
      if (ampProp) ampProp.value = amp;
      onAmplitude?.(amp);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [rive, vmInstance, getAmplitude, onAmplitude]);

  // ウィンドウ全体のマウス操作を Rive キャンバスへ転送する。
  // Rive ランタイムはキャンバス上の "mousemove" / "mousedown" しか購読していない
  // （PointerEvent ではなく MouseEvent を見ている）ため、document のイベントを
  // 合成 MouseEvent としてキャンバスに dispatch することで、枠外でも
  //   ・目／顔がカーソルを追う（mousemove）
  //   ・ダブルクリックでウインク、シングルクリックで口パク（mousedown）
  // が動くようにする。clientX/Y はそのまま渡せば Rive 側でキャンバス相対座標に
  // 変換され、枠外の座標は Luau の eyeOffset が距離に応じて扱う。
  useEffect(() => {
    if (!rive) return;

    const forward = (type: "mousemove" | "mousedown") => (e: MouseEvent) => {
      const canvas = containerRef.current?.querySelector("canvas");
      // 実イベントが既にキャンバス上で発生している場合は Rive が直接受け取るので
      // 二重発火（＝1クリックが2回 pointerDown 扱いになる誤ウインク）を防ぐ。
      if (!canvas || e.target === canvas) return;
      canvas.dispatchEvent(
        new MouseEvent(type, {
          clientX: e.clientX,
          clientY: e.clientY,
          // 合成イベントが document まで伝播してこのハンドラを再帰呼びしないよう false。
          bubbles: false,
        }),
      );
    };

    const onMove = forward("mousemove");
    const onDown = forward("mousedown");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
    };
  }, [rive]);

  return (
    <>
      {!rive && placeholder}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }}>
        <RiveComponent style={{ width: "100%", height: "100%" }} />
      </div>
    </>
  );
}
