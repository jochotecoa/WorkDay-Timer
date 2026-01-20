
export enum TimerStatus {
  IDLE = 'IDLE',
  LISTENING = 'LISTENING',
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED'
}

export interface TimerState {
  startTime: number | null;
  endTime: number | null;
  status: TimerStatus;
}

export interface ProductivityTip {
  title: string;
  advice: string;
}
