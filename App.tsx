import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage } from '@google/genai';
import { Status, TranscriptMessage } from './types';
import { startLiveSession } from './services/geminiService';
import Header from './components/Header';
import StatusIndicator from './components/StatusIndicator';
import Transcript from './components/Transcript';
import Controls from './components/Controls';
import { createBlob } from './services/audioUtils';

// Fix: Add type definitions for the Web Speech API to fix compile errors.
interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: any) => void;
  onerror: (event: any) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognition };
    webkitSpeechRecognition: { new(): SpeechRecognition };
  }
}

// VAD Constants
const SILENCE_TIMEOUT_MS = 1500; // ms of silence before we consider the user has stopped speaking

const App: React.FC = () => {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [apiKeyReady, setApiKeyReady] = useState(false);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [vadThreshold, setVadThreshold] = useState(0.01);
  const [micLevel, setMicLevel] = useState(0);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const userSpeechRef = useRef({ lastText: '', isNew: true });
  
  const vadStateRef = useRef<{ isSpeaking: boolean; silenceTimeoutId: number | null }>({
    isSpeaking: false,
    silenceTimeoutId: null,
  });

  const vadThresholdRef = useRef(vadThreshold);
  useEffect(() => {
    vadThresholdRef.current = vadThreshold;
  }, [vadThreshold]);
  
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);


  const currentOutputTranscriptionRef = useRef('');
  const micLevelRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const checkApiKey = async () => {
      if (await (window as any).aistudio.hasSelectedApiKey()) {
        setApiKeyReady(true);
      }
    };
    checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    await (window as any).aistudio.openSelectKey();
    // Optimistically assume the user selected a key.
    setApiKeyReady(true);
    setErrorMessage(null); // Clear previous errors
  };

  const stopConversation = useCallback(() => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        session.close();
      });
      sessionPromiseRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
      outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }
    if (vadStateRef.current.silenceTimeoutId) {
      clearTimeout(vadStateRef.current.silenceTimeoutId);
      vadStateRef.current.silenceTimeoutId = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    setMicLevel(0);
    vadStateRef.current.isSpeaking = false;

    setStatus('idle');
  }, []);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopConversation();
    };
  }, [stopConversation]);

  const onMessage = (message: LiveServerMessage) => {
    if (message.serverContent?.outputTranscription) {
      if (statusRef.current !== 'speaking') {
        setStatus('speaking');
      }
       // Model is speaking, so the next user input is a new utterance.
      userSpeechRef.current = { lastText: '', isNew: true };

      const text = message.serverContent.outputTranscription.text;
      currentOutputTranscriptionRef.current += text;
      // Optimistically update the last message for real-time feedback
      setTranscript(prev => {
        const last = prev[prev.length - 1];
        if (last && last.speaker === 'model') {
          return [...prev.slice(0, -1), { ...last, text: currentOutputTranscriptionRef.current }];
        }
        return [...prev, { speaker: 'model', text: currentOutputTranscriptionRef.current }];
      });
    }

    if (message.serverContent?.turnComplete) {
      if (statusRef.current === 'speaking') {
        setStatus('listening');
      }
      const fullOutput = currentOutputTranscriptionRef.current.trim();
      
      setTranscript(prev => {
        const newTranscript = [...prev];
        const last = newTranscript[newTranscript.length - 1];
        
        if (last && last.speaker === 'model' && fullOutput) {
            last.text = fullOutput;
        }
        
        return newTranscript;
      });
      
      currentOutputTranscriptionRef.current = '';
    }
  };


  const handleToggleConversation = async () => {
    if (status !== 'idle') {
      stopConversation();
      return;
    }
    
    setErrorMessage(null);
    setTranscript([]);
    setStatus('connecting');
    vadStateRef.current = { isSpeaking: false, silenceTimeoutId: null };
    userSpeechRef.current = { lastText: '', isNew: true };

    // Fix: Use window.webkitSpeechRecognition directly, types are now available.
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage("Speech Recognition API is not supported in this browser. Please use a supported browser like Chrome.");
      setStatus('error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
        let transcriptText = '';
        for (let i = 0; i < event.results.length; i++) {
            transcriptText += event.results[i][0].transcript;
        }

        if (transcriptText === userSpeechRef.current.lastText || !transcriptText.trim()) {
            return;
        }
        userSpeechRef.current.lastText = transcriptText;

        setTranscript(prev => {
            if (userSpeechRef.current.isNew) {
                userSpeechRef.current.isNew = false;
                return [...prev, { speaker: 'user', text: transcriptText }];
            } else {
                const last = prev[prev.length - 1];
                if (last && last.speaker === 'user') {
                    return [...prev.slice(0, -1), { ...last, text: transcriptText }];
                } else {
                    return [...prev, { speaker: 'user', text: transcriptText }];
                }
            }
        });
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      if (event.error !== 'no-speech') {
        setErrorMessage(`Speech recognition error: ${event.error}`);
      }
    };
  
    recognition.onend = () => {
      if (statusRef.current === 'listening') {
        recognition.start();
      }
    };

    speechRecognitionRef.current = recognition;

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      sessionPromiseRef.current = startLiveSession(ai, outputAudioContextRef.current, {
        onopen: async () => {
          try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            setStatus('listening');

            const animateMicLevel = () => {
              setMicLevel(micLevelRef.current);
              animationFrameRef.current = requestAnimationFrame(animateMicLevel);
            };
            animateMicLevel();

            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            sourceRef.current = inputAudioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              micLevelRef.current = rms;
              const isSpeech = rms > vadThresholdRef.current;

              if (isSpeech) {
                if (vadStateRef.current.silenceTimeoutId) {
                  clearTimeout(vadStateRef.current.silenceTimeoutId);
                  vadStateRef.current.silenceTimeoutId = null;
                }
                vadStateRef.current.isSpeaking = true;
              } else {
                if (vadStateRef.current.isSpeaking && !vadStateRef.current.silenceTimeoutId) {
                  vadStateRef.current.silenceTimeoutId = window.setTimeout(() => {
                    vadStateRef.current.isSpeaking = false;
                    vadStateRef.current.silenceTimeoutId = null;
                  }, SILENCE_TIMEOUT_MS);
                }
              }
              
              if (vadStateRef.current.isSpeaking && sessionPromiseRef.current) {
                  const pcmBlob = createBlob(inputData);
                  sessionPromiseRef.current.then((session) => {
                    session.sendRealtimeInput({ media: pcmBlob });
                  });
              }
            };

            sourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
            recognition.start();

          } catch (err) {
              if (err instanceof DOMException) {
                if (err.name === 'NotAllowedError') {
                    setErrorMessage('Microphone permission denied. Please allow microphone access in your browser settings.');
                } else if (err.name === 'NotFoundError') {
                    setErrorMessage('No microphone found. Please connect a microphone and try again.');
                } else {
                    setErrorMessage(`An error occurred while accessing the microphone: ${err.message}`);
                }
            } else {
                setErrorMessage('An unknown error occurred while accessing the microphone.');
            }
            console.error('Microphone access error:', err);
            setStatus('error');
            stopConversation();
          }
        },
        onmessage: onMessage,
        onerror: (e: ErrorEvent) => {
          console.error('API Error:', e);
          if (e.message?.includes('Requested entity was not found') || e.message?.toLowerCase().includes('network error')) {
            setApiKeyReady(false);
            setErrorMessage('A connection error occurred. This may be due to an invalid API Key or missing billing information. Please select a valid key and try again.');
          } else {
            setErrorMessage(`A connection error occurred: ${e.message}. Please check your network and try again.`);
          }
          setStatus('error');
          stopConversation();
        },
        onclose: () => {
          setStatus('idle');
        },
      }, speakingRate);

    } catch (error) {
      console.error('Failed to start session:', error);
      if (error instanceof Error && (error.message?.includes('Requested entity was not found') || error.message?.toLowerCase().includes('network error'))) {
        setApiKeyReady(false);
        setErrorMessage('Failed to start session. This may be due to an invalid API Key or missing billing information. Please select a valid key and try again.');
      } else {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        setErrorMessage(`Failed to start the session: ${errorMessage}. Please refresh the page and try again.`);
      }
      setStatus('error');
      stopConversation();
    }
  };

  const handleSpeakingRateChange = (rate: number) => {
    setSpeakingRate(rate);
  };
  
  const handleVadThresholdChange = (threshold: number) => {
    setVadThreshold(threshold);
  };

  const ApiKeySelector = () => (
    <div className="w-full max-w-md text-center bg-gray-800/50 p-8 rounded-2xl shadow-2xl border border-gray-700">
      <h2 className="text-2xl font-bold text-cyan-400 mb-4">Select API Key</h2>
      {errorMessage && (
        <div className="p-3 mb-4 bg-red-900/50 text-red-300 text-left text-sm rounded-md border border-red-800">
            <strong>Error:</strong> {errorMessage}
        </div>
      )}
      <p className="text-gray-400 mb-6">
        To use this application, please select your Google AI Studio API key.
        Ensure that you have billing enabled for your project.
      </p>
      <a
        href="https://ai.google.dev/gemini-api/docs/billing"
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan-400 hover:underline mb-6 block"
      >
        Learn more about billing
      </a>
      <button
        onClick={handleSelectApiKey}
        className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-300"
      >
        Select API Key
      </button>
    </div>
  );
  
  const ErrorDisplay = ({ message }: { message: string | null }) => {
    if (!message) return null;
    return (
        <div className="p-3 bg-red-900/50 text-red-300 text-center text-sm border-b border-gray-700">
            <strong>Error:</strong> {message}
        </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col font-sans">
      <Header />
      <main className="flex-grow flex flex-col items-center justify-center p-4">
        {!apiKeyReady ? (
          <ApiKeySelector />
        ) : (
          <div className="w-full max-w-3xl h-full flex flex-col bg-gray-800/50 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-cyan-400">Live Conversation</h2>
              <StatusIndicator status={status} />
            </div>
            <ErrorDisplay message={errorMessage} />
            <Transcript transcript={transcript} status={status} />
            <Controls
              status={status}
              onToggleConversation={handleToggleConversation}
              speakingRate={speakingRate}
              onSpeakingRateChange={handleSpeakingRateChange}
              vadThreshold={vadThreshold}
              onVadThresholdChange={handleVadThresholdChange}
              micLevel={micLevel}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;