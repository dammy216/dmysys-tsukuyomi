"use client";

import {
  useCameraFeelStore,
  useDronePathStore,
  type CameraFeelParams,
  type DroneKey,
} from "@/features/reply";
import { useSceneStore } from "@/features/root/store";

/**
 * 編集モードのUndo/Redo。DronePath・CameraFeel の2ストアを
 * ひとまとまりの「ドキュメント」として、Ctrl+Z(戻す)/Ctrl+Y または
 * Ctrl+Shift+Z(進める)でまとめて操作できるようにする。
 *
 * **継続的な操作(ドラッグ)は1回のUndoでまとめて戻す**。値が変わるたびに
 * 逐一記録すると、1pxドラッグするたびに1エントリ積まれてUndoがほぼ使い物に
 * ならない。そのため各ストアの変化を購読し、COMMIT_DELAY_MS だけ変化が
 * 止まったところで初めて1エントリとして確定する(コアレス)。
 *
 * Ctrl+Z を押した瞬間にまだ確定していない下書き(ドラッグ直後など)が
 * あれば、undo() の中で先にそれを確定させてから1手戻す。そうしないと
 * 「ドラッグを終えてすぐCtrl+Z」がドラッグ前ではなくドラッグ開始前の
 * さらに1つ前まで戻ってしまう/何も起きない、といった食い違いになる。
 *
 * **時間ベースのデバウンスだけでは不十分**。ドラッグが COMMIT_DELAY_MS
 * より長く続くと、まだ指を離していないのに1エントリ確定してしまい、
 * 1回のUndoでドラッグ全体を戻せなくなる(実測: 遅いドラッグの終盤だけ
 * 戻って手前まで戻らない不具合になっていた)。そのため EditorNumberField /
 * EditorTimeline のドラッグは beginGesture()/endGesture() で区間を明示し、
 * その区間内は時間デバウンスを完全に止め、指を離した瞬間にまとめて
 * 1エントリだけ確定させる。
 */

type Snapshot = {
  dronePath: DroneKey[];
  cameraFeel: CameraFeelParams;
};

/** 変化がこの時間(ms)止まったら1エントリとして確定する */
const COMMIT_DELAY_MS = 400;
/** 際限なく積まないための上限 */
const MAX_HISTORY = 200;

let present: Snapshot | null = null;
const past: Snapshot[] = [];
const future: Snapshot[] = [];
/** applySnapshot 中の変化は記録しない(undo/redoが新たなundo対象にならないため) */
let applying = false;
let debounceId: ReturnType<typeof setTimeout> | undefined;
let initialized = false;
/**
 * 0より大きい間はドラッグ中(beginGesture〜endGesture)。この間は
 * scheduleCommit() が時間デバウンスを一切仕掛けず、endGesture() で
 * まとめて1回だけ確定させる。ネストは想定していないが、念のため
 * カウンタにしてある(0未満にはならない)。
 */
let gestureDepth = 0;

function cloneSnapshot(): Snapshot {
  return {
    dronePath: useDronePathStore.getState().keyframes.map((k) => ({ ...k })),
    cameraFeel: { ...useCameraFeelStore.getState().values },
  };
}

function snapshotsEqual(a: Snapshot, b: Snapshot) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applySnapshot(snap: Snapshot) {
  applying = true;
  useDronePathStore.getState().setKeyframes(snap.dronePath.map((k) => ({ ...k })));
  useCameraFeelStore.getState().setValues({ ...snap.cameraFeel });
  applying = false;
}

/** 保留中の変化があれば、今の値を1エントリとして確定する */
function commitPending() {
  clearTimeout(debounceId);
  debounceId = undefined;
  const next = cloneSnapshot();
  if (present === null) {
    present = next;
    return;
  }
  if (!snapshotsEqual(present, next)) {
    past.push(present);
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
    present = next;
  }
}

function scheduleCommit() {
  if (applying) return;
  if (present === null) {
    present = cloneSnapshot();
    return;
  }
  // ドラッグ中は endGesture() が呼ばれるまで確定させない(下のコメント参照)
  if (gestureDepth > 0) return;
  clearTimeout(debounceId);
  debounceId = setTimeout(commitPending, COMMIT_DELAY_MS);
}

/**
 * ドラッグ開始を知らせる。呼んだ時点の値を「ドラッグ前」として確定させ
 * (＝直前の変化がまだ未確定なら先に1エントリにする)、ドラッグ中は
 * scheduleCommit() の時間デバウンスを止める。
 */
export function beginGesture() {
  gestureDepth++;
  if (gestureDepth === 1) commitPending();
}

/** ドラッグ終了を知らせる。ドラッグ全体の結果をここで1エントリだけ確定する */
export function endGesture() {
  gestureDepth = Math.max(0, gestureDepth - 1);
  if (gestureDepth === 0) commitPending();
}

function undo() {
  commitPending();
  const prev = past.pop();
  if (!prev || present === null) return;
  future.push(present);
  present = prev;
  applySnapshot(present);
}

function redo() {
  const next = future.pop();
  if (!next) return;
  if (present !== null) past.push(present);
  present = next;
  applySnapshot(present);
}

function onKeyDown(e: KeyboardEvent) {
  // 編集モード中のみ
  if (!useSceneStore.getState().editorMode) return;
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if (key === "y" || (key === "z" && e.shiftKey)) {
    e.preventDefault();
    redo();
  }
}

/**
 * 一度だけ初期化する。EditorLayout の useEffect から呼ぶ想定
 * (StrictMode等で複数回呼ばれても initialized フラグで二重登録を防ぐ)。
 */
export function initEditorHistory() {
  if (initialized) return;
  initialized = true;

  present = cloneSnapshot();
  useDronePathStore.subscribe(scheduleCommit);
  useCameraFeelStore.subscribe(scheduleCommit);
  window.addEventListener("keydown", onKeyDown);
}
