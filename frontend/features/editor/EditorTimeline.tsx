"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  DRONE_PATH,
  keyframeIsDirty,
  useDronePathStore,
  type DroneKeyField,
} from "@/features/reply";
import { EDITOR_OBJECTS, useEditorStore } from "./editorStore";
import { beginGesture, endGesture } from "./editorHistory";
import { EditorToolbar } from "./EditorToolbar";

/**
 * 下パネル(Sequence Editor)。Theatre.js Studio のシーケンスエディタと同じ
 * 役割で、Drone Path のキーフレームを曲の時間軸の上に並べる。
 *
 * - 目盛り/トラックをクリック・ドラッグ → 映像をその位置へシーク(=カメラも追従)
 * - 菱形をクリック → そのキーフレームを選択(右の Details が切り替わる)
 * - 菱形を左右へドラッグ → キーフレームの時刻を動かす(隣は追い越さない)
 * - **トラックを右クリック → その時刻に新しいキーフレームを追加**
 *   (挿入時点の補間後の値を初期値にするので、追加した瞬間はカメラの動きが
 *   変わらない。そこから Details パネルで値を調整していく)
 * - **菱形を右クリック → そのキーフレームを削除**(航路には最低2点必要)
 *
 * ダブルクリックではなく右クリックにしてあるのは、ダブルクリックだと
 * 1回目のクリックの時点で pointerdown → シークが先に発火し、狙った場所とは
 * 違う位置に映像が動いてから追加されてしまっていたため
 * (右クリックは contextmenu イベントで、シークの pointerdown とは別経路)。
 * ブラウザ標準の右クリックメニューは出さない(preventDefault)。
 * キーフレームの削除は Details パネル側のボタンからも行える。
 *
 * 再生ヘッドは毎フレーム動くので、state ではなく DOM の style を直接書く
 * (state にするとタイムライン全体が 60fps で再レンダーされる)。
 *
 * 再生コントロール(Reply トグル・自由視点・再生/一時停止・早送り/巻き戻し・
 * シークバー)は EditorToolbar としてこのパネルの見出し直下に置く。
 * 「映像(<video>)に紐づく部品」ではなく「タイムラインに紐づく部品」という
 * 位置づけにしたく、以前はビューポート直下にあったものをここへ移した
 * (シーク位置・再生ヘッドの現在地はどのみちタイムライン側の概念のため)。
 */

/** 行に並べるプロパティ。Details の並びと揃える */
const ROWS: { field: DroneKeyField; label: string }[] = [
  { field: "turn", label: "turn" },
  { field: "radius", label: "radius" },
  { field: "y", label: "y" },
  { field: "lookY", label: "lookY" },
  { field: "fov", label: "fov" },
];

/** 目盛りの間隔(秒) */
const TICK_SECONDS = 10;
/** 左側のラベル列の幅 */
const LABEL_WIDTH = "5rem";

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds - m * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function EditorTimeline({
  replyVideoRef,
}: {
  replyVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const selectedObject = useEditorStore((s) => s.selectedObject);
  const selectedKeyIndex = useEditorStore((s) => s.selectedKeyIndex);
  const selectKeyIndex = useEditorStore((s) => s.selectKeyIndex);
  const keyframes = useDronePathStore((s) => s.keyframes);
  const setTime = useDronePathStore((s) => s.setTime);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const playheadRef = useRef<HTMLDivElement | null>(null);

  /*
    尺は映像の長さ。読み込み前は NaN/0 になるので、その間は航路の最後の
    キーフレーム(=作った時点で想定している曲の長さ)で代用する。
    毎フレーム読むが、変わったときだけ state を更新して再レンダーを抑える。
  */
  const fallbackDuration = DRONE_PATH[DRONE_PATH.length - 1].t;
  const [duration, setDuration] = useState(fallbackDuration);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const video = replyVideoRef.current;
      const rawDuration = video?.duration ?? 0;
      const nextDuration =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : fallbackDuration;
      setDuration((prev) => (prev === nextDuration ? prev : nextDuration));

      const rawTime = video?.currentTime ?? 0;
      const time = Number.isFinite(rawTime) ? rawTime : 0;
      if (playheadRef.current) {
        playheadRef.current.style.left = `${(time / nextDuration) * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [replyVideoRef, fallbackDuration]);

  /** クリック位置(px)を秒へ */
  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return 0;
      const ratio = (clientX - rect.left) / rect.width;
      return Math.min(Math.max(ratio, 0), 1) * duration;
    },
    [duration],
  );

  /* 目盛り/トラックのドラッグでシークする */
  const seekingRef = useRef(false);
  const seekTo = useCallback(
    (clientX: number) => {
      const video = replyVideoRef.current;
      if (!video) return;
      video.currentTime = timeFromClientX(clientX);
    },
    [replyVideoRef, timeFromClientX],
  );
  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    /*
      pointerdown はマウスのボタン種別を問わず発火する。ここで button を
      見ずにシークすると、右クリック(追加用)の押下そのものがシーク扱いになり、
      「追加した瞬間に違う位置へ映像が飛ぶ」不具合になっていた。左ボタン
      (button===0)のときだけシークを始める。
    */
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    seekingRef.current = true;
    seekTo(e.clientX);
  };
  const onTrackPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (seekingRef.current) seekTo(e.clientX);
  };
  const onTrackPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!seekingRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    seekingRef.current = false;
  };

  /** トラックの右クリックで、その時刻に新しいキーフレームを追加する */
  const onTrackContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!keyframed) return;
    const t = timeFromClientX(e.clientX);
    const newIndex = useDronePathStore.getState().insertKeyframe(t);
    selectKeyIndex(newIndex);
  };

  /* 菱形のドラッグでキーフレームの時刻を動かす */
  const dragKeyRef = useRef<number | null>(null);
  const onKeyPointerDown =
    (index: number) => (e: PointerEvent<HTMLButtonElement>) => {
      // 親(トラック)のシークへ伝播させない
      e.stopPropagation();
      // 右クリック(削除用)ではドラッグを始めない(トラック側と同じ理由)
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragKeyRef.current = index;
      selectKeyIndex(index);
      // ドラッグ全体を Undo 1回ぶんにまとめる(editorHistory.ts のコメント参照)
      beginGesture();
    };
  const onKeyPointerMove =
    (index: number) => (e: PointerEvent<HTMLButtonElement>) => {
      if (dragKeyRef.current !== index) return;
      e.stopPropagation();
      setTime(index, timeFromClientX(e.clientX));
    };
  const onKeyPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragKeyRef.current == null) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragKeyRef.current = null;
    endGesture();
  };

  /**
   * 菱形の右クリックでそのキーフレームを削除する。
   * 航路には最低2点必要なので、それ以下では dronePathStore 側が無視する
   * (下の canDeleteKeyframe と同じ基準)。トラック側の onTrackContextMenu
   * (追加)へ伝播させないよう stopPropagation する。
   */
  const onKeyContextMenu =
    (index: number) => (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const before = keyframes.length;
      useDronePathStore.getState().removeKeyframe(index);
      const after = useDronePathStore.getState().keyframes.length;
      // 実際に削除できたときだけ選択位置を詰め直す(下限で無視された場合は何もしない)
      if (after < before) selectKeyIndex(Math.min(index, after - 1));
    };

  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += TICK_SECONDS) ticks.push(t);

  const keyframed =
    EDITOR_OBJECTS.find((o) => o.id === selectedObject)?.keyframed ?? false;

  return (
    <div className="flex size-full flex-col overflow-hidden">
      {/* 「SEQUENCE EDITOR」の文字だけの見出しは置かず、再生コントロールが見出しを兼ねる */}
      <EditorToolbar replyVideoRef={replyVideoRef} />

      <div className="flex min-h-0 flex-1">
        {/* 左: 行のラベル */}
        <div
          className="shrink-0 border-r border-ed-line"
          style={{ width: LABEL_WIDTH }}
        >
          <div className="h-6 border-b border-ed-line" />
          {keyframed &&
            ROWS.map(({ field, label }) => (
              <div
                key={field}
                className="flex h-6 items-center px-2.5 text-[0.65rem] text-ed-dim"
              >
                {label}
              </div>
            ))}
        </div>

        {/* 右: 時間軸 */}
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          onContextMenu={onTrackContextMenu}
          title={keyframed ? "右クリックでキーフレームを追加" : undefined}
          className="relative min-w-0 flex-1 cursor-col-resize touch-none select-none"
        >
          {/* 目盛り */}
          <div className="relative h-6 border-b border-ed-line">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute top-0 bottom-0 border-l border-ed-line/70"
                style={{ left: `${(t / duration) * 100}%` }}
              >
                <span className="pl-1 text-[0.6rem] text-ed-dim">
                  {formatClock(t)}
                </span>
              </div>
            ))}
          </div>

          {/* キーフレームの行 */}
          {keyframed ? (
            ROWS.map(({ field }) => (
              <div
                key={field}
                className="relative h-6 border-b border-ed-line/40"
              >
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="absolute top-0 bottom-0 border-l border-ed-line/40"
                    style={{ left: `${(t / duration) * 100}%` }}
                  />
                ))}
                {keyframes.map((k, index) => {
                  const active = index === selectedKeyIndex;
                  const moved = keyframeIsDirty(keyframes, index);
                  return (
                    <button
                      key={`${field}-${index}`}
                      type="button"
                      onPointerDown={onKeyPointerDown(index)}
                      onPointerMove={onKeyPointerMove(index)}
                      onPointerUp={onKeyPointerUp}
                      onPointerCancel={onKeyPointerUp}
                      onContextMenu={onKeyContextMenu(index)}
                      title={`t = ${k.t}s / ${field} = ${k[field]}(右クリックで削除)`}
                      aria-label={`${field} キーフレーム t=${k.t}`}
                      className={
                        "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 " +
                        "cursor-ew-resize border transition-colors " +
                        (active
                          ? "border-ed-accent bg-ed-accent"
                          : moved
                            ? "border-ed-playhead bg-ed-playhead/80 hover:bg-ed-playhead"
                            : "border-ed-key/70 bg-ed-key/80 hover:bg-ed-key")
                      }
                      style={{ left: `${(k.t / duration) * 100}%` }}
                    />
                  );
                })}
              </div>
            ))
          ) : (
            <div className="flex h-full items-center justify-center text-[0.65rem] text-ed-dim">
              このオブジェクトはキーフレームを持たない(曲全体に効く定数)
            </div>
          )}

          {/* 再生ヘッド */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-ed-playhead"
            style={{ left: "0%" }}
          >
            <div className="absolute -top-px -left-[3px] size-[7px] bg-ed-playhead" />
          </div>
        </div>
      </div>
    </div>
  );
}
