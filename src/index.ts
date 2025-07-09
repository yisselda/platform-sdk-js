/**
 * Creole Platform JavaScript/TypeScript SDK
 * 
 * A comprehensive SDK for integrating with the Creole Translation Platform services.
 * Provides translation, speech-to-text, and text-to-speech capabilities.
 */

// Types
export interface CreoleSDKConfig {
  translationUrl?: string;
  sttUrl?: string;
  ttsUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface Language {
  code: string;
  name: string;
  native_name: string;
}

export interface Voice {
  id: string;
  name: string;
  language: string;
  gender: string;
  age: string;
  description: string;
}

export interface TranslationOptions {
  text: string;
  from: string;
  to: string;
}

export interface BatchTranslationOptions {
  text: string;
  from: string;
  to: string[];
}

export interface TranslationResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  confidence: number;
}

export interface TranscriptionOptions {
  language?: string;
  model?: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  duration: number;
}

export interface SynthesisOptions {
  language?: string;
  voice?: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

export interface StreamingTranscriptionOptions {
  language?: string;
  model?: string;
  onPartialResult?: (text: string, confidence: number) => void;
  onFinalResult?: (result: TranscriptionResult) => void;
  onError?: (error: Error) => void;
}

// SDK Implementation
export class CreolePlatformSDK {
  private config: Required<CreoleSDKConfig>;

  constructor(config: CreoleSDKConfig = {}) {
    this.config = {
      translationUrl: config.translationUrl || 'http://localhost:8001',
      sttUrl: config.sttUrl || 'http://localhost:8002',
      ttsUrl: config.ttsUrl || 'http://localhost:8003',
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3
    };
  }

  // Utility method for API calls
  private async apiCall<T>(
    url: string,
    options: RequestInit = {},
    retries: number = this.config.retryAttempts
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`,
          status_code: response.status
        }));
        throw new Error(errorData.error || `API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (retries > 0 && error instanceof Error && error.name !== 'AbortError') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.apiCall<T>(url, options, retries - 1);
      }
      
      throw error;
    }
  }

  // Translation methods
  async translate(options: TranslationOptions): Promise<TranslationResult> {
    const { text, from, to } = options;
    
    return this.apiCall<TranslationResult>(
      `${this.config.translationUrl}/api/v1/translate`,
      {
        method: 'POST',
        body: JSON.stringify({
          text,
          source_language: from,
          target_language: to
        })
      }
    );
  }

  async translateBatch(options: BatchTranslationOptions): Promise<Record<string, TranslationResult>> {
    const { text, from, to } = options;
    
    const result = await this.apiCall<{ translations: Record<string, TranslationResult> }>(
      `${this.config.translationUrl}/api/v1/translate/batch`,
      {
        method: 'POST',
        body: JSON.stringify({
          text,
          source_language: from,
          target_languages: to
        })
      }
    );

    return result.translations;
  }

  async getSupportedLanguages(): Promise<Language[]> {
    const result = await this.apiCall<{ supported_languages: Language[] }>(
      `${this.config.translationUrl}/api/v1/languages`
    );
    return result.supported_languages;
  }

  // Speech-to-Text methods
  async transcribeAudio(
    audioFile: File | Blob,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    formData.append('file', audioFile);
    
    if (options.language) {
      formData.append('language', options.language);
    }
    if (options.model) {
      formData.append('model', options.model);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.sttUrl}/api/v1/transcribe`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `Transcription failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async detectLanguage(audioFile: File | Blob): Promise<{ detected_language: string; confidence: number }> {
    const formData = new FormData();
    formData.append('file', audioFile);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.sttUrl}/api/v1/detect-language`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Language detection failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Streaming transcription
  startStreamingTranscription(options: StreamingTranscriptionOptions = {}): {
    sendAudioChunk: (audioChunk: ArrayBuffer) => void;
    stop: () => void;
    isConnected: () => boolean;
  } {
    const wsUrl = this.config.sttUrl.replace(/^http/, 'ws') + '/api/v1/stream';
    const ws = new WebSocket(wsUrl);
    let isConnected = false;

    ws.onopen = () => {
      isConnected = true;
      // Send initial configuration
      if (options.language || options.model) {
        ws.send(JSON.stringify({
          type: 'config',
          data: JSON.stringify({
            language: options.language || 'auto',
            model: options.model || 'whisper-base'
          })
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'partial_transcript' && options.onPartialResult) {
          options.onPartialResult(message.data.text, message.data.confidence);
        } else if (message.type === 'final_transcript' && options.onFinalResult) {
          options.onFinalResult({
            text: message.data.text,
            language: message.data.language,
            confidence: message.data.confidence,
            duration: 0
          });
        } else if (message.type === 'error' && options.onError) {
          options.onError(new Error(message.data.message));
        }
      } catch (error) {
        if (options.onError) {
          options.onError(new Error('Failed to parse WebSocket message'));
        }
      }
    };

    ws.onclose = () => {
      isConnected = false;
    };

    ws.onerror = (error) => {
      if (options.onError) {
        options.onError(new Error('WebSocket connection error'));
      }
    };

    return {
      sendAudioChunk: (audioChunk: ArrayBuffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64 = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(audioChunk))));
          ws.send(JSON.stringify({
            type: 'audio_chunk',
            data: base64
          }));
        }
      },
      stop: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stop' }));
        }
        ws.close();
      },
      isConnected: () => isConnected
    };
  }

  // Text-to-Speech methods
  async synthesizeText(
    text: string,
    options: SynthesisOptions = {}
  ): Promise<Blob> {
    const requestBody = {
      text,
      language: options.language || 'ht',
      voice: options.voice || 'default',
      speed: options.speed || 1.0,
      pitch: options.pitch || 1.0,
      volume: options.volume || 1.0
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.ttsUrl}/api/v1/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP ${response.status}: ${response.statusText}`
        }));
        throw new Error(errorData.error || `Speech synthesis failed: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async getAvailableVoices(language?: string): Promise<Voice[]> {
    const endpoint = language 
      ? `${this.config.ttsUrl}/api/v1/voices/${language}`
      : `${this.config.ttsUrl}/api/v1/voices`;
    
    const result = await this.apiCall<{ voices: Voice[] }>(endpoint);
    return result.voices;
  }

  async previewVoice(
    voiceId: string,
    language: string = 'ht',
    sampleText: string = 'Bonjou, koman ou ye?'
  ): Promise<Blob> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.ttsUrl}/api/v1/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voice_id: voiceId,
          language,
          text: sampleText
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Voice preview failed: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Health check methods
  async checkHealth(): Promise<{ translation: boolean; stt: boolean; tts: boolean }> {
    const checkService = async (url: string): Promise<boolean> => {
      try {
        const response = await fetch(`${url}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        });
        return response.ok;
      } catch {
        return false;
      }
    };

    const [translation, stt, tts] = await Promise.all([
      checkService(this.config.translationUrl),
      checkService(this.config.sttUrl),
      checkService(this.config.ttsUrl)
    ]);

    return { translation, stt, tts };
  }

  // Configuration methods
  updateConfig(newConfig: Partial<CreoleSDKConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): CreoleSDKConfig {
    return { ...this.config };
  }
}

// Export convenience functions
export const createCreoleSDK = (config?: CreoleSDKConfig): CreolePlatformSDK => {
  return new CreolePlatformSDK(config);
};

// Default export
export default CreolePlatformSDK;