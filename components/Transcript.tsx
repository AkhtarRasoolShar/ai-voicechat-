import React, { useEffect, useRef } from 'react';
import { TranscriptMessage, Status } from '../types';

interface TranscriptProps {
  transcript: TranscriptMessage[];
  status: Status;
}

const BlinkingCursor = () => (
    <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse" style={{ animationDuration: '1.2s' }}></span>
);

const Transcript: React.FC<TranscriptProps> = ({ transcript, status }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, status]);

  const renderMessage = (msg: TranscriptMessage, index: number) => {
    const isUser = msg.speaker === 'user';
    const isLastMessage = index === transcript.length - 1;
    const isModelReplying = isLastMessage && !isUser && status === 'speaking';

    return (
      <div
        key={index}
        className={`flex items-start gap-3 my-4 ${isUser ? 'justify-end' : ''}`}
      >
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex-shrink-0"></div>
        )}
        <div
          className={`max-w-md p-3 rounded-lg ${
            isUser
              ? 'bg-cyan-600/70 text-white rounded-br-none'
              : 'bg-gray-700 text-gray-200 rounded-bl-none'
          }`}
        >
          <p className="text-sm">
            {msg.text || '...'}
            {isModelReplying && <BlinkingCursor />}
          </p>
        </div>
        {isUser && (
            <div className="w-8 h-8 rounded-full bg-gray-600 flex-shrink-0"></div>
        )}
      </div>
    );
  };

  return (
    <div ref={scrollRef} className="flex-grow p-4 overflow-y-auto">
      {transcript.length > 0 ? (
        transcript.map(renderMessage)
      ) : (
        <div className="flex items-center justify-center h-full text-gray-500">
          <p>{status === 'idle' || status === 'error' ? 'Conversation transcript will appear here.' : 'Starting conversation...'}</p>
        </div>
      )}
    </div>
  );
};

export default Transcript;