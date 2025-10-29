
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="text-center p-6 border-b border-gray-800">
      <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-teal-500 mb-2">
        Gemini Live Audio Assistant
      </h1>
      <p className="text-gray-400 max-w-2xl mx-auto">
        Click the microphone button to start a real-time voice conversation with Gemini.
      </p>
    </header>
  );
};

export default Header;
