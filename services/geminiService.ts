import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decode, decodeAudioData } from './audioUtils';

let nextStartTime = 0;
const sources = new Set<AudioBufferSourceNode>();

export interface LiveSessionCallbacks {
  onopen: () => void;
  onmessage: (message: LiveServerMessage) => void;
  onerror: (e: ErrorEvent) => void;
  onclose: (e: CloseEvent) => void;
}

const handleAudioPlayback = async (
    message: LiveServerMessage,
    outputAudioContext: AudioContext,
    speakingRate: number
) => {
    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64EncodedAudioString) {
      nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
      
      const audioBuffer = await decodeAudioData(
        decode(base64EncodedAudioString),
        outputAudioContext,
        24000,
        1
      );
      
      const source = outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = speakingRate;
      source.connect(outputAudioContext.destination);
      
      source.addEventListener('ended', () => {
        sources.delete(source);
      });
      
      source.start(nextStartTime);
      nextStartTime += audioBuffer.duration / speakingRate;
      sources.add(source);
    }

    if (message.serverContent?.interrupted) {
      for (const source of sources.values()) {
        source.stop();
        sources.delete(source);
      }
      nextStartTime = 0;
    }
};

export const startLiveSession = (
    ai: GoogleGenAI,
    outputAudioContext: AudioContext,
    callbacks: LiveSessionCallbacks,
    speakingRate: number
) => {
    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
            onopen: callbacks.onopen,
            onmessage: async (message: LiveServerMessage) => {
                await handleAudioPlayback(message, outputAudioContext, speakingRate);
                callbacks.onmessage(message);
            },
            onerror: callbacks.onerror,
            onclose: callbacks.onclose,
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: 'You are a friendly and helpful assistant. Keep your responses concise and conversational.',
            outputAudioTranscription: {},
            inputAudioTranscription: {},
        },
    });
};