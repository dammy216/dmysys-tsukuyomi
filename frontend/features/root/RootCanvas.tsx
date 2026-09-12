"use client";

import { type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { SceneContents } from "./SceneContents";
import { Credits } from "./Credits";
import { useSceneStore } from "./store";

/** ルート("/")の R3F <Canvas> ラッパ。シーンの状態は useSceneStore から SceneContents が直接読む */
export function RootCanvas({
  hologramVideoRef,
  replyVideoRef,
}: {
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
  /** Reply のホログラムに映す映像。useReplySong が用意する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const editorMode = useSceneStore((s) => s.editorMode);
  const showCredits = useSceneStore((s) => s.showCredits);

  /*
    通常画面・編集モードのどちらでも EditorLayout 側の3Dビューポート箱が
    大きさを決めるので、ここは親いっぱい(h-full)に広がるだけでよい
    (以前は通常画面だけ h-dvh で自前にフルスクリーンを取っていたが、
    ビューポート箱を通常画面にも使う指定になったので統一した)。
    背景は編集モードと同じ --color-ed-bg(黒系)に揃える(以前の紺色
    #0b1626 だと通常画面でビューポートを縮めたときだけ青みが出て
    見た目が揃わなかった、というユーザー指摘)。
    クレジットは編集モード中は常に隠す。通常画面では初期値非表示で、
    ヘッダーの「ライセンス」ボタン(showCredits)で表示を切り替える。
  */
  return (
    <div className="relative h-full w-full bg-ed-bg">
      {/*
        fov は迫力を出すため広めに取っている(50→68)。
        far は既定(1000)だと外周の山(MountainRing)が遠クリップで一部欠けるので
        広げてある。near〜far を離すと深度精度は落ちるが、実ジオメトリは半径150内・
        山は z-fight する相手がいないので問題ない。**この値の変更は Canvas の
        カメラ生成が一度きりなので、反映にはページのハードリロードが要る。**
      */}
      <Canvas camera={{ position: [0, 3, 11], fov: 68, far: 2000 }}>
        <SceneContents
          hologramVideoRef={hologramVideoRef}
          replyVideoRef={replyVideoRef}
        />
      </Canvas>

      {!editorMode && showCredits && <Credits />}
    </div>
  );
}
