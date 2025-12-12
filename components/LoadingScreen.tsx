'use client';

export default function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]">
      <div className="text-center">
        {/* Logo */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#10a37f] to-[#0d8a6a] shadow-2xl shadow-[#10a37f]/20 mb-4">
            <svg
              className="w-12 h-12 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            Ikamba AI
          </h1>
          <p className="text-[#8e8ea0] text-sm">Powered by GPT-4</p>
        </div>

        {/* Loading Animation */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10a37f] animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#10a37f] animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-[#10a37f] animate-bounce"></div>
        </div>

        <p className="text-[#8e8ea0] text-sm animate-pulse">
          Initializing your AI assistant...
        </p>
      </div>
    </div>
  );
}
