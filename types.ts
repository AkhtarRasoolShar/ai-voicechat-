
export type Status = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface TranscriptMessage {
  speaker: 'user' | 'model';
  text: string;
}
