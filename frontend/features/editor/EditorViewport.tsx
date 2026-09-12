"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

/**
 * EditorLayout が描く3Dビューポート(children=3Dキャンバス+再生ツールバーを
 * まとめた箱)の縦横比・大きさをユーザーがドラッグで調整できるようにする。
 * 通常画面・編集モードのどちらでも常時有効(ユーザー指定: 編集モードの
 * ビューポートの見た目・操作感を通常画面にもそのまま持ち込むため)。
 * CharacterOverlay のかぐや/ヤチヨパネルと同じ「窓の縁を掴んで伸縮する」
 * 操作感を踏襲するが、こちらはオフセット(位置)は持たない。
 *
 * 横方向は中央寄せ(縮めても左右中央のまま)、縦方向は**上端固定**
 * (縮めても常に上にくっつく。画面の余白は下側にだけ空く)。
 * この非対称性ぶん、リサイズの計算も横(e/w)と縦(n/s)で分けてある
 * (下の onPointerMove 内のコメント参照)。
 */

type Size = { width: number; height: number };
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** これ以上は小さくしない(操作できなくなるため) */
const MIN_WIDTH = 320;
const MIN_HEIGHT = 180;
/**
 * 高さの上限に足す余白(親の利用可能領域の高さから引く分)。
 * 0 = 下端をタイムライン(Sequence Editor パネル)の上端ぴったりまで下げられる。
 * 一度手でリサイズすると size-full が外れるため、この値が大きいと映像の箱を
 * タイムライン手前で止められてしまい、下端まで戻せなくなる。
 */
const MAX_HEIGHT_MARGIN = 0;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * サイズをlocalStorageへ覚えておく。編集モードを抜けると EditorViewport
 * ごとアンマウントされて state が消えるため、リサイズしても次に編集モードへ
 * 入り直すと(あるいはページを再読み込みすると)元に戻ってしまっていた。
 *
 * **キーに `-v2` が付いている。** 開発中にリサイズ・画面比率プリセットを
 * 試した結果、最大表示ではないサイズが `editor-viewport-size` として
 * 残ってしまっていて、それが通常画面にも復元され「初めて開いたときから
 * 最大表示になっていない」ように見えていた(ユーザー指摘)。共有の仕組み
 * (通常画面と編集モードで同じキーを使う)自体は変えず、キー名だけ更新して
 * 古い保存値を無効化し、次に開いたときは size=null(=最大表示)から
 * 始まるようにしてある。
 */
const STORAGE_KEY = "editor-viewport-size-v2";

function loadStoredSize(): Size | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "width" in parsed &&
      "height" in parsed &&
      typeof (parsed as Size).width === "number" &&
      typeof (parsed as Size).height === "number"
    ) {
      return parsed as Size;
    }
  } catch {
    // 読めなければ初回起動時と同じ扱い(size=null → 親いっぱいの既定サイズ)
  }
  return null;
}

function saveStoredSize(size: Size) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(size));
  } catch {
    // プライベートブラウズ等で書けなくても致命的ではないので無視する
  }
}

/**
 * サイズを live ref に持ち、ドラッグ中は rAF で DOM へ直接書き込む
 * (CharacterOverlay の usePanelTransform と同じ狙い。毎フレームの
 * 再レンダーで 3D シーンがちらつくのを避ける)。
 */
function useResizableStage(onManualResize?: () => void) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  /*
    初期値は SSR と同じ null にしておく(size-full の既定サイズ)。
    localStorage はサーバーには無いため、ここで直接 loadStoredSize() を
    初期値にすると「サーバーは null 前提でHTMLを吐く」→「クライアントの
    初回レンダーは保存済みサイズ」という食い違いが起きてhydrationエラーに
    なっていた(このビューポートは以前は編集モードに入って初めてマウントされる
    ものだったのでSSRに載らず問題化しなかったが、通常画面にも常設したことで
    露見した)。保存済みサイズは mount 後の useEffect で読み、あれば
    そこで初めて反映する。
  */
  const [size, setSize] = useState<Size | null>(null);
  const [resizing, setResizing] = useState(false);

  useEffect(() => {
    const stored = loadStoredSize();
    // localStorageはサーバーに無いため、読めるのはマウント後のこの時点だけ
    // (= 初期値をnullにしてSSRと揃えたぶん、ここで1回だけ反映する)。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setSize(stored);
  }, []);

  const live = useRef<Size | null>(size);
  useEffect(() => {
    if (!resizing) live.current = size;
  }, [size, resizing]);

  const rafId = useRef<number | null>(null);
  const paint = useCallback(() => {
    rafId.current = null;
    const stage = stageRef.current;
    if (stage && live.current) {
      stage.style.width = `${live.current.width}px`;
      stage.style.height = `${live.current.height}px`;
    }
  }, []);
  const schedulePaint = useCallback(() => {
    if (rafId.current == null) rafId.current = requestAnimationFrame(paint);
  }, [paint]);
  useEffect(() => {
    return () => {
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  const resizeStart = useRef<{
    pointerX: number;
    pointerY: number;
    startSize: Size;
    dir: ResizeDir;
  } | null>(null);

  const onResizePointerDown = useCallback(
    (dir: ResizeDir) => (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = stageRef.current?.getBoundingClientRect();
      const startSize =
        live.current ??
        (rect
          ? { width: rect.width, height: rect.height }
          : { width: 960, height: 540 });
      const container = stageRef.current?.parentElement?.getBoundingClientRect();
      // 親(中央寄せしている箱)より大きくはできない = リサイズハンドルが画面外へ出ない
      const maxWidth = container ? container.width : Number.POSITIVE_INFINITY;
      const maxHeight = container
        ? container.height - MAX_HEIGHT_MARGIN
        : Number.POSITIVE_INFINITY;

      resizeStart.current = { pointerX: e.clientX, pointerY: e.clientY, startSize, dir };
      setResizing(true);

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        if (!resizeStart.current) return;
        const { pointerX, pointerY, startSize: start, dir: d } = resizeStart.current;
        const dx = ev.clientX - pointerX;
        const dy = ev.clientY - pointerY;
        let width = start.width;
        let height = start.height;
        if (d.includes("e") || d.includes("w")) {
          /*
            横は中央寄せなので、片側を掴んでも「その辺との距離」ぶんの
            2倍を伸縮させる(中心が動かないよう、左右の縁を同時に動かす)。
          */
          const delta = d.includes("e") ? dx : -dx;
          width = clamp(start.width + delta * 2, MIN_WIDTH, maxWidth);
        }
        if (d.includes("s") || d.includes("n")) {
          /*
            縦は上端固定なので、動くのは下端だけ。等倍(1:1)でよい
            (2倍にすると上端は動かないのに下端がマウスの2倍速で動いてしまう)。
          */
          const delta = d.includes("s") ? dy : -dy;
          height = clamp(start.height + delta, MIN_HEIGHT, maxHeight);
        }
        live.current = { width, height };
        schedulePaint();
      };
      const onPointerUp = () => {
        resizeStart.current = null;
        setSize(live.current);
        if (live.current) saveStoredSize(live.current);
        setResizing(false);
        // 手でリサイズした = テンプレ適用中の表示は解除する(EditorLayout側)
        onManualResize?.();
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [schedulePaint, onManualResize],
  );

  /**
   * アスペクト比のテンプレ適用(EditorAspectRatioMenu から呼ぶ)。
   * 「今表示できる最大の高さ」ではなく、**ユーザーが今リサイズしている
   * 高さ**を基準にし、幅だけをその比率から逆算する(まだ一度もリサイズ
   * していない場合だけ、フォールバックとして親の高さいっぱいを使う)。
   */
  const applyAspectRatio = useCallback((ratioW: number, ratioH: number) => {
    const container = stageRef.current?.parentElement?.getBoundingClientRect();
    const maxHeight = container
      ? container.height - MAX_HEIGHT_MARGIN
      : Number.POSITIVE_INFINITY;
    const baseHeight = live.current?.height ?? container?.height;
    if (baseHeight == null) return;
    const height = clamp(baseHeight, MIN_HEIGHT, maxHeight);
    const width = clamp((height * ratioW) / ratioH, MIN_WIDTH, Number.POSITIVE_INFINITY);
    const next = { width, height };
    live.current = next;
    setSize(next);
    saveStoredSize(next);
  }, []);

  return { stageRef, size, resizing, onResizePointerDown, applyAspectRatio };
}

export type EditorViewportHandle = {
  /** 現在の高さ(=今リサイズしている高さ)のまま、幅をその比率に合わせ直す */
  applyAspectRatio: (ratioW: number, ratioH: number) => void;
};

/*
  z-index は EditorLayout 側のパネル境界ドラッグハンドル(z-20。Outline/Details/
  Sequence Editor の大きさを変えるためのもの)より必ず高くする。ビューポートの
  既定サイズ(size=null="size-full")は左右パネルの境界とほぼ同じ画面位置に
  重なるため、ここの z-index が負けているとビューポート自体のリサイズ操作を
  パネル境界側に奪われてしまう(実際に発生した不具合: ドラッグしても
  outline-ed-accent の枠が出ず、代わりに隣のパネル幅が変わっていた)。
*/
const RESIZE_HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: "n", className: "absolute z-30 left-4 right-4 top-[-5px] h-2.5 cursor-ns-resize" },
  { dir: "s", className: "absolute z-30 left-4 right-4 bottom-[-5px] h-2.5 cursor-ns-resize" },
  { dir: "e", className: "absolute z-30 top-4 bottom-4 right-[-5px] w-2.5 cursor-ew-resize" },
  { dir: "w", className: "absolute z-30 top-4 bottom-4 left-[-5px] w-2.5 cursor-ew-resize" },
  { dir: "nw", className: "absolute z-40 size-4 top-[-6px] left-[-6px] cursor-nwse-resize" },
  { dir: "ne", className: "absolute z-40 size-4 top-[-6px] right-[-6px] cursor-nesw-resize" },
  { dir: "sw", className: "absolute z-40 size-4 bottom-[-6px] left-[-6px] cursor-nesw-resize" },
  { dir: "se", className: "absolute z-40 size-4 bottom-[-6px] right-[-6px] cursor-nwse-resize" },
];

export const EditorViewport = forwardRef<
  EditorViewportHandle,
  {
    children: ReactNode;
    onManualResize?: () => void;
  }
>(function EditorViewport({ children, onManualResize }, ref) {
  const { stageRef, size, resizing, onResizePointerDown, applyAspectRatio } =
    useResizableStage(onManualResize);
  useImperativeHandle(ref, () => ({ applyAspectRatio }), [applyAspectRatio]);

  return (
    <div className="flex size-full items-start justify-center">
      <div
        ref={stageRef}
        className={
          "relative max-h-full max-w-full " +
          (size ? "" : "size-full") +
          /*
            リサイズ中の枠。この要素にも親(flexの入れ物)にも
            overflow-hidden を付けていない: 付けると、下のリサイズ
            ハンドルは掴みやすさのため箱の外側へ少しはみ出す作りに
            なっているため、はみ出た分がクリップされて実質つかめなくなる
            (実際に発生した不具合: ドラッグしても枠が出ない代わりに
            隣のOutline/Detailsパネルの幅が変わってしまっていた=
            ハンドルの当たり判定がクリップで消え、後ろのパネル境界
            ハンドルにクリックが素通りしていた)。3D映像自体の見た目の
            角丸/クリップは EditorLayout 側が children を包む内側の
            div(overflow-hidden)で別途担っているので、ここで外しても
            映像がはみ出て見えることはない。
          */
          (resizing ? " outline outline-2 -outline-offset-2 outline-ed-accent/80" : "")
        }
        style={size ? { width: size.width, height: size.height } : undefined}
      >
        {children}
        {RESIZE_HANDLES.map(({ dir, className }) => (
          <div
            key={dir}
            className={`${className} touch-none`}
            onPointerDown={onResizePointerDown(dir)}
          />
        ))}
      </div>
    </div>
  );
});
