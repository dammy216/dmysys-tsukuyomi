/**
 * 書き出す mp4 の音声トラックを用意する。
 *
 * - Reply: reply.mp4 に音声トラックが内蔵されているので、そのままデコードして
 *   AudioBufferSource へ流すだけ(ミックス不要)。
 * - 星降る海: 映像(星降る海.mp4)はミュートで、vocals/otherの2ステムを同時に
 *   鳴らして1曲になる構成(useStarfallSong.ts参照)なので、2つをデコードして
 *   サンプル単位で加算ミックスしてから流す。
 *
 * どちらも「非リアルタイムのオフライン書き出し」の一部として、実際に鳴らす
 * ことなく(<audio>/<video>要素を使わず)ファイルから直接PCMを取り出す
 * (mediabunny の Input+AudioBufferSink)。
 */
import {
  ALL_FORMATS,
  AudioBufferSink,
  Input,
  UrlSource,
  type AudioBufferSource,
} from "mediabunny";

/** 1回に書き出すAudioBufferの長さ(秒)。細かすぎても粗すぎても効率が落ちる */
const CHUNK_SECONDS = 1;

type ChannelTrack = {
  sampleRate: number;
  numberOfChannels: number;
  /** チャンネルごとの連続サンプル列 */
  channelData: Float32Array[];
};

/** 音声トラックの全区間を1本のFloat32配列(チャンネルごと)にデコードする */
async function decodeToChannelTrack(
  url: string,
  duration: number,
  signal: AbortSignal | undefined,
): Promise<ChannelTrack | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;

    const sampleRate = await track.getSampleRate();
    const numberOfChannels = await track.getNumberOfChannels();
    const totalSamples = Math.ceil(duration * sampleRate);
    const channelData = Array.from(
      { length: numberOfChannels },
      () => new Float32Array(totalSamples),
    );

    const sink = new AudioBufferSink(track);
    for await (const { buffer, timestamp } of sink.buffers(0, duration)) {
      if (signal?.aborted) break;
      const offset = Math.round(timestamp * sampleRate);
      for (let c = 0; c < numberOfChannels; c++) {
        const src = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
        const writable = Math.min(src.length, totalSamples - offset);
        if (writable <= 0) continue;
        channelData[c].set(src.subarray(0, writable), offset);
      }
    }

    return { sampleRate, numberOfChannels, channelData };
  } finally {
    input.dispose();
  }
}

/** ChannelTrackを CHUNK_SECONDS ごとの AudioBuffer に切ってAudioBufferSourceへ流す */
async function pipeChannelTrack(
  track: ChannelTrack,
  audioSource: AudioBufferSource,
  signal: AbortSignal | undefined,
) {
  const { sampleRate, numberOfChannels, channelData } = track;
  const totalSamples = channelData[0]?.length ?? 0;
  const chunkSamples = Math.round(CHUNK_SECONDS * sampleRate);

  for (let start = 0; start < totalSamples; start += chunkSamples) {
    if (signal?.aborted) break;
    const length = Math.min(chunkSamples, totalSamples - start);
    const buffer = new AudioBuffer({ length, numberOfChannels, sampleRate });
    for (let c = 0; c < numberOfChannels; c++) {
      const chunk = new Float32Array(length);
      chunk.set(channelData[c].subarray(start, start + length));
      buffer.copyToChannel(chunk, c);
    }
    await audioSource.add(buffer);
  }
}

/** Reply: 映像内蔵の音声トラックをそのまま流す */
export async function feedReplyAudio(
  audioSource: AudioBufferSource,
  videoUrl: string,
  duration: number,
  signal?: AbortSignal,
): Promise<void> {
  const track = await decodeToChannelTrack(videoUrl, duration, signal);
  if (!track) return;
  await pipeChannelTrack(track, audioSource, signal);
}

/** 星降る海: vocals + other をサンプル単位で加算ミックスしてから流す */
export async function feedStarfallAudio(
  audioSource: AudioBufferSource,
  vocalsUrl: string,
  otherUrl: string,
  duration: number,
  signal?: AbortSignal,
): Promise<void> {
  const [vocals, other] = await Promise.all([
    decodeToChannelTrack(vocalsUrl, duration, signal),
    decodeToChannelTrack(otherUrl, duration, signal),
  ]);
  if (!vocals || !other) return;

  const numberOfChannels = Math.max(vocals.numberOfChannels, other.numberOfChannels);
  const totalSamples = Math.max(
    vocals.channelData[0]?.length ?? 0,
    other.channelData[0]?.length ?? 0,
  );
  const mixed: Float32Array[] = Array.from(
    { length: numberOfChannels },
    () => new Float32Array(totalSamples),
  );

  for (let c = 0; c < numberOfChannels; c++) {
    const a = vocals.channelData[Math.min(c, vocals.channelData.length - 1)];
    const b = other.channelData[Math.min(c, other.channelData.length - 1)];
    const out = mixed[c];
    for (let i = 0; i < totalSamples; i++) {
      out[i] = Math.max(-1, Math.min(1, (a?.[i] ?? 0) + (b?.[i] ?? 0)));
    }
  }

  await pipeChannelTrack(
    { sampleRate: vocals.sampleRate, numberOfChannels, channelData: mixed },
    audioSource,
    signal,
  );
}
