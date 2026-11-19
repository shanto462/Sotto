// Voice transcription through OpenRouter: the clip goes to an audio-capable
// chat model, which is asked for a verbatim transcript.
import { chatCompletion } from "./openrouter.js";

const INSTRUCTION =
  "Transcribe the speech in this audio clip verbatim, in the language spoken. " +
  "Reply with the transcript only: no quotes, labels, timestamps, or commentary. " +
  "If there is no intelligible speech, reply with an empty message.";

/**
 * Transcribe a WAV clip.
 *
 * @param {Buffer | ArrayBuffer | Uint8Array} audio  WAV bytes (the overlay
 *   converts the recording to 16 kHz mono WAV before sending it).
 * @param {object} [options]
 * @param {string} options.model  OpenRouter model id with audio input.
 * @param {import("pino").Logger} [options.log]
 * @returns {Promise<{ text: string, durationMs: number }>}
 */
export async function transcribeAudio(audio, options = {}) {
  const start = performance.now();
  const buf = Buffer.isBuffer(audio)
    ? audio
    : audio instanceof Uint8Array
      ? Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength)
      : Buffer.from(audio);
  const model = options.model;
  if (!model) {
    throw new Error(
      "No transcription model chosen. Open Preferences → API & Models.",
    );
  }

  const response = await chatCompletion({
    model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: INSTRUCTION },
          {
            type: "input_audio",
            input_audio: { data: buf.toString("base64"), format: "wav" },
          },
        ],
      },
    ],
  });

  const text = (response.choices?.[0]?.message?.content ?? "").trim();
  const durationMs = Math.round(performance.now() - start);
  options.log?.info(
    { model, chars: text.length, bytes: buf.length, durationMs },
    "transcribed audio",
  );
  return { text, durationMs };
}
