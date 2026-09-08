"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useSceneStore } from "@/features/root/store";
import { Compass } from "@/features/scene-controls";
import { EditorDetailsPanel } from "./EditorDetailsPanel";
import { initEditorHistory } from "./editorHistory";
import { EditorFpsBadge } from "./EditorFpsBadge";
import { EditorModeBar } from "./EditorModeBar";
import { EditorOutlinePanel } from "./EditorOutlinePanel";
import { EditorTimeline } from "./EditorTimeline";
import { EditorViewport, type EditorViewportHandle } from "./EditorViewport";
import { useResizableEdge } from "./useResizableEdge";

/**
 * 編集モード(useSceneStore.editorMode)の画面枠。Theatre.js Studio と同じ
 * 3ペイン構成にしてある:
 *   - 左(left.size)   = Outline。編集できるオブジェクトの一覧
 *   - 右(right.size)  = Details。選んだオブジェクトのパラメータ(リアルタイム)
 *   - 下(bottom.size) = Sequence Editor。見出しを兼ねる再生コントロール
 *     (EditorToolbar: 再生/一時停止・シーク等)+ キーフレームと再生ヘッド。
 *     シーク位置・再生ヘッドの現在地はタイムライン側の概念なのでここに置く。
 * 中央は3Dビューポート + その直下のシーンモード切り替え(EditorModeBar:
 * Reply の開始/停止・自由視点)。
 * 色は app/globals.css の --color-ed-* トークン(ダークグレー＋ティール)。
 *
 * 3つの境界はすべて EditorViewport の3Dビューポート箱と同じ操作感で
 * ドラッグしてリサイズできる(useResizableEdge。サイズは localStorage に覚える)。
 * 上段(TOP_HEIGHT)は「VIEWPORT」見出し + 「編集モード終了」ボタンだけの
 * ヘッダー帯(他パネルの見出しと同じ高さ)なのでリサイズ対象外
 * (画面比率メニューは EditorModeBar の右端へ移した)。
 *
 * **children(3Dキャンバス)は active に関わらず常に同じ位置で描画する。**
 * 以前は RootScene 側が「編集モードなら EditorLayout で包む / 通常なら
 * 直に置く」と出し分けていたため、`L` を押すたびに React が <Canvas> を
 * アンマウント→再マウントし、WebGLコンテキストとモデルの読み込みごと
 * 作り直していた(演出中に編集モードへ入ると画が固まって最初からやり直しに
 * 見える不具合の原因)。ここでは枠の側だけを active で切り替え、
 * 非表示のときは display:contents で「枠が無いのと同じ」レイアウトにする。
 */

/**
 * 上段(ヘッダー行)の高さ。Outline / Details のパネル見出しも同じ h-[30px]
 * に揃えてある(EditorOutlinePanel / EditorDetailsPanel)。リサイズ対象外。
 */
const TOP_HEIGHT = 30;
/** ヘッダーとビューポート箱の間に空ける余白 */
const VIEWPORT_GAP = 6;

/** パネルの共通の見た目 */
const PANEL = "absolute overflow-hidden bg-ed-panel text-ed-text";
/** 境界のドラッグハンドル(掴みやすいよう見た目より広めの当たり判定) */
const HANDLE = "absolute z-20 touch-none transition-colors hover:bg-ed-accent/50";

export function EditorLayout({
  active,
  replyVideoRef,
  children,
}: {
  /** 編集モードかどうか。false のときは枠を出さず children だけを通す */
  active: boolean;
  /** Reply の映像。ツールバーとタイムラインが操作/参照する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  /** 3Dキャンバス(RootCanvas) */
  children: ReactNode;
}) {
  const toggleEditorMode = useSceneStore((s) => s.toggleEditorMode);
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

  // Undo/Redo(Ctrl+Z / Ctrl+Y)は開発時のみ・一度だけ配線する
  useEffect(() => {
    initEditorHistory();
  }, []);

  return (
    <div className={active ? "relative h-dvh w-full bg-ed-bg" : "contents"}>
      {active && (
        <header
          className="absolute flex items-center justify-between border-b border-ed-line bg-ed-panel px-2.5"
          style={{ top: 0, height: TOP_HEIGHT, left: left.size, right: right.size }}
        >
          <span className="text-[0.65rem] tracking-[0.18em] text-ed-dim">
            VIEWPORT
          </span>
          <button
            type="button"
            onClick={toggleEditorMode}
            className="cursor-pointer rounded-sm border border-ed-line bg-ed-row px-1.5 py-0.5 text-[0.65rem] text-ed-text hover:border-ed-accent/60 hover:text-white"
          >
            編集モード終了
          </button>
        </header>
      )}

      {/*
        中央のビューポート。active でないときは display:contents にして
        「この入れ物は無い」のと同じ扱いにする(= 3Dキャンバスは今まで通り
        画面いっぱい)。children の位置は変えないので再マウントされない。
      */}
      <div
        className={active ? "absolute" : "contents"}
        style={
          active
            ? {
                top: TOP_HEIGHT + VIEWPORT_GAP,
                left: left.size,
                right: right.size,
                bottom: bottom.size,
              }
            : undefined
        }
      >
        <EditorViewport
          ref={viewportRef}
          active={active}
          onManualResize={() => setActivePreset(null)}
        >
          <div
            className={
              active
                ? "flex size-full flex-col overflow-hidden rounded-sm border border-ed-line bg-[#0b1626]"
                : "contents"
            }
          >
            <div className={active ? "relative min-h-0 flex-1" : "contents"}>
              {children}
              {active && <EditorFpsBadge />}
              {active && <Compass placement="editor" />}
            </div>
            {active && (
              <EditorModeBar
                viewportRef={viewportRef}
                aspectPreset={activePreset}
                onAspectSelect={setActivePreset}
              />
            )}
          </div>
        </EditorViewport>
      </div>

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
