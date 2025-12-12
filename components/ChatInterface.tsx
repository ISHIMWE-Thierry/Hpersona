'use client';

import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  isLoading: boolean;
}

export default function ChatInterface({ messages, onSendMessage, isLoading }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input;
    setInput('');
    await onSendMessage(message);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full px-6">
            <div className="text-center max-w-2xl w-full">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-white/5 border border-white/10 shadow-2xl mb-8">
                <svg
                  className="w-10 h-10 text-emerald-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h2 className="text-4xl font-bold mb-4 text-white tracking-tight">How can I help you today?</h2>
              <p className="text-gray-400 text-lg">I&apos;m here to assist with code, writing, analysis, and more.</p>
            </div>
          </div>
        ) : (
          <div className="w-full px-4 md:px-8 py-6 space-y-6">
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl rounded-2xl border backdrop-blur-sm shadow-lg px-5 py-4 text-sm sm:text-base whitespace-pre-wrap leading-relaxed transition-colors ${
                      isUser
                        ? 'bg-emerald-500/10 border-emerald-400/20 text-emerald-50'
                        : 'bg-white/5 border-white/10 text-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-md ${
                          isUser ? 'bg-emerald-500/20 text-emerald-100' : 'bg-white/10 text-white'
                        }`}
                      >
                        {isUser ? 'You' : 'AI'}
                      </span>
                      <span className="text-gray-400">{isUser ? 'Message' : 'Response'}</span>
                    </div>
                    {message.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 md:p-6 bg-gradient-to-t from-black/50 to-transparent">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto w-full">
          <div className="relative flex items-center gap-3 bg-[#202123] border border-white/10 rounded-2xl px-4 py-3 shadow-2xl focus-within:ring-1 focus-within:ring-white/20 transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent text-white placeholder:text-gray-500 px-2 py-1 focus:outline-none text-base"
              placeholder="Message Ikamba AI..."
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 rounded-lg bg-white text-black disabled:bg-gray-600 disabled:text-gray-400 transition-colors hover:bg-gray-200"
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-center text-xs text-gray-500 mt-3">
            Ikamba AI can make mistakes. Consider checking important information.
          </p>
        </form>
      </div>
    </div>
  );
}
