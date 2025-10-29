
import React from 'react';
import { Status } from '../types';

interface StatusIndicatorProps {
  status: Status;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const statusConfig = {
    idle: { color: 'bg-gray-500', text: 'Idle' },
    connecting: { color: 'bg-yellow-500 animate-pulse', text: 'Connecting...' },
    listening: { color: 'bg-green-500 animate-pulse', text: 'Listening...' },
    speaking: { color: 'bg-blue-500 animate-pulse', text: 'Speaking...' },
    error: { color: 'bg-red-500', text: 'Error' },
  };

  const { color, text } = statusConfig[status];

  return (
    <div className="flex items-center space-x-2">
      <span className={`w-3 h-3 rounded-full ${color}`}></span>
      <span className="text-sm font-medium text-gray-300 capitalize">{text}</span>
    </div>
  );
};

export default StatusIndicator;
