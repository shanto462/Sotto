import OpenAI from "openai";
import { toFile } from "openai/uploads";

/**
 * Transcribe an audio buffer via OpenAI Whisper.
 *
 * @param {Buffer | ArrayBuffer | Uint8Array} audio  Raw audio bytes (WebM/Opus, MP3, WAV, etc.)
 * @param {object} [options]
 * @param {string} [options.model="whisper-1"]
 * @param {string} [options.filename="audio.webm"]
 * @param {string} [options.mimeType="audio/webm"]
 * @param {import("pino").Logger} [options.log]
 * @returns {Promise<{ text: string, durationMs: number }>}
 */
export async function transcribeAudio(audio, options = {}) {
  const start = performance.now();
  const client = new OpenAI();

  const buf = Buffer.isBuffer(audio)
    ? audio
    : audio instanceof Uint8Array
      ? Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)
      : Buffer.from(audio);

  const file = await toFile(buf, options.filename || "audio.webm", {
    type: options.mimeType || "audio/webm",
  });

  const result = await client.audio.transcriptions.create({
    file,
    model: options.model || "whisper-1",
  });

  const text = result.text || "";
  const durationMs = Math.round(performance.now() - start);
  options.log?.info(
    { chars: text.length, bytes: buf.length, durationMs },
    "transcribed audio",
  );
  return { text, durationMs };
}
