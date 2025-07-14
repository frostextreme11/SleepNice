export interface Alarm {
  id: string;
  time: string; // "HH:MM"
  label: string;
  isActive: boolean;
  days: number[]; // 0 for Sunday, 1 for Monday, etc.
}

export interface SleepEvent {
  time: number; // seconds into the recording
  type: 'Snore' | 'Talk' | 'Cough' | 'Fart' | 'Movement' | 'Other';
  description: string;
  duration: number; // duration of the event in seconds
}

export interface SleepStage {
  stage: 'Awake' | 'Light' | 'Deep' | 'REM';
  startTime: number; // seconds into the recording
  endTime: number; // seconds into the recording
}

export interface AnalysisData {
  date: string; // ISO string of when the session was completed
  sleepScore: number; // A score from 0-100
  summary: string; // A one-sentence summary of the night's sleep
  events: SleepEvent[];
  stages: SleepStage[];
  duration: number; // total duration in seconds
}
