import React from 'react';
import { Status } from '../types';

interface ControlsProps {
  status: Status;
  onToggleConversation: () => void;
  speakingRate: number;
  onSpeakingRateChange: (rate: number) => void;
  vadThreshold: number;
  onVadThresholdChange: (threshold: number) => void;
  micLevel: number;
}

const MicrophoneIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
    </svg>
);

const StopIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 6h12v12H6z" />
    </svg>
);


const Controls: React.FC<ControlsProps> = ({ 
    status, 
    onToggleConversation, 
    speakingRate, 
    onSpeakingRateChange,
    vadThreshold,
    onVadThresholdChange,
    micLevel,
}) => {
    const isRecording = status === 'connecting' || status === 'listening';
    
    const buttonClass = isRecording
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-cyan-600 hover:bg-cyan-700';

    const showVisualization = status === 'connecting' || status === 'listening';
    const normalizedLevel = showVisualization ? Math.min(micLevel / 0.1, 1.0) : 0;
    const isAboveThreshold = micLevel > vadThreshold;

    return (
        <div className="p-4 bg-gray-900/50 border-t border-gray-700 flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-8">
            <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3 w-full">
                    <label htmlFor="speaking-rate" className="text-sm font-medium text-gray-400 w-16 text-right">
                        Speed
                    </label>
                    <input
                        id="speaking-rate"
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.1"
                        value={speakingRate}
                        onChange={(e) => onSpeakingRateChange(Number(e.target.value))}
                        className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        aria-label="Speaking rate"
                    />
                    <span className="text-sm font-mono text-gray-300 w-10 text-center">
                        {speakingRate.toFixed(1)}x
                    </span>
                </div>
                <div className="flex items-center gap-3 w-full">
                        <label htmlFor="vad-threshold" className="text-sm font-medium text-gray-400 w-16 text-right" title="Lower value is more sensitive">
                        Mic Level
                    </label>
                    <input
                        id="vad-threshold"
                        type="range"
                        min="0.001"
                        max="0.1"
                        step="0.001"
                        value={vadThreshold}
                        onChange={(e) => onVadThresholdChange(Number(e.target.value))}
                        className="w-32 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        aria-label="Microphone activation level"
                    />
                        <span className="text-sm font-mono text-gray-300 w-10 text-center">
                        {vadThreshold.toFixed(3)}
                    </span>
                </div>
            </div>

            <div className="relative w-24 h-24 flex items-center justify-center">
                {/* VAD Threshold Ring */}
                <div
                    className="absolute w-20 h-20 rounded-full border-2 border-dashed transition-all duration-200"
                    style={{
                        opacity: showVisualization ? 1 : 0,
                        borderColor: isAboveThreshold ? '#0ea5e9' /* cyan-500 */ : '#4b5563' /* gray-600 */
                    }}
                    aria-hidden="true"
                />

                {/* Live Audio Level Ring */}
                <div
                    className="absolute w-16 h-16 rounded-full bg-cyan-500/50 transition-transform duration-75"
                    style={{
                        opacity: showVisualization ? normalizedLevel : 0,
                        transform: `scale(${1 + normalizedLevel * 0.25})`
                    }}
                    aria-hidden="true"
                />

                <button
                    onClick={onToggleConversation}
                    disabled={status === 'speaking'}
                    className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center text-white transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50 ${buttonClass} ${status === 'speaking' ? 'cursor-not-allowed opacity-50' : ''} ${isRecording ? 'focus:ring-red-400' : 'focus:ring-cyan-400'}`}
                    aria-label={isRecording ? 'Stop conversation' : 'Start conversation'}
                >
                    {isRecording ? <StopIcon /> : <MicrophoneIcon />}
                </button>
            </div>
        </div>
    );
};

export default Controls;