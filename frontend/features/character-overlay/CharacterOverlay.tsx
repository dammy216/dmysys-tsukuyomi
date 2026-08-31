"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { PiCigaretteBold, PiMusicNotesBold, PiSmileyBold } from "react-icons/pi";
import { YachiyoCharacter } from "@/features/yachiyo";
import { KaguyaCharacter } from "@/features/kaguya";
import { useSceneStore } from "@/features/root/store";

/* ネオン枠 + 濃紺ガラスのパネル。押下トグルは aria-pressed: バリアントで拾う */
const PANEL =
  "absolute z-10 rounded-[22px] p-[3px] " +
  "top-[calc(var(--header-height,3.75rem)+1.25rem)] " +
  "max-sm:top-[calc(var(--header-height,3.75rem)+0.75rem+env(safe-area-inset-top))]";
const PANEL_SHADOW = "shadow-[0_14px_30px_rgb(0_0_0/0.5)]";
const PANEL_SHADOW_RESIZING =
  "shadow-[0_14px_30px_rgb(0_0_0/0.5),0_0_0_2px_rgb(93_227_230/0.85)]";
const PANEL_KAGUYA =
  "left-[max(1.25rem,8vw)] max-sm:left-[max(0.5rem,env(safe-area-inset-left))] " +
  "bg-[linear-gradient(135deg,var(--color-hud),#7c7ce6_50%,var(--color-hud))]";
const PANEL_YACHIYO =
  "right-[max(1.25rem,8vw)] max-sm:right-[max(0.5rem,env(safe-area-inset-right))] " +
  "bg-[linear-gradient(225deg,var(--color-hud),#7c7ce6_50%,var(--color-hud))]";
const PANEL_INNER =
  "flex flex-col items-center gap-2.5 rounded-[19px] bg-hud-glass px-2.5 py-3 backdrop-blur-sm " +
  "max-sm:gap-2 max-sm:px-1.5 max-sm:py-2";
const DRAG_HANDLE = "flex w-full touch-none select-none justify-center pt-1 pb-0.5";
const NAME_TAG =
  "shrink-0 rounded-full border border-hud/70 bg-hud/12 px-3.5 py-[3px] text-xs font-extrabold " +
  "tracking-[0.08em] text-[#bdf3f5] shadow-[0_0_12px_rgb(93_227_230/0.35)] " +
  "max-sm:px-2.5 max-sm:py-0.5 max-sm:text-[11px]";
const STAGE =
  "h-[320px] w-[200px] shrink-0 overflow-hidden rounded-[14px] bg-[rgb(6_12_24/0.85)] " +
  "shadow-[0_8px_32px_rgb(0_0_0/0.35)] max-sm:h-[190px] max-sm:w-[120px]";
const CTRL_BAR = "flex shrink-0 gap-1.5 max-sm:gap-2";
const MODE_BUTTON =
  "flex size-8 cursor-pointer items-center justify-center rounded-full border border-hud/25 bg-hud/6 p-0 " +
  "text-[1.1rem] leading-none text-white/75 transition duration-200 " +
  "hover:bg-hud/14 hover:border-hud/60 hover:text-white " +
  "aria-pressed:bg-hud/18 aria-pressed:border-hud aria-pressed:text-hud " +
  "aria-pressed:shadow-[0_0_16px_rgb(93_227_230/0.5)]";
const PLACEHOLDER =
  "flex size-full items-center justify-center p-4 text-center text-[0.8rem] text-white/70";

type Offset = { x: number; y: number };
type StageSize = { width: number; height: number };
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_WIDTH = 150;
const MAX_WIDTH = 480;
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 720;

/** ドラッグ時、パネルを画面外へ出しても最低このpxぶんは画面内に残す（スマホで見失わないため） */
const KEEP_VISIBLE = 56;

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
  panelRef: RefObject<HTMLDivElement | null>,
  anchorSide: "left" | "right",
) {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [size, setSize] = useState<StageSize | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);

  /*
   * ドラッグ/リサイズ中は state を一切更新せず、最新値を live ref に持って
   * DOM (panel.style.transform / stage.style.width,height) へ直接書き込む。
   * → その間 CharacterOverlay は再レンダーしない。毎フレームの再レンダーが
   *   誘発していた Rive の再描画ラグや React の
   *   "Maximum update depth exceeded" を根本から回避する。
   * ポインタを離した時に live を state へ確定する（React が同じ値を当てるので
   *   ちらつかない）。
   */
  const live = useRef<{ offset: Offset; size: StageSize | null }>({ offset, size });
  // 操作していない間だけ、外からの state 変化（初期化・reclamp）に live を追従させる
  useEffect(() => {
    if (!dragging && !resizing) live.current = { offset, size };
  }, [offset, size, dragging, resizing]);

  const rafId = useRef<number | null>(null);
  const paint = useCallback(() => {
    rafId.current = null;
    const panel = panelRef.current;
    const stage = stageRef.current;
    if (panel) {
      panel.style.transform = `translate(${live.current.offset.x}px, ${live.current.offset.y}px)`;
    }
    if (stage && live.current.size) {
      stage.style.width = `${live.current.size.width}px`;
      stage.style.height = `${live.current.size.height}px`;
    }
  }, [panelRef, stageRef]);
  const schedulePaint = useCallback(() => {
    if (rafId.current == null) rafId.current = requestAnimationFrame(paint);
  }, [paint]);
  const cancelPaint = useCallback(() => {
    if (rafId.current != null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }, []);
  useEffect(() => cancelPaint, [cancelPaint]);

  const dragStart = useRef<{
    pointerX: number;
    pointerY: number;
    origin: Offset;
    startRect: DOMRect | null;
  } | null>(null);
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
      dragStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        origin: live.current.offset,
        startRect: panelRef.current?.getBoundingClientRect() ?? null,
      };
      setDragging(true);

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!dragStart.current) return;
        const { pointerX, pointerY, origin, startRect } = dragStart.current;
        let x = origin.x + (ev.clientX - pointerX);
        let y = origin.y + (ev.clientY - pointerY);
        // パネルが画面外へ消えないよう、掴んだ時点の矩形を基準に offset を制限する
        if (startRect) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          x = clamp(
            x,
            origin.x + KEEP_VISIBLE - startRect.right,
            origin.x + vw - KEEP_VISIBLE - startRect.left,
          );
          y = clamp(
            y,
            origin.y + KEEP_VISIBLE - startRect.bottom,
            origin.y + vh - KEEP_VISIBLE - startRect.top,
          );
        }
        live.current = { ...live.current, offset: { x, y } };
        schedulePaint();
      };
      const onPointerUp = () => {
        dragStart.current = null;
        cancelPaint();
        setOffset(live.current.offset);
        setDragging(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [panelRef, schedulePaint, cancelPaint],
  );

  const onResizePointerDown = useCallback(
    (dir: ResizeDir) => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = stageRef.current?.getBoundingClientRect();
      const startSize =
        live.current.size ??
        (rect ? { width: rect.width, height: rect.height } : { width: 200, height: 320 });
      resizeStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        startSize,
        startOffset: live.current.offset,
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

        live.current = { offset: { x, y }, size: { width, height } };
        schedulePaint();
      };
      const onPointerUp = () => {
        resizeStart.current = null;
        cancelPaint();
        setSize(live.current.size);
        setOffset(live.current.offset);
        setResizing(false);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [stageRef, anchorSide, schedulePaint, cancelPaint],
  );

  // 画面回転・リサイズでパネルが画面外に取り残されたら引き戻す
  useEffect(() => {
    const reclamp = () => {
      const el = panelRef.current;
      if (!el) return;
      setOffset((prev) => {
        const rect = el.getBoundingClientRect();
        const baseLeft = rect.left - prev.x;
        const baseTop = rect.top - prev.y;
        const baseRight = rect.right - prev.x;
        const baseBottom = rect.bottom - prev.y;
        const x = clamp(
          prev.x,
          KEEP_VISIBLE - baseRight,
          window.innerWidth - KEEP_VISIBLE - baseLeft,
        );
        const y = clamp(
          prev.y,
          KEEP_VISIBLE - baseBottom,
          window.innerHeight - KEEP_VISIBLE - baseTop,
        );
        return x === prev.x && y === prev.y ? prev : { x, y };
      });
    };
    window.addEventListener("resize", reclamp);
    window.addEventListener("orientationchange", reclamp);
    return () => {
      window.removeEventListener("resize", reclamp);
      window.removeEventListener("orientationchange", reclamp);
    };
  }, [panelRef]);

  return { offset, size, dragging, resizing, onDragPointerDown, onResizePointerDown };
}

/*
 * パネルをブラウザのwindowのように、枠のどこを掴むかで伸縮方向が変わる形でリサイズするハンドル群。
 * 上下左右の辺と四隅をそれぞれ独立した当たり判定にする。サイズ(10〜18px)・見た目(不可視)は
 * PC・スマホ共通。
 */
const RESIZE_HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: "n", className: "absolute z-[6] left-3.5 right-3.5 top-[-5px] h-2.5 cursor-ns-resize" },
  { dir: "s", className: "absolute z-[6] left-3.5 right-3.5 bottom-[-5px] h-2.5 cursor-ns-resize" },
  { dir: "e", className: "absolute z-[6] top-3.5 bottom-3.5 right-[-5px] w-2.5 cursor-ew-resize" },
  { dir: "w", className: "absolute z-[6] top-3.5 bottom-3.5 left-[-5px] w-2.5 cursor-ew-resize" },
  { dir: "nw", className: "absolute z-[7] size-[18px] top-[-6px] left-[-6px] cursor-nwse-resize" },
  { dir: "ne", className: "absolute z-[7] size-[18px] top-[-6px] right-[-6px] cursor-nesw-resize" },
  { dir: "sw", className: "absolute z-[7] size-[18px] bottom-[-6px] left-[-6px] cursor-nesw-resize" },
  { dir: "se", className: "absolute z-[7] size-[18px] bottom-[-6px] right-[-6px] cursor-nwse-resize" },
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
          className={`${className} touch-none`}
          onPointerDown={onPointerDown(dir)}
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
  /** 星降る海のボーカルの音量(0〜1)を返す */
  getSongAmplitude?: () => number;
};

/** 3Dシーン上に重ねる、かぐや／ヤチヨの表示パネル。表示・非表示は下部のコントロールバーで切り替える */
export function CharacterOverlay({ getSongAmplitude }: CharacterOverlayProps) {
  const showKaguya = useSceneStore((s) => s.showKaguya);
  const showYachiyo = useSceneStore((s) => s.showYachiyo);
  /*
    星降る海の再生中は songActive が true になり、ヤチヨは疑似波形ではなく
    実際のボーカルの音量に合わせて口を動かす。
  */
  const songActive = useSceneStore((s) => s.starfallSea);
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
  const kaguyaPanelRef = useRef<HTMLDivElement | null>(null);
  const yachiyoPanelRef = useRef<HTMLDivElement | null>(null);
  const kaguyaTransform = usePanelTransform(kaguyaStageRef, kaguyaPanelRef, "left");
  const yachiyoTransform = usePanelTransform(yachiyoStageRef, yachiyoPanelRef, "right");

  return (
    <>
      {showKaguya && (
        <div
          ref={kaguyaPanelRef}
          className={`${PANEL} ${PANEL_KAGUYA} ${kaguyaTransform.resizing ? PANEL_SHADOW_RESIZING : PANEL_SHADOW}`}
          style={{
            transform: `translate(${kaguyaTransform.offset.x}px, ${kaguyaTransform.offset.y}px)`,
          }}
        >
          <ResizeHandles onPointerDown={kaguyaTransform.onResizePointerDown} />
          <div className={PANEL_INNER}>
            <div
              className={DRAG_HANDLE}
              onPointerDown={kaguyaTransform.onDragPointerDown}
              style={{ cursor: kaguyaTransform.dragging ? "grabbing" : "grab" }}
            >
              <div className={NAME_TAG}>かぐや</div>
            </div>
            <div
              ref={kaguyaStageRef}
              className={STAGE}
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
                  <div className={PLACEHOLDER}>かぐや、ただいま準備中です。</div>
                }
              />
            </div>
            <div className={CTRL_BAR}>
              <button
                type="button"
                className={MODE_BUTTON}
                onClick={() => setKaguyaSinging((v) => !v)}
                aria-pressed={kaguyaSingingActive}
                aria-label="歌唱モード"
                title="歌唱モード"
              >
                <PiMusicNotesBold size={18} />
              </button>
              <button
                type="button"
                className={MODE_BUTTON}
                onClick={() => setKaguyaSmoking((v) => !v)}
                aria-pressed={kaguyaSmoking}
                aria-label="たばこモード"
                title="たばこモード"
              >
                <PiCigaretteBold size={18} />
              </button>
              <button
                type="button"
                className={MODE_BUTTON}
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
          ref={yachiyoPanelRef}
          className={`${PANEL} ${PANEL_YACHIYO} ${yachiyoTransform.resizing ? PANEL_SHADOW_RESIZING : PANEL_SHADOW}`}
          style={{
            transform: `translate(${yachiyoTransform.offset.x}px, ${yachiyoTransform.offset.y}px)`,
          }}
        >
          <ResizeHandles onPointerDown={yachiyoTransform.onResizePointerDown} />
          <div className={PANEL_INNER}>
            <div
              className={DRAG_HANDLE}
              onPointerDown={yachiyoTransform.onDragPointerDown}
              style={{ cursor: yachiyoTransform.dragging ? "grabbing" : "grab" }}
            >
              <div className={NAME_TAG}>ヤチヨ</div>
            </div>
            <div
              ref={yachiyoStageRef}
              className={STAGE}
              style={
                yachiyoTransform.size
                  ? { width: yachiyoTransform.size.width, height: yachiyoTransform.size.height }
                  : undefined
              }
            >
              <YachiyoCharacter
                getAmplitude={yachiyoAmplitude}
                placeholder={<div className={PLACEHOLDER} />}
              />
            </div>
            <div className={CTRL_BAR}>
              <button
                type="button"
                className={MODE_BUTTON}
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
