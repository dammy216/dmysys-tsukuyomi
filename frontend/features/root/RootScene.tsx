"use client";

import { useCallback, useEffect, useRef } from "react";
import { CharacterOverlay } from "@/features/character-overlay";
import { ControlBar } from "@/features/scene-controls";
import { useStarfallSong } from "@/features/starfall-sea";
import { useSceneRecorder } from "@/features/scene-recording";
import { RootCanvas } from "./RootCanvas";
import { useSceneStore } from "./store";

/**
 * ルート("/")ページ本体。UI 状態は useSceneStore に持ち、ここでは
 * 副作用フック(音・録画)の配線と3レイヤーの合成だけを行う。
 */
export function RootScene() {
  // 音の立ち上げ/停止に starfallSea を渡す必要があるので、ここだけ購読する
  const starfallSea = useSceneStore((s) => s.starfallSea);
  const setStarfallPlaying = useSceneStore((s) => s.setStarfallPlaying);

  /*
    星降る海の映像と音。映像はミュートで流し、音はボーカル／伴奏の
    2ステムを同時に鳴らす。ボーカルの音量はヤチヨの口パクにも使う。
    getSongCaptureStream は録画用の音声トラック(星降る海再生中のみ中身が入る)。
    playing は「3つを再生開始したか」。押すとほぼ即座に true になる。
  */
  const {
    videoRef: hologramVideoRef,
    playing: starfallPlaying,
    getAmplitude: getSongAmplitude,
    prepareCaptureAudio,
    getCaptureStream: getSongCaptureStream,
  } = useStarfallSong(starfallSea);

  /*
    再生開始状態をストアへ橋渡しする。3Dシーン(Canvas内)とヤチヨの歌唱は
    この starfallPlaying で駆動される(押すとほぼ即座に true になる)。
  */
  useEffect(() => {
    setStarfallPlaying(starfallPlaying);
  }, [starfallPlaying, setStarfallPlaying]);

  /*
    3D画面の録画。WebGLキャンバス(captureStream)＋星降る海の音声を webm に。
    キャラや下部バーは別DOMなので写らない = 「3D画面だけ」。
    解像度はウィンドウそのまま。綺麗に録りたいときはウィンドウを大きく or F11。
  */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getCanvas = useCallback(() => canvasRef.current, []);
  const recorder = useSceneRecorder({
    getCanvas,
    prepareAudio: prepareCaptureAudio,
    getAudioStream: getSongCaptureStream,
  });

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  return (
    <>
      <RootCanvas
        hologramVideoRef={hologramVideoRef}
        onCanvasReady={handleCanvasReady}
      />
      <CharacterOverlay getSongAmplitude={getSongAmplitude} />
      <ControlBar
        recorderSupported={recorder.supported}
        isRecording={recorder.isRecording}
        onToggleRecord={recorder.toggle}
      />
    </>
  );
}
