import { CAMERA_FEEL_DEFAULTS } from "./cameraFeelDefaults";
import { createParamStore, type ParamSpec } from "./paramStore";

export type CameraFeelParams = typeof CAMERA_FEEL_DEFAULTS;

export const CAMERA_FEEL_SPECS: ParamSpec<keyof CameraFeelParams>[] = [
  {
    key: "bankGain",
    label: "bank gain",
    step: 0.02,
    comment: "旋回の角速度[rad/s]に掛けるロール量",
  },
  {
    key: "bankMax",
    label: "bank max(rad)",
    step: 0.01,
    comment: "バンクの上限(ラジアン)。0.3 ≒ 17度",
  },
  {
    key: "bankSmooth",
    label: "bank smooth",
    step: 0.1,
    comment: "バンクの追従の速さ(1/秒)",
  },
  {
    key: "breathAmount",
    label: "breath",
    step: 0.002,
    comment: "1小節周期の寄り引きの深さ",
  },
  {
    key: "shakeMin",
    label: "shake min",
    step: 0.01,
    comment: "手持ち風の揺れ(静かな所 / 盛り上がり)",
  },
  { key: "shakeMax", label: "shake max", step: 0.01 },
  {
    key: "followRate",
    label: "follow rate",
    step: 0.5,
    comment: "目標位置へ寄せる速さ(1/秒)",
  },
  {
    key: "minOrbitDistance",
    label: "min distance",
    step: 0.5,
    comment: "塔の軸からの最低水平距離。これ以上は近づけない",
  },
];

export const useCameraFeelStore = createParamStore(CAMERA_FEEL_DEFAULTS);
