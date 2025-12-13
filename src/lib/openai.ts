// OpenAI Integration Library
import { Message } from '@/types/chat';

export type AIModel = 
  | 'gpt-4o' // Latest GPT-4 with vision
  | 'gpt-4o-mini' // Faster, cheaper GPT-4
  | 'gpt-4-turbo' // Previous generation
  | 'o1-preview' // Reasoning model
  | 'o1-mini'; // Faster reasoning

export interface AIModelInfo {
  id: AIModel;
  name: string;
  description: string;
  supportsVision: boolean;
  supportsReasoning: boolean;
}

export const AI_MODELS: AIModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'Most capable model with vision and voice',
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    description: 'Fast and affordable with vision',
    supportsVision: true,
    supportsReasoning: false,
  },
  {
    id: 'o1-preview',
    name: 'O1 Preview',
    description: 'Advanced reasoning for complex problems',
    supportsVision: false,
    supportsReasoning: true,
  },
  {
    id: 'o1-mini',
    name: 'O1 Mini',
    description: 'Faster reasoning for coding and math',
    supportsVision: false,
    supportsReasoning: true,
  },
];

interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

interface StreamCallback {
  onToken: (token: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: Error) => void;
}

export class OpenAIClient {
  private functionUrl: string | null = null;

  constructor() {
    // Function URL will be set after deployment
    this.functionUrl = null;
  }

  setFunctionUrl(url: string) {
    this.functionUrl = url;
  }

  private formatMessages(messages: Message[]): ChatCompletionMessage[] {
    return messages.map(msg => {
      // If message has images, format as multimodal content
      if (msg.images && msg.images.length > 0) {
        const content: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }> = [
          { type: 'text', text: msg.content }
        ];
        
        msg.images.forEach(imageUrl => {
          content.push({
            type: 'image_url',
            image_url: { url: imageUrl }
          });
        });

        return {
          role: msg.role as 'user' | 'assistant',
          content
        };
      }

      // Text-only message
      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      };
    });
  }

  async chat(
    messages: Message[],
    model: AIModel = 'gpt-4o',
    temperature: number = 0.7
  ): Promise<string> {
    if (!this.functionUrl) {
      throw new Error('OpenAI function URL not configured. Please deploy the edge function.');
    }

    const formattedMessages = this.formatMessages(messages);

    const response = await fetch(this.functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: formattedMessages,
        model,
        temperature,
        max_tokens: 4000,
        stream: false,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to get AI response');
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async streamChat(
    messages: Message[],
    model: AIModel = 'gpt-4o',
    callbacks: StreamCallback,
    temperature: number = 0.7
  ): Promise<void> {
    if (!this.functionUrl) {
      throw new Error('OpenAI function URL not configured. Please deploy the edge function.');
    }

    const formattedMessages = this.formatMessages(messages);

    try {
      const response = await fetch(this.functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: formattedMessages,
          model,
          temperature,
          max_tokens: 4000,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          callbacks.onComplete(fullText);
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices[0]?.delta?.content;
              
              if (token) {
                fullText += token;
                callbacks.onToken(token);
              }
            } catch (e) {
              // Skip invalid JSON
              console.warn('Failed to parse SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }
}

// Export singleton instance
export const openaiClient = new OpenAIClient();
