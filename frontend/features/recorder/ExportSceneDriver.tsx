"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { useSceneStore } from "@/features/root/store";

/**
 * <Canvas> の内側に常駐し、R3F の advance/setSize/setDpr/setFrameloop
 * (useThree() 経由でしか取れない)を useSceneStore へ橋渡しする。
 *
 * features/recorder/ の書き出し処理は Canvas の外側(ExportPanel、DOM側)で
 * 動くため、この橋渡しが無いと手動フレーム駆動(frameloop="never" +
 * advance(t))に必要な関数へ到達できない。書き出し中以外は何もしない。
 */
export function ExportSceneDriver() {
  const gl = useThree((s) => s.gl);
  const advance = useThree((s) => s.advance);
  const setSize = useThree((s) => s.setSize);
  const setDpr = useThree((s) => s.setDpr);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const get = useThree((s) => s.get);

  useEffect(() => {
    useSceneStore.getState().setExportDriver({
      gl,
      advance: (timestampSeconds) => advance(timestampSeconds),
      setSize: (width, height) => setSize(width, height),
      setDpr: (dpr) => setDpr(dpr),
      setFrameloop: (frameloop) => setFrameloop(frameloop),
      getSize: () => get().size,
      getDpr: () => get().viewport.dpr,
    });

    return () => {
      useSceneStore.getState().setExportDriver(null);
    };
  }, [gl, advance, setSize, setDpr, setFrameloop, get]);

  return null;
}
