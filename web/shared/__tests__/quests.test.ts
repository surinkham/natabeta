import { describe, expect, it } from 'vitest';
import { Sim, save } from '../sim';
import { NPCS } from '../data';
import { QUESTS_PER_DAY, boardFor, questDay } from '../quests';

describe('guild quests', () => {
  const setup = (ms = Date.UTC(2026, 8, 25, 3)) => {
    const sim = new Sim() as any; sim.now = () => ms; sim.monsters.length = 0;
    const a = sim.join('a', { name: 'Ann', color: 1 }); const [bx, bz] = NPCS.NPC_QUEST_BOARD.pos; a.x = bx; a.z = bz + 1.5;
    return { sim, a, day: questDay(ms) };
  };
  it('the board is the same for everyone on a day, and hunts beasts near the reader\'s level', () => {
    const d = questDay(Date.UTC(2026, 8, 25)); expect(boardFor(d, 5)).toEqual(boardFor(d, 5));
    expect(boardFor(d, 5).length).toBeGreaterThan(0);
    expect(boardFor(d + 1, 5).map(q => q.id)).not.toEqual(boardFor(d, 5).map(q => q.id));
  });
  it('take at the board, hunt, hand in for gold; five a day, the count resets at midnight', () => {
    const { sim, a, day } = setup(), board = boardFor(day, a.level);
    a.x += 30; sim.questAccept('a', board[0].id); expect(a.quests?.active ?? []).toHaveLength(0);   // away from the board: no
    a.x -= 30; sim.questAccept('a', board[0].id); expect(a.quests.active).toHaveLength(1);
    const q = a.quests.active[0], gold = a.gold;
    sim.questTurnIn('a', q.id); expect(a.gold).toBe(gold);                                           // not done yet
    for (let i = 0; i < q.need + 2; i++) sim.questCount(a, q.kind);
    expect(a.quests.active[0].have).toBe(q.need);                                                  // stops at the target
    sim.questTurnIn('a', q.id); expect(a.gold).toBe(gold + q.gold); expect(a.quests.active).toHaveLength(0);
    // the day's limit counts jobs taken, handed in or not
    for (const x of board.slice(1)) sim.questAccept('a', x.id);
    expect(a.quests.taken).toBe(Math.min(QUESTS_PER_DAY, board.length));
    if (board.length > QUESTS_PER_DAY) expect(a.quests.active).toHaveLength(QUESTS_PER_DAY - 1);
    // next day: a fresh count, jobs in hand kept
    sim.now = () => Date.UTC(2026, 8, 26, 3); const held = a.quests.active.length;
    sim.questAbandon('a', a.quests.active[0].id); sim.questAccept('a', boardFor(day + 1, a.level)[0].id);
    expect(a.quests.taken).toBe(1); expect(a.quests.active).toHaveLength(held);
  });
  it('the log is saved with the character', () => {
    const { sim, a, day } = setup(); sim.questAccept('a', boardFor(day, a.level)[0].id);
    const s = save(a); expect(s.quests?.active).toHaveLength(1);
    const back = sim.join('b', { name: 'Ann', color: 1 }, s); expect(back.quests.active[0].id).toBe(a.quests.active[0].id);
  });
});
