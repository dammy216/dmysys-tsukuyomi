/**
 * カメラが向いている方位(度)。**0 = 北 = ワールドの -Z 方向**、時計回りに
 * 東 90 / 南 180 / 西 270。カメラの初期姿勢(position [0,3,11] から原点方向)は
 * ほぼ -Z を向いているので、起動直後は 0(北)になる。
 *
 * SceneContents の useFrame が毎フレームここへ書き、Compass(DOM)が
 * requestAnimationFrame で読んで針を回す。state/store にすると毎フレーム
 * 再レンダーが走るので、共有可変オブジェクトにして DOM を直接いじる
 * (「毎フレーム変わる演出値は ref」の方針と同じ)。
 */
export const cameraHeading = { deg: 0 };
