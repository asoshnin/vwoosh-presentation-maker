const API_BASE = '/api';

export const AVAILABLE_MODELS = [
  'muse-spark-1.3-contributor',
  'muse-spark-1.3',
  'muse-wonder-1.0',
];

const DEFAULT_MODEL = AVAILABLE_MODELS[0];

type ChatHistoryItem = {
  role: 'user' | 'model' | 'system';
  content: string;
};

interface ChatOptions {
  model?: string;
  history?: ChatHistoryItem[];
  config?: Record<string, unknown>;
}

interface ChatResponse {
  text: string;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Request failed (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function chatWithMeta(message: string, options: ChatOptions = {}): Promise<ChatResponse> {
  const {
    model = DEFAULT_MODEL,
    history = [],
    config = {},
  } = options;

  const payload = {
    model,
    message,
    history: history.map((item) => ({
      role: item.role,
      content: item.content,
    })),
    config,
  };

  return postJson<ChatResponse>('/chat', payload);
}

export async function testConnection(): Promise<string> {
  const result = await chatWithMeta('Hello, this is a test.');
  return result.text;
}
