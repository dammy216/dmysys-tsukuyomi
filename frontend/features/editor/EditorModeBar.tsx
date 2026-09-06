"use client";

import type { RefObject } from "react";
import {
  PiArrowsOutCardinalBold,
  PiEnvelopeBold,
  PiVideoCameraBold,
} from "react-icons/pi";
import { useSceneStore } from "@/features/root/store";
import { EditorAspectRatioMenu } from "./EditorAspectRatioMenu";
import type { EditorViewportHandle } from "./EditorViewport";

/**
 * 編集モードのビューポート直下に置く、シーンモードの切り替えバー
 * (Reply の開始/停止・自由視点)。右端に画面比率メニュー(映像の箱の
 * 縦横比プリセット)を置く。
 *
 * 再生コントロール(EditorToolbar: 再生/一時停止・シーク等)は、以前は
 * このバーに同居していたが、今は Sequence Editor パネルの見出し(header)を
 * 兼ねる形でそちら側へ移してある。こちらは「3Dシーンをどのモードで見るか」
 * だけを扱う、映像(<video>)には直接触れないシンプルなトグル集。
 */
export function EditorModeBar({
  viewportRef,
  aspectPreset,
  onAspectSelect,
}: {
  /** 画面比率メニューが箱をリサイズするための EditorViewport ハンドル */
  viewportRef: RefObject<EditorViewportHandle | null>;
  /** 現在有効なプリセット名(null=手動リサイズ後) */
  aspectPreset: string | null;
  /** プリセットを選んだとき */
  onAspectSelect: (label: string) => void;
}) {
  const reply = useSceneStore((s) => s.reply);
  const toggleReply = useSceneStore((s) => s.toggleReply);
  const replyPlaying = useSceneStore((s) => s.replyPlaying);
  const freeCam = useSceneStore((s) => s.freeCam);
  const toggleFreeCam = useSceneStore((s) => s.toggleFreeCam);

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-t border-ed-line bg-ed-panel px-3">
      <button
        type="button"
        onClick={toggleReply}
        aria-pressed={reply}
        className={
          "inline-flex items-center gap-1.5 rounded-sm border border-ed-line bg-ed-row px-3 py-1.5 " +
          "text-[0.72rem] text-ed-text transition duration-150 cursor-pointer " +
          "hover:border-ed-accent/60 hover:text-white " +
          "aria-pressed:border-ed-accent aria-pressed:bg-ed-accent/15 " +
          "aria-pressed:text-ed-accent"
        }
      >
        <PiEnvelopeBold aria-hidden="true" />
        Reply
      </button>

      <button
        type="button"
        onClick={toggleFreeCam}
        disabled={!replyPlaying}
        aria-pressed={freeCam}
        title={freeCam ? "アニメーションに戻す" : "アニメーションを止めて自由視点で見る"}
        className={
          "inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-ed-line bg-ed-row px-3 py-1.5 " +
          "text-[0.72rem] text-ed-text transition duration-150 cursor-pointer " +
          "hover:border-ed-accent/60 hover:text-white " +
          "aria-pressed:border-ed-accent aria-pressed:text-ed-accent " +
          "disabled:opacity-30 disabled:cursor-not-allowed"
        }
      >
        {freeCam ? (
          <PiArrowsOutCardinalBold aria-hidden="true" />
        ) : (
          <PiVideoCameraBold aria-hidden="true" />
        )}
        {freeCam ? "自由視点" : "アニメーション"}
      </button>

      <div className="ml-auto">
        <EditorAspectRatioMenu
          viewportRef={viewportRef}
          value={aspectPreset}
          onSelect={onAspectSelect}
        />
      </div>
    </div>
  );
}
