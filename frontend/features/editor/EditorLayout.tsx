"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PiEyeBold, PiEyeSlashBold } from "react-icons/pi";
import { useSceneStore } from "@/features/root/store";
import { Compass } from "@/features/scene-controls";
import { EditorDetailsPanel } from "./EditorDetailsPanel";
import { initEditorHistory } from "./editorHistory";
import { EditorFpsBadge } from "./EditorFpsBadge";
import { EditorModeBar } from "./EditorModeBar";
import { EditorOutlinePanel } from "./EditorOutlinePanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorToolbar } from "./EditorToolbar";
import { EditorViewport, type EditorViewportHandle } from "./EditorViewport";
import { useResizableEdge } from "./useResizableEdge";

/**
 * ルート("/")の画面枠。中央のビューポート(3Dキャンバス + Compass + FPS +
 * EditorModeBar をまとめた箱。EditorViewport でドラッグ拡縮できる)と、
 * その上のヘッダーバーは、**通常画面(active=false)でも編集モード
 * (active=true)でも常に同じコンポーネントで描く**(ユーザー指定: 編集モードの
 * ビューポートの見た目・操作感をそのまま通常画面にも使う。以前の通常画面は
 * ControlBar / 通常の Compass という別のコンポーネント一式だったが、廃止して
 * こちらへ統一した)。
 *
 * active(useSceneStore.editorMode)で変わるのは:
 *   - ヘッダーの見出し文字列(「VIEWPORT」⇔ サイト名「DMYSYS-ツクヨミ」)と
 *     右端のボタン(通常画面だけ「ライセンス」。Credits.tsx 参照)。
 *     「編集モード終了」は EditorModeBar 側(画面比率の左)に移してあるので
 *     ヘッダー自体にはもう置いていない。
 *   - 左(left.size)   = Outline。編集できるオブジェクトの一覧
 *   - 右(right.size)  = Details。選んだオブジェクトのパラメータ(リアルタイム)
 *   - 下(bottom.size) = Sequence Editor。見出しを兼ねる再生コントロール
 *     (EditorToolbar: 再生/一時停止・シーク等)+ キーフレームと再生ヘッド。
 * これらが無い通常画面では、ヘッダーは画面幅いっぱい、ビューポートの箱の下に
 * 再生バー(EditorToolbar)をフッターとして常設し(ユーザー指定)、ビューポートの
 * 箱はヘッダーとフッターの間いっぱいの余白を使う。色は app/globals.css の
 * --color-ed-* トークン(ダークグレー＋ティール)。
 *
 * 3つの境界(Outline/Details/Sequence Editorとビューポートの間)は
 * ビューポート箱自体のドラッグ拡縮(EditorViewport)と同じ操作感で
 * リサイズできる(useResizableEdge。サイズは localStorage に覚える)。
 * 上段(TOP_HEIGHT)はヘッダーだけの帯(他パネルの見出しと同じ高さ)なので
 * リサイズ対象外(画面比率メニューは EditorModeBar の右端に常設)。
 *
 * **children(3Dキャンバス)は active に関わらず常に同じ位置で描画する。**
 * 以前は RootScene 側が「編集モードなら EditorLayout で包む / 通常なら
 * 直に置く」と出し分けていたため、`L` を押すたびに React が <Canvas> を
 * アンマウント→再マウントし、WebGLコンテキストとモデルの読み込みごと
 * 作り直していた(演出中に編集モードへ入ると画が固まって最初からやり直しに
 * 見える不具合の原因)。ビューポートの箱自体は今や常設なので、この配慮が
 * 要るのは外側の3パネルだけになった。
 *
 * ルートの入れ物は `fixed inset-0 overflow-hidden`(`h-dvh` ではない)。
 * `h-dvh` な通常のブロックだと、ウィンドウ最大化時などに`<body>`の
 * スクロール可能領域が数px分だけ実際のビューポートより大きくなる環境があり、
 * 縦スクロールバーが出てしまっていた(ユーザー指摘)。fixed にして
 * ドキュメントフロー自体から外すことでこの環境差をなくす。
 */

/**
 * 上段(ヘッダー行)の高さ。Outline / Details のパネル見出しも同じ h-[30px]
 * に揃えてある(EditorOutlinePanel / EditorDetailsPanel)。リサイズ対象外。
 */
const TOP_HEIGHT = 30;
/** ヘッダーとビューポート箱の間に空ける余白 */
const VIEWPORT_GAP = 6;
/**
 * 通常画面のフッター(再生バー=EditorToolbar)の高さ。EditorToolbar 自身が
 * h-11(44px)固定なのでそれに合わせる。編集モード中は Sequence Editor
 * パネルに同じ役割の EditorToolbar があるので、このフッターは出さない。
 */
const FOOTER_HEIGHT = 44;

/** パネルの共通の見た目 */
const PANEL = "absolute overflow-hidden bg-ed-panel text-ed-text";
/** 境界のドラッグハンドル(掴みやすいよう見た目より広めの当たり判定) */
const HANDLE = "absolute z-20 touch-none transition-colors hover:bg-ed-accent/50";

export function EditorLayout({
  active,
  replyVideoRef,
  children,
}: {
  /** 編集モードかどうか。false のときはヘッダー/Outline/Details/Sequence Editor を出さない */
  active: boolean;
  /** Reply の映像。ツールバーとタイムラインが操作/参照する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  /** 3Dキャンバス(RootCanvas) */
  children: ReactNode;
}) {
  const showCredits = useSceneStore((s) => s.showCredits);
  const toggleCredits = useSceneStore((s) => s.toggleCredits);
  const viewportRef = useRef<EditorViewportHandle | null>(null);
  /**
   * 現在有効なプリセット名(null=未適用/手動リサイズ後)。ドロップダウンの
   * 表示に使う(選ぶとそのラベルを、手でリサイズしたら null に戻して
   * プレースホルダー表示に戻す)。
   */
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const left = useResizableEdge({
    storageKey: "left",
    initial: 190,
    min: 150,
    max: 480,
    sign: 1,
    axis: "x",
  });
  const right = useResizableEdge({
    storageKey: "right",
    initial: 260,
    min: 200,
    max: 480,
    sign: -1,
    axis: "x",
  });
  const bottom = useResizableEdge({
    storageKey: "bottom",
    // 見出し + 再生コントロール(EditorToolbar) + 目盛り + プロパティ5行 が収まる高さ
    initial: 250,
    min: 160,
    max: 420,
    sign: -1,
    axis: "y",
  });

  // Undo/Redo(Ctrl+Z / Ctrl+Y)を一度だけ配線する
  useEffect(() => {
    initEditorHistory();
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-ed-bg">
      {/*
        ヘッダーも active に関わらず常設(ユーザー指定)。見出し文字列だけ
        出し分ける(編集モードは「VIEWPORT」、通常画面はサイト名)。
        「編集モード終了」ボタンは EditorModeBar 側(画面比率の左)に移した
        (ユーザー指定)ので、ヘッダー右端は通常画面の「ライセンス」ボタン
        (Credits.tsx。利用規約で表示自体は必須だが、常時出しっぱなしに
        しないためボタンの裏に置く。初期値は非表示)だけになる。
      */}
      <header
        className="absolute flex items-center justify-between border-b border-ed-line bg-ed-panel px-2.5"
        style={{
          top: 0,
          height: TOP_HEIGHT,
          left: active ? left.size : 0,
          right: active ? right.size : 0,
        }}
      >
        <span className="text-[0.65rem] tracking-[0.18em] text-ed-dim">
          {active ? "VIEWPORT" : "DMYSYS-ツクヨミ"}
        </span>
        {!active && (
          <button
            type="button"
            onClick={toggleCredits}
            aria-pressed={showCredits}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-ed-line bg-ed-row px-1.5 py-0.5 text-[0.65rem] text-ed-text transition duration-150 hover:border-ed-accent/60 hover:text-white aria-pressed:border-ed-accent aria-pressed:bg-ed-accent/15 aria-pressed:text-ed-accent"
          >
            {showCredits ? (
              <PiEyeBold aria-hidden="true" />
            ) : (
              <PiEyeSlashBold aria-hidden="true" />
            )}
            ライセンス
          </button>
        )}
      </header>

      {/*
        中央のビューポート。**active に関わらず常にこの箱で描く**
        (通常画面も編集モードのビューポートと同じ見た目・操作感にする指定)。
        active のときは Outline/Details/Sequence Editor ぶんの余白を空けて
        位置をずらす。通常画面(!active)のときは下に再生バー(フッター)ぶんの
        余白を空ける。children の位置(EditorViewport 以下)は active が
        変わっても変えないので、3Dキャンバスは再マウントされない。
      */}
      <div
        className="absolute"
        style={{
          top: TOP_HEIGHT + VIEWPORT_GAP,
          left: active ? left.size : 0,
          right: active ? right.size : 0,
          bottom: active ? bottom.size : FOOTER_HEIGHT + VIEWPORT_GAP,
        }}
      >
        <EditorViewport ref={viewportRef} onManualResize={() => setActivePreset(null)}>
          <div className="flex size-full flex-col overflow-hidden rounded-sm border border-ed-line bg-ed-bg">
            <div className="relative min-h-0 flex-1">
              {children}
              <EditorFpsBadge />
              <Compass />
            </div>
            <EditorModeBar
              viewportRef={viewportRef}
              aspectPreset={activePreset}
              onAspectSelect={setActivePreset}
              siteControls={!active}
            />
          </div>
        </EditorViewport>
      </div>

      {/*
        通常画面だけのフッター(再生バー)。編集モードは Sequence Editor
        パネル自身が同じ EditorToolbar を見出しとして持っているので二重に
        出さない(ユーザー指定「フッターとして再生バーもおいて」)。
      */}
      {!active && (
        <div
          className="absolute right-0 bottom-0 left-0"
          style={{ height: FOOTER_HEIGHT }}
        >
          <EditorToolbar replyVideoRef={replyVideoRef} />
        </div>
      )}

      {active && (
        <>
          <div
            className={`${PANEL} border-r border-ed-line`}
            style={{ top: 0, left: 0, bottom: bottom.size, width: left.size }}
          >
            <EditorOutlinePanel />
          </div>
          <div
            className={`${PANEL} border-l border-ed-line`}
            style={{ top: 0, right: 0, bottom: bottom.size, width: right.size }}
          >
            <EditorDetailsPanel replyVideoRef={replyVideoRef} />
          </div>
          <div
            className={`${PANEL} border-t border-ed-line`}
            style={{ left: 0, right: 0, bottom: 0, height: bottom.size }}
          >
            <EditorTimeline replyVideoRef={replyVideoRef} />
          </div>

          {/* Outline / ビューポート の境界 */}
          <div
            className={`${HANDLE} cursor-ew-resize`}
            style={{ top: 0, bottom: bottom.size, left: left.size - 3, width: 6 }}
            onPointerDown={left.onPointerDown}
            onPointerMove={left.onPointerMove}
            onPointerUp={left.onPointerUp}
            onPointerCancel={left.onPointerUp}
          />
          {/* ビューポート / Details の境界 */}
          <div
            className={`${HANDLE} cursor-ew-resize`}
            style={{ top: 0, bottom: bottom.size, right: right.size - 3, width: 6 }}
            onPointerDown={right.onPointerDown}
            onPointerMove={right.onPointerMove}
            onPointerUp={right.onPointerUp}
            onPointerCancel={right.onPointerUp}
          />
          {/* ビューポート / Sequence Editor の境界 */}
          <div
            className={`${HANDLE} cursor-ns-resize`}
            style={{ left: 0, right: 0, bottom: bottom.size - 3, height: 6 }}
            onPointerDown={bottom.onPointerDown}
            onPointerMove={bottom.onPointerMove}
            onPointerUp={bottom.onPointerUp}
            onPointerCancel={bottom.onPointerUp}
          />
        </>
      )}
    </div>
  );
}
