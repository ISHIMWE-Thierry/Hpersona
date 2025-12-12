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
          <div className="flex items-center justify-center h-full px-6 text-gray-300">
            <div className="text-center bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-10 shadow-xl max-w-xl w-full">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10a37f] to-[#0d8a6a] shadow-2xl shadow-[#10a37f]/20 mb-4">
                <svg
                  className="w-10 h-10 text-white"
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
              <h2 className="text-3xl font-bold mb-2 text-white">Ikamba AI</h2>
              <p className="text-[#9ca3af]">Ask anything. Get fast, thoughtful answers.</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
            {messages.map((message, index) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={index}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-3xl w-full sm:w-auto rounded-2xl border backdrop-blur-sm shadow-lg px-4 sm:px-5 py-4 text-sm sm:text-base whitespace-pre-wrap leading-relaxed transition-colors ${
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
      <div className="border-t border-white/10 bg-black/30 backdrop-blur-sm p-4">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 shadow-lg">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-transparent text-white placeholder:text-gray-500 px-2 py-2 focus:outline-none"
              placeholder="Message Ikamba AI..."
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#10a37f] to-[#0d8968] px-4 py-2 text-white font-semibold shadow-lg shadow-[#10a37f]/20 transition hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Send size={18} />
              <span>{isLoading ? 'Thinking...' : 'Send'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
