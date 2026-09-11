/**
 * 打ち上げ花火の共有シェーダー。
 *
 * **粒の位置はすべて頂点シェーダーの閉じた式で決まる**(シミュレーションを
 * CPU で回さない)。おかげで
 *   - 何周しても同じ時刻に同じ形に開く(曲に紐づいた演出にできる)
 *   - 「t 秒前の位置」がタダで求まる → **尾(トレイル)が引ける**
 * という2つが同時に手に入る。尾がこのシェーダーの肝で、動画の花火が
 * きれいに見える理由の大半は「点」ではなく「光の筋」が伸びていることにある。
 *
 * 尾の作り方: 1粒を `trailSteps` 個の点として積み、k 番目の点は時刻を
 * `aTrail * uTrailSpan` だけ巻き戻して評価する。線分を張らずに点だけで
 * 済むので、玉の数を増やしても描画は points 1回のまま。
 *
 * 型(菊・千輪・冠・型物…)の違いは**uniform と粒の初速の配り方**だけで表す。
 * シェーダーは1本、コンポーネントごとに uniform が違う、という構成。
 * → プロファイルは fireworkShells.ts の FIREWORK_PROFILES を見ること。
 */

export const FIREWORK_VERTEX = /* glsl */ `
  /** 曲の再生位置(秒) */
  uniform float uTime;
  /** 演出全体の濃さ(0〜1) */
  uniform float uOpacity;
  /** 打ち上げ(ロケットが昇る)にかける秒数。0 なら最初から開いている */
  uniform float uRise;
  /** 開いてから消えるまでの秒数 */
  uniform float uLife;
  /** 空気抵抗。大きいほど早く失速して、ふわりと垂れる */
  uniform float uDrag;
  /** 重力。実寸ではなく見栄えで決めた値 */
  uniform float uGravity;
  /** 尾が何秒ぶんの残像か。大きいほど筋が長く伸びる */
  uniform float uTrailSpan;
  /** ちらつきの強さ(0〜1)。冠菊のパチパチ感 */
  uniform float uGlitter;
  /** 開いた瞬間の閃光の強さ */
  uniform float uFlash;

  /** この粒が打ち上がる時刻(秒) */
  attribute float aLaunch;
  /** 打ち上げ位置(地上) */
  attribute vec3 aOrigin;
  /** 開く位置(空) */
  attribute vec3 aBurst;
  /** 開いた瞬間の初速。向きと大きさを1本に込めてある */
  attribute vec3 aVel;
  /** xyz = 二段目(分裂後)の初速 / w = 分裂までの秒数。w が負なら分裂しない */
  attribute vec4 aBreak;
  /** 粒の大きさ(点スプライトの基準サイズ) */
  attribute float aSize;
  /** 粒ごとの乱数の種。ちらつきの位相に使う */
  attribute float aSeed;
  /** 開いた直後の色 */
  attribute vec3 aColor;
  /** 消え際の色。冠菊は金→熾火の赤へ落とす */
  attribute vec3 aTint;
  /** 0 = 先頭(実時刻) 〜 1 = 尾の末端 */
  attribute float aTrail;

  varying float vAlpha;
  varying vec3 vColor;
  /** 芯の白飛び具合。1 で中心が真っ白になる */
  varying float vHot;

  vec3 gravityVec() { return vec3(0.0, -uGravity, 0.0); }

  /*
    線形抵抗つき放物運動の解析解。
      v' = -uDrag*v + g
      x(t) = x0 + (v0 - g/D)*(1 - e^(-D t))/D + (g/D)*t
    等速の放射だと「ウニ」のまま消えるが、これだと外周が失速して尾が
    垂れ下がるので花火らしくなる。
  */
  vec3 trajPos(vec3 p0, vec3 v0, float t) {
    vec3 g = gravityVec();
    return p0 + (v0 - g / uDrag) * (1.0 - exp(-uDrag * t)) / uDrag + (g / uDrag) * t;
  }

  /** 同じ運動の速度。分裂(千輪)のとき親の速度を引き継ぐのに要る */
  vec3 trajVel(vec3 v0, float t) {
    vec3 g = gravityVec();
    return (v0 - g / uDrag) * exp(-uDrag * t) + g / uDrag;
  }

  float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

  void main() {
    // 尾の点は「少し前の自分」。時刻を巻き戻して同じ式に通す
    float age = uTime - aLaunch - aTrail * uTrailSpan;
    float total = uRise + uLife;

    vec3 p = aBurst;
    float alpha = 0.0;
    float sizeScale = 1.0;
    float hot = 0.0;
    vec3 tint = aColor;

    if (age >= 0.0 && age <= total) {
      if (age < uRise) {
        /*
          打ち上げ。粒は1点に集まったままイーズアウトで昇るので、
          玉ぜんぶが重なって「尾を引く1つの光点(ロケット)」に見える。
        */
        float k = age / uRise;
        p = mix(aOrigin, aBurst, 1.0 - pow(1.0 - k, 2.2));
        alpha = 0.85 * smoothstep(0.0, 0.06, k);
        sizeScale = 0.5;
        hot = 0.55;
        // 昇っている間は星の色ではなく火の粉。橙に寄せる
        tint = mix(aColor, vec3(1.0, 0.55, 0.18), 0.55);
      } else {
        float u = age - uRise;
        float breakAt = aBreak.w;

        if (breakAt < 0.0 || u < breakAt) {
          p = trajPos(aBurst, aVel, u);
        } else {
          /*
            二段咲き(千輪)。分裂するまでは兄弟の粒が完全に重なっているので
            1つの明るい子玉に見え、分裂した瞬間にパッと small な花になる。
            分裂点の位置と速度をそのまま初期条件にして飛ばす。
          */
          vec3 pb = trajPos(aBurst, aVel, breakAt);
          vec3 vb = trajVel(aVel, breakAt) + aBreak.xyz;
          p = trajPos(pb, vb, u - breakAt);
        }

        float life = clamp(u / uLife, 0.0, 1.0);
        alpha = pow(1.0 - life, 1.7);

        // 開いた瞬間の閃光。粒がまだ中心に固まっているので画面が白く飛ぶ
        float flash = exp(-u * 16.0) * uFlash;
        alpha += flash;
        sizeScale += flash * 1.6;

        hot = clamp(exp(-u * 3.0) + (1.0 - aTrail) * 0.35, 0.0, 1.0);
        tint = mix(aColor, aTint, smoothstep(0.25, 0.95, life));

        /*
          ちらつき。sin で揺らすと玉ぜんぶが同じ周期で脈打って作り物に
          見えるので、粒ごと・22Hz の階段状の乱数で「パチパチ」と消し込む。
          尾には掛けない ―― 掛けると光の筋が虫食いになる。
        */
        if (uGlitter > 0.0) {
          float crackle = hash11(aSeed * 91.7 + floor(u * 22.0) * 13.31);
          float mask = mix(1.0, step(uGlitter * 0.55, crackle), uGlitter * (1.0 - aTrail));
          alpha *= mask;
        }
      }
    }

    // 尾は先頭より暗く細く。末端でも 0 にはしない(筋が途中で切れて見える)
    float tail = pow(1.0 - aTrail, 1.4);
    alpha *= 0.25 + 0.75 * tail;
    sizeScale *= 0.35 + 0.65 * tail;

    vAlpha = alpha * uOpacity;
    vColor = tint;
    vHot = hot;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * sizeScale * (320.0 / max(-mv.z, 1.0));
  }
`;

export const FIREWORK_FRAGMENT = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  varying float vHot;

  void main() {
    if (vAlpha <= 0.002) discard;
    vec2 d = gl_PointCoord - 0.5;
    float r2 = dot(d, d);
    if (r2 > 0.25) discard;

    // 0(縁) 〜 1(芯)。加算合成なので芯だけが白く飛ぶ
    float f = 1.0 - r2 * 4.0;
    /*
      芯を白飛びさせる。Bloom(SceneContents の luminanceThreshold 0.4)が
      ここを拾って滲むので、「光が空気に散っている」ように見える。
    */
    vec3 c = mix(vColor, vec3(1.0), pow(f, 5.0) * vHot);
    gl_FragColor = vec4(c * (0.55 + 0.45 * f), vAlpha * f * f);
  }
`;
