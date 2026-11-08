export interface TextImageAttachment {
  type: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}
export interface TextTranscriptLine {
  turnId?: string;
  role: string;
  text: string;
  attachments?: TextImageAttachment[];
  createdAt: string;
}
export interface TextTurnEvent {
  eventId: string;
  sessionId: string;
  turnId: string;
  sequence: number;
  type: string;
  content?: string;
  status?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}
