"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Vector2,
} from "three";
import type { ShaderMaterial } from "three";

/*
  曲名「星降る海」にちなんで、転調(動画1:22)から夜空に流れ星を降らせる。

  1本の流れ星は「頭の光点＋後ろに伸びる尾」でできた細長い四角形(quad)。
  カメラの方を向く板(ビルボード)としてシェーダー側で組み立て、
  1つのInstancedMeshではなく1つのMeshにまとめた自前ジオメトリで描く
  (本数が百本程度と少なく、頂点数にすると千に届かない。instancingにするより
  素直に頂点を並べたほうが実装も描画も単純に済む。
  StarfallSwarmのような数万匹とは規模が違う)。

  流れる向き・速さ・長さ・タイミングは星ごとにばらけさせ、
  一定間隔で機械的に降ってこないようにしている。
*/

/**
 * 流れ星の本数。1本あたり周期の1/4しか流れない(下のphase参照)ので、
 * 同時に見えるのはおおよそこの1/4程度。
 */
const STAR_COUNT = 100;
/** 星が現れる高さの範囲(鳥居の位置基準)。魚の渦(上端46)より上の夜空に降らせる */
const HEIGHT_MIN = 30;
const HEIGHT_MAX = 95;
/** 星が流れる水平方向の広がり(半径)。画面外から入ってきて画面外へ抜ける長さを持たせる */
const SPREAD = 190;
/** 1本が流れきるのにかかる秒数の範囲。短いほど素早く横切る */
const LIFE_MIN = 1.1;
const LIFE_MAX = 2.4;
/** 尾の長さ(ワールド単位)の範囲 */
const TRAIL_MIN = 14;
const TRAIL_MAX = 34;
/** 尾の太さ(ワールド単位)。細いほど鋭い筋になる */
const THICKNESS = 0.5;
/*
  カメラに近づいた星を消すための距離(ワールド単位)。
  星は半径190の範囲を横切るのでカメラのすぐ横やほぼ真上を通ることがあり、
  そのとき細い筋が画面いっぱいの帯に化けて一瞬白く光ってしまう。
  NEAR_FADE_MIN より近い星は完全に消し、NEAR_FADE_MAX で元の明るさに戻す。
*/
const NEAR_FADE_MIN = 16;
const NEAR_FADE_MAX = 48;

/** 頭(先端)の色。白に近いほうが「流れ星」らしく抜ける */
const HEAD_COLOR = new Color("#ffffff");
/** 尾の後ろ側の色。シーンの水色〜青に馴染ませる */
const TAIL_COLOR = new Color("#7fd4ff");

const FIELD_SEED = 60271;

/** シード値から0〜1の疑似乱数を返す決定的なジェネレータ(mulberry32) */
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
  流れ星1本ぶんの板(2三角形=6頂点)をまとめた1つのジオメトリを作る。

  各頂点には
    aCorner … 板の中でのローカル位置(x:尾方向0〜1, y:太さ方向-1〜1)
    aStart  … 流れ始めの座標
    aDir    … 流れる向き(正規化済み)
    aParam  … x:寿命(秒) y:位相(秒) z:尾の長さ w:明るさ
  を持たせ、頂点シェーダーで「今この星がどこにいるか」を組み立てる。
*/
function createStarGeometry() {
  const random = mulberry32(FIELD_SEED);
  const geo = new BufferGeometry();

  const corners = new Float32Array(STAR_COUNT * 6 * 2);
  const starts = new Float32Array(STAR_COUNT * 6 * 3);
  const dirs = new Float32Array(STAR_COUNT * 6 * 3);
  const params = new Float32Array(STAR_COUNT * 6 * 4);

  // 板1枚ぶんの頂点順(2三角形)。x=尾方向, y=太さ方向
  const quad = [
    [0, -1],
    [1, -1],
    [1, 1],
    [0, -1],
    [1, 1],
    [0, 1],
  ];

  for (let i = 0; i < STAR_COUNT; i++) {
    /*
      斜め下向きに流れる向きを作る。真横だとカーテンのように見え、
      真下だと雨に見えるため、水平方向を主にしつつ下向きを少し混ぜる。
    */
    const yaw = random() * Math.PI * 2;
    const fall = 0.25 + random() * 0.35;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const len = Math.sqrt(dx * dx + dz * dz + fall * fall);

    // 流れる向きと反対側の端から始めて、画面を横切ってから消えるようにする
    const sx = -dx * SPREAD * (0.5 + random() * 0.5);
    const sz = -dz * SPREAD * (0.5 + random() * 0.5);
    const sy = HEIGHT_MIN + random() * (HEIGHT_MAX - HEIGHT_MIN);

    const life = LIFE_MIN + random() * (LIFE_MAX - LIFE_MIN);
    // 位相は寿命より広い範囲に散らし、降ってくる間隔を不規則にする
    const phase = random() * (LIFE_MAX * 4);
    const trail = TRAIL_MIN + random() * (TRAIL_MAX - TRAIL_MIN);
    const brightness = 0.55 + random() * 0.45;

    for (let v = 0; v < 6; v++) {
      const o2 = (i * 6 + v) * 2;
      corners[o2] = quad[v][0];
      corners[o2 + 1] = quad[v][1];

      const o3 = (i * 6 + v) * 3;
      starts[o3] = sx;
      starts[o3 + 1] = sy;
      starts[o3 + 2] = sz;
      dirs[o3] = dx / len;
      dirs[o3 + 1] = -fall / len;
      dirs[o3 + 2] = dz / len;

      const o4 = (i * 6 + v) * 4;
      params[o4] = life;
      params[o4 + 1] = phase;
      params[o4 + 2] = trail;
      params[o4 + 3] = brightness;
    }
  }

  /*
    position は使わないが、three は position 属性が無いジオメトリを
    描画できない(境界球の計算などで必ず参照される)ため、
    ダミーとして0埋めのものを入れておく。
  */
  geo.setAttribute("position", new BufferAttribute(new Float32Array(STAR_COUNT * 6 * 3), 3));
  geo.setAttribute("aCorner", new BufferAttribute(corners, 2));
  geo.setAttribute("aStart", new BufferAttribute(starts, 3));
  geo.setAttribute("aDir", new BufferAttribute(dirs, 3));
  geo.setAttribute("aParam", new BufferAttribute(params, 4));

  return geo;
}

const vertexShader = /* glsl */ `
attribute vec2 aCorner;
attribute vec3 aStart;
attribute vec3 aDir;
attribute vec4 aParam; // x:life y:phase z:trail w:brightness

uniform float uTime;
uniform float uSpread;
uniform float uThickness;
uniform vec2 uNearFade; // x:ここより近い星は消す y:ここまで離れれば元の明るさ

varying float vAlongTail;
varying float vAcross;
varying float vFade;

void main() {
  float life = aParam.x;
  float phase = aParam.y;
  float trail = aParam.z;
  float brightness = aParam.w;

  vAlongTail = aCorner.x;
  vAcross = aCorner.y;

  // 0〜1で流れ始め→流れ終わり。剰余で折り返し、繰り返し降ってくる
  float cycle = life * 4.0;
  float t = mod(uTime + phase, cycle) / life;

  /*
    寿命(0〜1)の間だけ流れ、それ以外の時間は消しておく。
    こうすることで「たまに降ってくる」間隔が生まれる。
  */
  float alive = step(t, 1.0);
  // 出はじめと消えぎわをなめらかにする
  float inOut = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.75, 1.0, t));

  // 頭の現在位置。開始点から向きに沿って進む
  vec3 head = aStart + aDir * (t * uSpread);
  // aCorner.x が0で頭、1で尾の末端
  vec3 pos = head - aDir * (aCorner.x * trail);

  /*
    カメラに近づきすぎた星を消す。半径190の範囲を横切るので
    カメラのすぐ脇を通ることがあり、そのとき細い筋が画面を覆う帯に化けて
    一瞬まぶしく光る。頭と尾の末端の近いほうで判定する。
  */
  vec3 headView = (modelViewMatrix * vec4(head, 1.0)).xyz;
  vec3 tailView = (modelViewMatrix * vec4(head - aDir * trail, 1.0)).xyz;
  float camDist = min(length(headView), length(tailView));
  float nearFade = smoothstep(uNearFade.x, uNearFade.y, camDist);

  vFade = alive * inOut * brightness * nearFade;

  /*
    見えない星はここで打ち切り、板そのものをクリップ空間の外(z>w)へ飛ばして
    ラスタライズさせない。

    以前は消えている間も板を描き続けていた。周期の3/4は消えている
    (alive=0)のに描画だけは走るので、その板がカメラをかすめると
    フラグメント側の pow() が NaN を返し、vFade=0 を掛けても
    NaN * 0 = NaN のまま加算合成でレンダーターゲットに焼き付く。
    その1ピクセルの NaN を Bloom(mipmapBlur)がミップ生成で画面全体へ
    広げてしまい、全画面が真っ黒に落ちる → 流れ星が出た瞬間から
    画面がちかちか点滅する、という不具合になっていた。
    描かなければ NaN も生まれないので、ここで止めるのが根本の対処。
  */
  if (vFade <= 0.0) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  /*
    尾に太さを持たせる。ビュー空間で「進行方向に垂直」な向きへ広げると、
    カメラからどの角度で見ても筋の幅が保たれる(ビルボード相当)。

    dirView がたまたま基準ベクトル(0,0,1)とほぼ平行になると、
    cross() の結果がほぼゼロベクトルになり、その後の normalize() が
    NaN を返す(カメラが流れ星の進行方向をちょうど真正面/真後ろから
    見ているとき、というだけの条件なので実際にたまに起こる)。
    NaN が座標に混ざると三角形が壊れて画面いっぱいに描かれてしまい、
    暗転したりバグって見える不具合の原因だった。
    (0,0,1)に近いときだけ(0,1,0)へ切り替えて、どの向きでも
    cross() が非ゼロになるようにする。
  */
  vec3 dirView = normalize(mat3(modelViewMatrix) * aDir);
  vec3 upRef = abs(dirView.z) > 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 side = normalize(cross(dirView, upRef));
  // 頭を細く、尾の末端を太くして水滴のような形にする
  float width = uThickness * mix(0.65, 1.0, aCorner.x);
  mv.xyz += side * (aCorner.y * width);

  gl_Position = projectionMatrix * mv;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uHeadColor;
uniform vec3 uTailColor;
uniform float uStrength;

varying float vAlongTail;
varying float vAcross;
varying float vFade;

void main() {
  /*
    尾の末端へ向かって消える。powで頭側に光を集める。

    clampは必須。pow()は底が負だと未定義(NaN)で、板がカメラのすぐ脇を
    かすめると頂点の w がほぼ0になり、補間された vAlongTail が0〜1を
    はみ出して 1.0 - vAlongTail が負に振れることがある。
    そこで生まれた NaN が加算合成でレンダーターゲットに書き込まれると、
    Bloom(mipmapBlur)がミップ生成で画面全体へ NaN を広げて全画面が
    真っ黒に落ちる(点滅の直接原因)。
  */
  float alongFade = pow(clamp(1.0 - vAlongTail, 0.0, 1.0), 2.2);
  // 筋の中心が明るく、縁へ向かって消える
  float acrossFade = 1.0 - abs(vAcross);
  acrossFade = pow(clamp(acrossFade, 0.0, 1.0), 1.6);

  vec3 color = mix(uHeadColor, uTailColor, vAlongTail);
  float intensity = alongFade * acrossFade * vFade * uStrength;

  /*
    何も足さないフラグメントはここで捨てる。
    NaN との比較は必ず false になるので、!(intensity > 0.0) は
    「0以下」だけでなく「NaN」も弾ける。万一 NaN が残っても
    レンダーターゲットには書き込まれず、Bloom へ流れ込まない。
  */
  if (!(intensity > 0.0)) discard;

  gl_FragColor = vec4(color * intensity, intensity);
}
`;

type ShootingStarsProps = {
  /** 星を降らせる中心(鳥居の位置) */
  position?: [number, number, number];
  /**
   * 0=非表示 / 1=全開。転調(1:22)の進行度を持つ ref。
   * この値は SURGE_FADE_SECONDS かけて毎フレーム変わるため、数値 prop だと
   * その間ずっと親(SceneContents)ごと再レンダーして FPS が落ちる。ref で
   * 受け取り useFrame の中で uniform へ入れる(Sandbox3D 側のコメント参照)。
   */
  activationRef?: RefObject<number>;
};

/**
 * 曲名「星降る海」にちなんだ、夜空を斜めに横切る流れ星。
 * 転調(動画1:22)から降り始める。
 */
export function ShootingStars({
  position = [0, 0, 0],
  activationRef,
}: ShootingStarsProps) {
  const meshRef = useRef<Mesh>(null);
  // useMemoで作った値をuseFrame内で直接書き換えるとreact-hooks/immutabilityに
  // 引っかかるため、マテリアルはrefから触る(Bubbles.tsxと同じ手当て)
  const materialRef = useRef<ShaderMaterial>(null);

  const geometry = useMemo(() => createStarGeometry(), []);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uSpread: { value: SPREAD },
      uThickness: { value: THICKNESS },
      uNearFade: { value: new Vector2(NEAR_FADE_MIN, NEAR_FADE_MAX) },
      uHeadColor: { value: HEAD_COLOR },
      uTailColor: { value: TAIL_COLOR },
    }),
    [],
  );

  useFrame(({ clock }) => {
    // 転調の進行度はref経由(数値propだと転調の1.6秒ずっと再レンダーしてFPSが落ちる)
    const activation = activationRef?.current ?? 0;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
      materialRef.current.uniforms.uStrength.value = activation;
    }
    // 完全に消えている間は描画ごと省く
    if (meshRef.current) meshRef.current.visible = activation > 0.01;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={position}
      /*
        頂点シェーダーで座標を丸ごと組み立てるため、three 側の視錐台カリングは
        当てにならない(元の position が全部0で、原点の一点として判定されてしまう)。
      */
      frustumCulled={false}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}
