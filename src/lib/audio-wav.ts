/**
 * Conversão do áudio gravado no navegador para WAV base64.
 *
 * O MediaRecorder do Chrome grava em `audio/webm;codecs=opus` e o Safari em
 * `audio/mp4` — e o Gemini não aceita nenhum dos dois (só wav, mp3, aiff, aac,
 * ogg e flac). Em vez de depender do formato do navegador, decodificamos e
 * reencodamos aqui: mono, 16 kHz, PCM 16 bits.
 *
 * 16 kHz mono é o suficiente para voz (é a taxa que os modelos de fala usam) e
 * deixa 1 minuto de áudio em ~1,9 MB em vez de ~10 MB do WAV de 48 kHz estéreo.
 */

const TAXA_ALVO = 16000;

/** Mixa os canais em mono e reamostra por interpolação linear. */
function paraMono16k(buffer: AudioBuffer): Float32Array {
  const canais = buffer.numberOfChannels;
  const origem = buffer.getChannelData(0);
  const mono = new Float32Array(origem.length);

  if (canais === 1) {
    mono.set(origem);
  } else {
    for (let c = 0; c < canais; c++) {
      const dados = buffer.getChannelData(c);
      for (let i = 0; i < dados.length; i++) mono[i] += dados[i] / canais;
    }
  }

  if (buffer.sampleRate === TAXA_ALVO) return mono;

  const razao = buffer.sampleRate / TAXA_ALVO;
  const saida = new Float32Array(Math.floor(mono.length / razao));
  for (let i = 0; i < saida.length; i++) {
    const pos = i * razao;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = mono[idx] ?? 0;
    const b = mono[idx + 1] ?? a;
    saida[i] = a + (b - a) * frac;
  }
  return saida;
}

/** Monta o arquivo WAV (cabeçalho RIFF de 44 bytes + PCM 16 bits). */
function montarWav(amostras: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + amostras.length * 2);
  const view = new DataView(buffer);

  const escreverTexto = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) view.setUint8(offset + i, texto.charCodeAt(i));
  };

  escreverTexto(0, "RIFF");
  view.setUint32(4, 36 + amostras.length * 2, true);
  escreverTexto(8, "WAVE");
  escreverTexto(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TAXA_ALVO, true);
  view.setUint32(28, TAXA_ALVO * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // alinhamento do bloco
  view.setUint16(34, 16, true); // bits por amostra
  escreverTexto(36, "data");
  view.setUint32(40, amostras.length * 2, true);

  let offset = 44;
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.max(-1, Math.min(1, amostras[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

/** btoa em blocos: passar um array de MBs de uma vez estoura a pilha. */
function paraBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const BLOCO = 0x8000;
  let binario = "";
  for (let i = 0; i < bytes.length; i += BLOCO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  return btoa(binario);
}

/**
 * Converte o Blob gravado em WAV base64, pronto para o `transcribeAudio`.
 * Retorna também a duração, usada para estimar o custo/limite.
 */
export async function blobParaWavBase64(
  blob: Blob,
): Promise<{ base64: string; duracaoSegundos: number }> {
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    const amostras = paraMono16k(audioBuffer);
    return {
      base64: paraBase64(montarWav(amostras)),
      duracaoSegundos: audioBuffer.duration,
    };
  } finally {
    await ctx.close();
  }
}
