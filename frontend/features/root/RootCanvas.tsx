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
  onCanvasReady,
}: {
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
  /** Reply のホログラムに映す映像。useReplySong が用意する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  /** WebGLキャンバスが用意できたら渡す。録画(captureStream)の対象にする */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}) {
  const editorMode = useSceneStore((s) => s.editorMode);

  /*
    編集モードでは EditorLayout 側がビューポートの矩形を決めるので、
    ここは親いっぱい(h-full)に広がるだけにする。通常時は今まで通り
    画面の高さいっぱい(h-dvh)。クレジットは編集の邪魔になるので隠す。
  */
  return (
    <div
      className={`relative w-full bg-[#0b1626] ${editorMode ? "h-full" : "h-dvh"}`}
    >
      {/*
        fov は迫力を出すため広めに取っている(50→68)。
        preserveDrawingBuffer は録画(canvas.captureStream)で確実にフレームを
        拾うために必要。描画コストはごく僅か。
      */}
      <Canvas
        camera={{ position: [0, 3, 11], fov: 68 }}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}
      >
        <SceneContents
          hologramVideoRef={hologramVideoRef}
          replyVideoRef={replyVideoRef}
        />
      </Canvas>

      {!editorMode && <Credits />}
    </div>
  );
}
