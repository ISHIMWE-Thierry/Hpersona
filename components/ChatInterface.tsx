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
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <h2 className="text-2xl font-semibold mb-2">ChatGPT</h2>
              <p>How can I help you today?</p>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`py-8 px-4 ${
                  message.role === 'user' ? 'bg-[#343541]' : 'bg-[#444654]'
                }`}
              >
                <div className="max-w-3xl mx-auto flex gap-6">
                  <div className="flex-shrink-0 w-8 h-8 rounded-sm bg-[#10a37f] flex items-center justify-center text-white font-semibold">
                    {message.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="flex-1 text-[#ececf1] whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[#4d4d4f] bg-[#343541] p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message ChatGPT..."
              disabled={isLoading}
              className="w-full bg-[#40414f] text-[#ececf1] rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-1 focus:ring-[#565869] disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-2 p-2 rounded-md text-[#ececf1] hover:bg-[#565869] disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <Send size={20} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
