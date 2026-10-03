import type { BotLevel, PlayerId } from '@manila/engine';

/** A seat played by a large language model; `llm` is the id of a saved AI profile (llm/settings). */
export interface LlmSeat {
  llm: string;
}

/** Who plays a computer seat: the built-in heuristic bot at a level, or a language model. */
export type ComputerSeat = BotLevel | LlmSeat;

/** Seats played by the computer, keyed by player id. Web-only; never part of the engine state. */
export type BotSeats = Partial<Record<PlayerId, ComputerSeat>>;

export function isLlmSeat(seat: ComputerSeat | undefined | null): seat is LlmSeat {
  return typeof seat === 'object' && seat !== null && typeof seat.llm === 'string';
}

/** Drops anything a stale or hand-edited save might carry that is not a valid seat. */
export function sanitizeSeats(raw: unknown): BotSeats {
  if (!raw || typeof raw !== 'object') return {};
  const seats: BotSeats = {};
  for (const [id, seat] of Object.entries(raw as Record<string, unknown>)) {
    if (seat === 'easy' || seat === 'normal' || seat === 'hard') seats[id] = seat;
    else if (isLlmSeat(seat as ComputerSeat)) seats[id] = { llm: (seat as LlmSeat).llm };
  }
  return seats;
}
