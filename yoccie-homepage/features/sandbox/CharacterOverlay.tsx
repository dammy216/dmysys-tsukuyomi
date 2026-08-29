"use client";

import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";
import { PiCigaretteBold, PiMusicNotesBold, PiSmileyBold } from "react-icons/pi";
import { YachiyoCharacter } from "@/features/character";
import { KaguyaCharacter } from "@/features/kaguya";
import styles from "./CharacterOverlay.module.css";

type Offset = { x: number; y: number };
type StageSize = { width: number; height: number };
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_WIDTH = 150;
const MAX_WIDTH = 480;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 720;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * パネルをブラウザのwindowのように、枠のどこを掴むかで伸縮方向が変わる形でリサイズ・移動するフック。
 * 掴んだ辺と逆側の辺は画面上で固定されるよう、サイズの増減ぶんだけ位置(offset)も合わせて補正する
 * （例: 左辺を掴んで左に伸ばすと、右辺は動かず左辺だけが左に伸びる）。
 *
 * .panel は position:absolute で left(かぐや) または right(ヤチヨ) のどちらかだけを指定しており、
 * width:auto の箱は「指定していない側の辺」がコンテンツ幅の変化につれて動く
 * （left指定なら右辺が、right指定なら左辺が動く）。そのため水平方向の補正は
 * anchorSide が "left" か "right" かで e/w の役割が入れ替わる。
 */
function usePanelTransform(
  stageRef: RefObject<HTMLDivElement | null>,
  anchorSide: "left" | "right",
) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [size, setSize] = useState<StageSize | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  const dragStart = useRef<{ pointerX: number; pointerY: number; origin: Offset } | null>(null);
  const resizeStart = useRef<{
    pointerX: number;
    pointerY: number;
    startSize: StageSize;
    startOffset: Offset;
    dir: ResizeDir;
  } | null>(null);

  const onDragPointerDown = useCallback(
    (e: PointerEvent) => {
      e.preventDefault();
      dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, origin: offset };
      setDragging(true);

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!dragStart.current) return;
        const dx = ev.clientX - dragStart.current.pointerX;
        const dy = ev.clientY - dragStart.current.pointerY;
        setOffset({
          x: dragStart.current.origin.x + dx,
          y: dragStart.current.origin.y + dy,
        });
      };
      const onPointerUp = () => {
        dragStart.current = null;
        setDragging(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [offset],
  );

  const onResizePointerDown = useCallback(
    (dir: ResizeDir) => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = stageRef.current?.getBoundingClientRect();
      const startSize = size ?? (rect ? { width: rect.width, height: rect.height } : { width: 200, height: 320 });
      resizeStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startSize,
        startOffset: offset,
        dir,
      };
      setResizing(true);

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!resizeStart.current) return;
        const { pointerX, pointerY, startSize, startOffset, dir } = resizeStart.current;
        const dx = ev.clientX - pointerX;
        const dy = ev.clientY - pointerY;

        let width = startSize.width;
        let height = startSize.height;
        let x = startOffset.x;
        let y = startOffset.y;

        if (dir.includes("e")) {
          width = clamp(startSize.width + dx, MIN_WIDTH, MAX_WIDTH);
          if (anchorSide === "right") {
            x = startOffset.x + (width - startSize.width);
          }
        }
        if (dir.includes("w")) {
          width = clamp(startSize.width - dx, MIN_WIDTH, MAX_WIDTH);
          if (anchorSide === "left") {
            x = startOffset.x + (startSize.width - width);
          }
        }
        if (dir.includes("s")) {
          height = clamp(startSize.height + dy, MIN_HEIGHT, MAX_HEIGHT);
        }
        if (dir.includes("n")) {
          height = clamp(startSize.height - dy, MIN_HEIGHT, MAX_HEIGHT);
          y = startOffset.y + (startSize.height - height);
        }

        setSize({ width, height });
        setOffset({ x, y });
      };
      const onPointerUp = () => {
        resizeStart.current = null;
        setResizing(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [offset, size, stageRef, anchorSide],
  );

  return { offset, size, dragging, resizing, onDragPointerDown, onResizePointerDown };
}

const RESIZE_HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: "n", className: styles.edgeN },
  { dir: "s", className: styles.edgeS },
  { dir: "e", className: styles.edgeE },
  { dir: "w", className: styles.edgeW },
  { dir: "nw", className: styles.cornerNW },
  { dir: "ne", className: styles.cornerNE },
  { dir: "sw", className: styles.cornerSW },
  { dir: "se", className: styles.cornerSE },
];

/** windowのように、パネルの枠(上下左右+四隅)を掴んでリサイズするためのハンドル群 */
function ResizeHandles({
  onPointerDown,
}: {
  onPointerDown: (dir: ResizeDir) => (e: PointerEvent) => void;
}) {
  return (
    <>
      {RESIZE_HANDLES.map(({ dir, className }) => (
        <div
          key={dir}
          className={className}
          onPointerDown={onPointerDown(dir)}
          style={{ touchAction: "none" }}
        />
      ))}
    </>
  );
}

/**
 * 歌唱モード中に実音量が0でも下回らせない最小値。
 * Rive側(WebYachiyo/AIYachiyo/webKaguya.lua)の口を閉じる閾値より
 * 十分小さいので口パクの見た目には影響せず、横揺れ・リズム動作の
 * 「歌唱モード中か」判定だけに使われる。
 */
const SING_MODE_FLOOR = 0.02;

type CharacterOverlayProps = {
  showKaguya: boolean;
  showYachiyo: boolean;
  /**
   * 星降る海の再生中はここが true になり、ヤチヨは疑似波形ではなく
   * 実際のボーカルの音量に合わせて口を動かす。
   */
  songActive?: boolean;
  /** 星降る海のボーカルの音量(0〜1)を返す */
  getSongAmplitude?: () => number;
};

/** サンドボックス上に重ねる、かぐや／ヤチヨの表示パネル。表示・非表示は下部のコントロールバーで切り替える */
export function CharacterOverlay({
  showKaguya,
  showYachiyo,
  songActive = false,
  getSongAmplitude,
}: CharacterOverlayProps) {
  const [kaguyaSinging, setKaguyaSinging] = useState(false);
  const [kaguyaSmoking, setKaguyaSmoking] = useState(false);
  const [kaguyaSmile, setKaguyaSmile] = useState(false);
  const [yachiyoSinging, setYachiyoSinging] = useState(false);

  /*
    星降る海の開始/終了に合わせて、かぐやの歌唱モードを自動でON/OFFする。
    ただし songActive を歌唱状態に直接ORせず kaguyaSinging へ一度写すことで、
    星降る海の再生中でもボタンで途中からやめられるようにする
    (songActive が変わったときだけ上書きするので、手動トグルは潰さない)。
    prop 変化への追従はレンダー中に行う (React 推奨。effect 内 setState を避ける)。
  */
  const [prevSongActive, setPrevSongActive] = useState(songActive);
  if (songActive !== prevSongActive) {
    setPrevSongActive(songActive);
    setKaguyaSinging(songActive);
  }

  /*
    かぐやの歌唱モードは音を鳴らさない(ヤチヨと同じ)。SING_MODE_FLOOR 固定を
    渡すだけ。SING_MODE_FLOOR は Rive 側の口パク閾値より小さいので、口は
    閉じたまま、webKaguya.lua の自走オシレーター(swayGate)による弾み・
    首かしげ・歌唱中の自動スマイルだけが入る。
  */
  const kaguyaAmplitude = useCallback(() => {
    if (kaguyaSinging) return SING_MODE_FLOOR;
    return 0;
  }, [kaguyaSinging]);
  const kaguyaSingingActive = kaguyaSinging;
  const yachiyoAmplitude = useCallback(() => {
    /*
      音が鳴るのは星降る海の再生中(songActive)だけ。そのときは実際の
      ボーカル音量で口を動かす。無音区間で横揺れが止まらないよう、
      実音量が0でも SING_MODE_FLOOR まで底上げする(Riveのsway判定用。
      SING_GAPより小さいので口パクには影響しない。詳しくは
      WebYachiyo/AIYachiyo.luaのコメント参照)。
    */
    if (songActive && getSongAmplitude) {
      return Math.max(SING_MODE_FLOOR, getSongAmplitude());
    }
    /*
      パネルの歌唱モードボタン単独では音を鳴らさない(発音は星降る海側のみ)。
      振幅は SING_MODE_FLOOR 固定で渡し、Rive側は横揺れ・首かしげ・自動スマイル
      などのリズム動作だけ入れて口は閉じたままにする(かぐやの星降る海時と同じ)。
    */
    if (yachiyoSinging) return SING_MODE_FLOOR;
    return 0;
  }, [songActive, getSongAmplitude, yachiyoSinging]);

  // 星降る海の間は歌っている状態なので、ボタンも押された見た目にする
  const yachiyoSingingActive = songActive || yachiyoSinging;

  const kaguyaStageRef = useRef<HTMLDivElement | null>(null);
  const yachiyoStageRef = useRef<HTMLDivElement | null>(null);
  const kaguyaTransform = usePanelTransform(kaguyaStageRef, "left");
  const yachiyoTransform = usePanelTransform(yachiyoStageRef, "right");

  return (
    <>
      {showKaguya && (
        <div
          className={`${styles.panel} ${styles.panelKaguya} ${kaguyaTransform.resizing ? styles.resizing : ""}`}
          style={{
            transform: `translate(${kaguyaTransform.offset.x}px, ${kaguyaTransform.offset.y}px)`,
          }}
        >
          <ResizeHandles onPointerDown={kaguyaTransform.onResizePointerDown} />
          <div className={styles.panelInner}>
            <div
              className={styles.dragHandle}
              onPointerDown={kaguyaTransform.onDragPointerDown}
              style={{
                cursor: kaguyaTransform.dragging ? "grabbing" : "grab",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              <div className={styles.nameTag}>かぐや</div>
            </div>
            <div
              ref={kaguyaStageRef}
              className={styles.stage}
              style={
                kaguyaTransform.size
                  ? { width: kaguyaTransform.size.width, height: kaguyaTransform.size.height }
                  : undefined
              }
            >
              <KaguyaCharacter
                getAmplitude={kaguyaAmplitude}
                smoking={kaguyaSmoking}
                smile={kaguyaSmile}
                placeholder={
                  <div className={styles.placeholder}>
                    かぐや、ただいま準備中です。
                  </div>
                }
              />
            </div>
            <div className={styles.controlBar}>
              <button
                type="button"
                className={`${styles.modeButton} ${kaguyaSingingActive ? styles.active : ""}`}
                onClick={() => setKaguyaSinging((v) => !v)}
                aria-pressed={kaguyaSingingActive}
                aria-label="歌唱モード"
                title="歌唱モード"
              >
                <PiMusicNotesBold size={18} />
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${kaguyaSmoking ? styles.active : ""}`}
                onClick={() => setKaguyaSmoking((v) => !v)}
                aria-pressed={kaguyaSmoking}
                aria-label="たばこモード"
                title="たばこモード"
              >
                <PiCigaretteBold size={18} />
              </button>
              <button
                type="button"
                className={`${styles.modeButton} ${kaguyaSmile ? styles.active : ""}`}
                onClick={() => setKaguyaSmile((v) => !v)}
                aria-pressed={kaguyaSmile}
                aria-label="スマイルモード"
                title="スマイルモード"
              >
                <PiSmileyBold size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showYachiyo && (
        <div
          className={`${styles.panel} ${styles.panelYachiyo} ${yachiyoTransform.resizing ? styles.resizing : ""}`}
          style={{
            transform: `translate(${yachiyoTransform.offset.x}px, ${yachiyoTransform.offset.y}px)`,
          }}
        >
          <ResizeHandles onPointerDown={yachiyoTransform.onResizePointerDown} />
          <div className={styles.panelInner}>
            <div
              className={styles.dragHandle}
              onPointerDown={yachiyoTransform.onDragPointerDown}
              style={{
                cursor: yachiyoTransform.dragging ? "grabbing" : "grab",
                touchAction: "none",
                userSelect: "none",
              }}
            >
              <div className={styles.nameTag}>ヤチヨ</div>
            </div>
            <div
              ref={yachiyoStageRef}
              className={styles.stage}
              style={
                yachiyoTransform.size
                  ? { width: yachiyoTransform.size.width, height: yachiyoTransform.size.height }
                  : undefined
              }
            >
              <YachiyoCharacter
                getAmplitude={yachiyoAmplitude}
                placeholder={<div className={styles.placeholder} />}
              />
            </div>
            <div className={styles.controlBar}>
              <button
                type="button"
                className={`${styles.modeButton} ${yachiyoSingingActive ? styles.active : ""}`}
                onClick={() => setYachiyoSinging((v) => !v)}
                aria-pressed={yachiyoSingingActive}
                aria-label="歌唱モード"
                title="歌唱モード"
              >
                <PiMusicNotesBold size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
