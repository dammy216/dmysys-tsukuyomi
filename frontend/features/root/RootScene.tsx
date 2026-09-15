"use client";

import { useEffect } from "react";
import { CharacterOverlay } from "@/features/character-overlay";
import { useStarfallSong } from "@/features/starfall-sea";
import { useReplySong } from "@/features/reply";
import { EditorLayout } from "@/features/editor";
import { RootCanvas } from "./RootCanvas";
import { useSceneStore } from "./store";

/**
 * ルート("/")ページ本体。UI 状態は useSceneStore に持ち、ここでは
 * 副作用フック(音)の配線と2レイヤーの合成だけを行う。
 */
export function RootScene() {
  // 音の立ち上げ/停止にモードを渡す必要があるので、ここだけ購読する
  const starfallSea = useSceneStore((s) => s.starfallSea);
  const reply = useSceneStore((s) => s.reply);
  const setStarfallPlaying = useSceneStore((s) => s.setStarfallPlaying);
  const setReplyPlaying = useSceneStore((s) => s.setReplyPlaying);
  // 編集モード中はかぐや/ヤチヨパネルを隠す(EditorLayout がビューポート枠を出す)
  const editorMode = useSceneStore((s) => s.editorMode);

  /*
    星降る海の映像と音。映像はミュートで流し、音はボーカル／伴奏の
    2ステムを同時に鳴らす。ボーカルの音量はヤチヨの口パクにも使う。
    playing は「3つを再生開始したか」。押すとほぼ即座に true になる。
  */
  const {
    videoRef: hologramVideoRef,
    playing: starfallPlaying,
    getAmplitude: getStarfallAmplitude,
  } = useStarfallSong(starfallSea);

  /*
    Reply の映像と音。replyv3 は音声トラック付きなので音は映像から鳴る。
    ボーカルステムは無音で回して、その音量解析をかぐやの口パクに使うだけ。
  */
  const {
    videoRef: replyVideoRef,
    playing: replyPlaying,
    getAmplitude: getReplyAmplitude,
    getMouthVowel: getReplyMouthVowel,
  } = useReplySong(reply);

  /*
    再生開始状態をストアへ橋渡しする。3Dシーン(Canvas内)とキャラの歌唱は
    この2つで駆動される(どちらも押した次の tick で true になる)。
    星降る海と Reply はストア側で排他になっているので同時に true にはならない。
  */
  useEffect(() => {
    setStarfallPlaying(starfallPlaying);
  }, [starfallPlaying, setStarfallPlaying]);

  useEffect(() => {
    setReplyPlaying(replyPlaying);
  }, [replyPlaying, setReplyPlaying]);

  /*
    編集モードを抜けたら、そこで一時停止していた映像を必ず再生へ戻す。
    ストア側では editorPaused を false に戻しているが、<video> 自体は
    止めたままなので、ここで明示的に再生し直さないと「通常表示に戻ったのに
    映像だけ止まっている」状態になる。
  */
  useEffect(() => {
    if (editorMode) return;
    const video = replyVideoRef.current;
    if (video && video.paused && replyPlaying) {
      void video.play().catch(() => {});
    }
  }, [editorMode, replyPlaying, replyVideoRef]);

  const canvas = (
    <RootCanvas hologramVideoRef={hologramVideoRef} replyVideoRef={replyVideoRef} />
  );

  /*
    EditorLayout は編集モードでなくても**必ず**同じ位置で描く(枠を出すか
    どうかは active で切り替える)。以前は編集モードのときだけ包んでいたため、
    `L` を押すたびに <Canvas> がアンマウント→再マウントされ、WebGLコンテキストと
    モデルの読み込みからやり直しになっていた。詳細は EditorLayout のコメント。
  */
  return (
    <>
      <EditorLayout
        active={editorMode}
        replyVideoRef={replyVideoRef}
        hologramVideoRef={hologramVideoRef}
      >
        {canvas}
      </EditorLayout>
      {!editorMode && (
        <CharacterOverlay
          getStarfallAmplitude={getStarfallAmplitude}
          getReplyAmplitude={getReplyAmplitude}
          getReplyMouthVowel={getReplyMouthVowel}
          replyVideoRef={replyVideoRef}
        />
      )}
    </>
  );
}
