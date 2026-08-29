"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  useRive,
  useViewModel,
  useViewModelInstance,
  Layout,
  Fit,
} from "@rive-app/react-webgl2";
import {
  RIV_SRC,
  STATE_MACHINE,
  VM_SING_AMPLITUDE,
  VM_SING_GRAB_PERIOD,
  VM_SMOKING,
  VM_SMILE,
} from "./constants";

// 歌唱モード中の横振り(∩型の弧)1往復にかかる秒数。webKaguya.lua側のデフォルト(2.4秒)より
// 遅くしてゆったり動かす。値を大きくするほど遅くなる。
const SING_GRAB_PERIOD_SEC = 1.6;

type KaguyaCharacterProps = {
  placeholder?: ReactNode;
  /** 歌唱モード用の振幅の取得元（動画/音声の解析結果やシミュレーション波形など） */
  getAmplitude: () => number;
  /** たばこモードのオン/オフ */
  smoking?: boolean;
  /** スマイルモードのオン/オフ（目だけ笑顔になる） */
  smile?: boolean;
};

// かぐやのアートボードは正方形(1920x1920)で、ヤチヨより縦長のstage枠に対して
// 既定のFit.Containだと上下に大きく余白ができてキャラが小さく見える。
// Fit.Coverで枠の高さに合わせて拡大する（このキャラの体は横方向に十分余白があるため、
// 高さ基準で拡大しても左右がキャラにかかって見切れることはない）。
const KAGUYA_LAYOUT = new Layout({ fit: Fit.Cover });

// Fit.Cover だけではまだヤチヨより小さく見えるぶんを追加でズームする倍率。
// layoutScaleFactor は Fit.Layout 専用らしく効かなかったため、CSSで直接拡大する。
const KAGUYA_ZOOM = 1.5;

// 表示位置の縦方向オフセット。プラスで下にずれる（stage枠の高さに対する%）。
const KAGUYA_OFFSET_Y = "6.1%";

export function KaguyaCharacter({
  placeholder,
  getAmplitude,
  smoking = false,
  smile = false,
}: KaguyaCharacterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { rive, RiveComponent } = useRive({
    src: RIV_SRC,
    stateMachines: STATE_MACHINE,
    autoplay: true,
    layout: KAGUYA_LAYOUT,
  });

  // ViewModel をランタイムに明示バインドする。Rive エディタのプレビューは
  // Data パネルの既定ViewModelを自動で見てくれるが、@rive-app/react-webgl2 の
  // ランタイムはこれを呼ばない限りバインドしない（呼ばないと Luau スクリプト側の
  // context:viewModel() が nil のままになり、init() ごと失敗して何も動かなくなる）。
  const viewModel = useViewModel(rive, { useDefault: true });
  const vmInstance = useViewModelInstance(viewModel, {
    useDefault: true,
    rive,
  });

  /*
    歌唱モード: 振幅を毎フレーム ViewModel に書き込む。
    弾み・首かしげ(リズムをとる動き)は webKaguya.lua 側の自走オシレーターが
    singAmplitude(の有無)だけを見て自分で作る(ヤチヨの横揺れと同じ仕組み)。
  */
  useEffect(() => {
    if (!rive || !vmInstance) return;

    const ampProp = vmInstance.number(VM_SING_AMPLITUDE);
    let raf = 0;

    const tick = () => {
      if (ampProp) ampProp.value = getAmplitude();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [rive, vmInstance, getAmplitude]);

  // 歌唱モード中の横振りの速度(周期)を上書きする
  useEffect(() => {
    if (!vmInstance) return;
    const periodProp = vmInstance.number(VM_SING_GRAB_PERIOD);
    if (periodProp) periodProp.value = SING_GRAB_PERIOD_SEC;
  }, [vmInstance]);

  // たばこモードのオン/オフ
  useEffect(() => {
    if (!vmInstance) return;
    const smokingProp = vmInstance.number(VM_SMOKING);
    if (smokingProp) smokingProp.value = smoking ? 1 : 0;
  }, [vmInstance, smoking]);

  // スマイルモードのオン/オフ
  useEffect(() => {
    if (!vmInstance) return;
    const smileProp = vmInstance.number(VM_SMILE);
    if (smileProp) smileProp.value = smile ? 1 : 0;
  }, [vmInstance, smile]);

  // ウィンドウ全体のマウス操作を Rive キャンバスへ転送する。
  // Rive ランタイムはキャンバス上の "mousemove"/"mousedown"/"mouseup" しか購読していない
  // （PointerEvent ではなく MouseEvent を見ている）ため、document のイベントを
  // 合成 MouseEvent としてキャンバスに dispatch することで、枠外でも
  //   ・目／顔がカーソルを追う（mousemove）
  //   ・顔の近くをドラッグして頭を動かせる（mousedown → mousemove → mouseup）
  // が動くようにする。webKaguya.lua の pointerUp は頭ドラッグの終了検知に使うため、
  // YachiyoCharacter にはない mouseup の転送もここで行う。
  useEffect(() => {
    if (!rive) return;

    const forward =
      (type: "mousemove" | "mousedown" | "mouseup") => (e: MouseEvent) => {
        const canvas = containerRef.current?.querySelector("canvas");
        if (!canvas || e.target === canvas) return;
        canvas.dispatchEvent(
          new MouseEvent(type, {
            clientX: e.clientX,
            clientY: e.clientY,
            bubbles: false,
          }),
        );
      };

    const onMove = forward("mousemove");
    const onDown = forward("mousedown");
    const onUp = forward("mouseup");
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [rive]);

  return (
    <>
      {!rive && placeholder}
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden" }}
      >
        <div
          style={{
            position: "relative",
            top: "50%",
            left: "50%",
            width: `${KAGUYA_ZOOM * 100}%`,
            height: `${KAGUYA_ZOOM * 100}%`,
            transform: `translate(-50%, calc(-50% + ${KAGUYA_OFFSET_Y}))`,
          }}
        >
          <RiveComponent style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
    </>
  );
}
