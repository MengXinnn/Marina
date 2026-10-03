import { chooseBotAction, type Action, type PlayerView } from '@manila/engine';

/** Runs the hard computer player's search off the main thread so the scene keeps animating. */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<HardRequest>) => void) | null;
  postMessage(message: HardReply): void;
};

export interface HardRequest {
  id: number;
  view: PlayerView;
  legal: Action[];
}
export interface HardReply {
  id: number;
  action: Action | null;
}

scope.onmessage = (e) => {
  const { id, view, legal } = e.data;
  let action: Action | null = null;
  try {
    action = chooseBotAction(view, legal, { level: 'hard', random: Math.random });
  } catch {
    action = null;
  }
  scope.postMessage({ id, action });
};
