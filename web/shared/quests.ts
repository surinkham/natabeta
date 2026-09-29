// Guild quests (เควสกิลด์): the quest board in the guild grounds posts hunting jobs every day. An adventurer takes up to
// QUESTS_PER_DAY a day (the count resets at Bangkok midnight), hunts, then comes back to the board to hand the job in
// for gold. The board is the same for everyone on a day, drawn from the beasts around the reader's level. Pure: the
// sim keeps each player's log (shared/sim.ts), the client draws the board (client/src/ui/npc.ts).
import { MONSTERS } from "./data";

export const QUESTS_PER_DAY = 5, BOARD_SIZE = 6;
export interface Quest { id: string; kind: string; need: number; gold: number }
export interface QuestLog { day: number; taken: number; active: (Quest & { have: number })[] }
/** The quest day: changes at midnight Bangkok time (UTC+7). */
export const questDay = (ms = Date.now()) => Math.floor((ms + 7 * 3600e3) / 86400e3);

const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Today's board for a reader of level L: hunts of ordinary beasts (no bosses, no night creatures) near that level,
 *  the same list for everyone of that level band on that day. */
export function boardFor(day: number, level: number): Quest[] {
  const kinds = Object.keys(MONSTERS).filter(k => { const d = MONSTERS[k]; return !d.boss && !d.night && !d.base; }).sort();
  let near: string[] = [];
  for (let w = 3; near.length < BOARD_SIZE && w <= 40; w += 3) near = kinds.filter(k => Math.abs(MONSTERS[k].level - level) <= w);
  const band = Math.floor(level / 5), r = rand((day * 7919 + band * 104729) % 2147483646 + 1);
  const picks = [...near]; for (let i = picks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [picks[i], picks[j]] = [picks[j], picks[i]]; }   // Fisher–Yates: the client must draw the very board the server checks
  picks.length = Math.min(picks.length, BOARD_SIZE);
  return picks.map(kind => {
    const d = MONSTERS[kind], need = 6 + Math.floor(r() * 3) * 3;   // 6, 9 or 12
    return { id: `${day}.${kind}.${need}`, kind, need, gold: Math.round((25 + d.level * 14) * need / 3) };
  });
}
/** The log as of `day`: a new day clears the day's count (jobs already taken stay until handed in or dropped). */
export const logFor = (log: QuestLog | undefined, day: number): QuestLog =>
  !log ? { day, taken: 0, active: [] } : log.day === day ? log : { day, taken: 0, active: log.active };
