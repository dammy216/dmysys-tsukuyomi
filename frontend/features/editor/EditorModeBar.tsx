"use client";

import { useState, type RefObject } from "react";
import {
  PiArrowsOutCardinalBold,
  PiDownloadSimpleBold,
  PiEnvelopeBold,
  PiEyeBold,
  PiEyeSlashBold,
  PiPencilSimpleLineBold,
  PiShootingStarBold,
  PiVideoCameraBold,
} from "react-icons/pi";
import { useSceneStore } from "@/features/root/store";
import { ExportPanel } from "@/features/recorder";
import { EditorAspectRatioMenu } from "./EditorAspectRatioMenu";
import type { EditorViewportHandle } from "./EditorViewport";

/**
 * ビューポート直下に置く、シーンモードの切り替えバー(Reply の開始/停止・
 * 自由視点)。右端は「編集モードへの入口/終了」ボタン + 画面比率メニュー
 * (映像の箱の縦横比プリセット)。編集モードへの入口(通常画面)と終了
 * (編集モード自身)を同じ位置(画面比率の左)に置く(ユーザー指定)。
 *
 * **通常画面(siteControls=true)では、以前は下部の別コンポーネント(ControlBar)
 * が持っていたボタン群(かぐや/ヤチヨ表示・星降る海)もここへ集約する**
 * (ユーザー指定: 編集モードのビューポートの見た目・操作感をそのまま
 * 通常画面にも使う。EditorLayout のコメント参照)。編集モード自身
 * (siteControls=false)ではこれらの追加ボタンは出さない
 * (Outline/Details/Sequence Editor 側に別の入口がある、または意味を持たない)。
 * ライセンス表示・サイト名は EditorLayout 側のヘッダーに置いてある。
 *
 * 再生コントロール(EditorToolbar: 再生/一時停止・シーク等)は、以前は
 * このバーに同居していたが、今は Sequence Editor パネルの見出し(header)を
 * 兼ねる形でそちら側へ移してある(通常画面では EditorLayout がフッターとして
 * 別途常設する)。こちらは「3Dシーンをどのモードで見るか」を扱うトグル集
 * (+ 通常画面用の表示切り替え)。
 */

/** かぐや/ヤチヨ・星降る海・編集入りに共通のピルボタン */
const ED_PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-ed-line bg-ed-row px-3 py-1.5 " +
  "text-[0.72rem] text-ed-text transition duration-150 cursor-pointer " +
  "hover:border-ed-accent/60 hover:text-white " +
  "aria-pressed:border-ed-accent aria-pressed:bg-ed-accent/15 aria-pressed:text-ed-accent " +
  "disabled:opacity-30 disabled:cursor-not-allowed";

export function EditorModeBar({
  viewportRef,
  aspectPreset,
  onAspectSelect,
  siteControls,
  replyVideoRef,
  hologramVideoRef,
}: {
  /** 画面比率メニューが箱をリサイズするための EditorViewport ハンドル */
  viewportRef: RefObject<EditorViewportHandle | null>;
  /** 現在有効なプリセット名(null=手動リサイズ後) */
  aspectPreset: string | null;
  /** プリセットを選んだとき */
  onAspectSelect: (label: string) => void;
  /** 通常画面(実際の編集モードではない)ときだけ true */
  siteControls: boolean;
  /** Reply の映像。書き出しパネルが参照する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  /** 星降る海の映像。書き出しパネルが参照する */
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const reply = useSceneStore((s) => s.reply);
  const toggleReply = useSceneStore((s) => s.toggleReply);
  const replyPlaying = useSceneStore((s) => s.replyPlaying);
  const freeCam = useSceneStore((s) => s.freeCam);
  const toggleFreeCam = useSceneStore((s) => s.toggleFreeCam);

  const showKaguya = useSceneStore((s) => s.showKaguya);
  const toggleKaguya = useSceneStore((s) => s.toggleKaguya);
  const showYachiyo = useSceneStore((s) => s.showYachiyo);
  const toggleYachiyo = useSceneStore((s) => s.toggleYachiyo);
  const starfallSea = useSceneStore((s) => s.starfallSea);
  const toggleStarfallSea = useSceneStore((s) => s.toggleStarfallSea);
  const toggleEditorMode = useSceneStore((s) => s.toggleEditorMode);
  const starfallPlaying = useSceneStore((s) => s.starfallPlaying);

  const [showExportPanel, setShowExportPanel] = useState(false);

  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-3 border-t border-ed-line bg-ed-panel px-3 py-1.5">
      {siteControls && (
        <>
          <button
            type="button"
            onClick={toggleKaguya}
            aria-pressed={showKaguya}
            className={ED_PILL}
          >
            {showKaguya ? (
              <PiEyeBold aria-hidden="true" />
            ) : (
              <PiEyeSlashBold aria-hidden="true" />
            )}
            かぐや
          </button>
          <button
            type="button"
            onClick={toggleYachiyo}
            aria-pressed={showYachiyo}
            className={ED_PILL}
          >
            {showYachiyo ? (
              <PiEyeBold aria-hidden="true" />
            ) : (
              <PiEyeSlashBold aria-hidden="true" />
            )}
            ヤチヨ
          </button>
          <button
            type="button"
            onClick={toggleStarfallSea}
            aria-pressed={starfallSea}
            className={ED_PILL}
          >
            <PiShootingStarBold aria-hidden="true" />
            星降る海
          </button>
        </>
      )}

      <button
        type="button"
        onClick={toggleReply}
        aria-pressed={reply}
        className={ED_PILL}
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
        className={`${ED_PILL} shrink-0`}
      >
        {freeCam ? (
          <PiArrowsOutCardinalBold aria-hidden="true" />
        ) : (
          <PiVideoCameraBold aria-hidden="true" />
        )}
        {freeCam ? "自由視点" : "アニメーション"}
      </button>

      <button
        type="button"
        onClick={() => setShowExportPanel(true)}
        disabled={!replyPlaying && !starfallPlaying}
        title="ビューポートをYouTube用の動画として書き出す"
        className={ED_PILL}
      >
        <PiDownloadSimpleBold aria-hidden="true" />
        書き出し
      </button>
      {showExportPanel && (
        <ExportPanel
          replyVideoRef={replyVideoRef}
          hologramVideoRef={hologramVideoRef}
          onClose={() => setShowExportPanel(false)}
        />
      )}

      <div className="ml-auto flex items-center gap-3">
        {siteControls ? (
          <button
            type="button"
            onClick={toggleEditorMode}
            title="カメラ航路などの編集モードへ(L キーでも切替)"
            className={ED_PILL}
          >
            <PiPencilSimpleLineBold aria-hidden="true" />
            編集
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleEditorMode}
            title="編集モードを終了(L キーでも切替)"
            className={ED_PILL}
          >
            <PiPencilSimpleLineBold aria-hidden="true" />
            編集モード終了
          </button>
        )}
        <EditorAspectRatioMenu
          viewportRef={viewportRef}
          value={aspectPreset}
          onSelect={onAspectSelect}
        />
      </div>
    </div>
  );
}
