// The game exposes one object to every UI module; set once in startGame() (avoids ui ↔ game import cycles).
// Commands are fire-and-forget: results come back as sim events (toast / chat), the same way online and offline.
import type { Mob, Player } from "../game";
import type { Npc } from "../world/npc";

export interface GameApi {
  P: Player; mobs: Map<string, Mob>; npcs: Npc[]; online: boolean;
  target: Mob | null;   // what the player clicked: gets a name + HP plate over its head
  drops(): { id: string; itemId: string; count: number; gold: number; x: number; z: number }[];   // loot lying on the floor
  mount(): void;
  act(skillId: string): void;
  /** Aimed skills (press, drag, let go): what kind of aim a skill takes, point it (mouse point or finger pull), cast it. */
  aimKind(skillId: string): "area" | "dir" | null;
  aimAt(skillId: string, w: { x: number; y: number } | { dx: number; dy: number } | null): void;
  aimCast(): void;
  /** Play a skill's animation and effects round the player, for show only (ui/skillpreview.ts). */
  previewSkill(skillId: string): void;
  learn(skillId: string): void;
  useItem(instanceId: string): void;
  equipInst(instanceId: string): void;
  unequipSlot(slot: string): void;
  allocate(attr: string, n: number): void;
  craft(recipeId: string): void;
  buy(itemId: string, n: number): void;
  sell(itemId: string, n: number): void;
  partyRules(exp: string, loot: string): void;
  cook(foodId: string): void;
  fish(yaw?: number): void;
  mail(cmd: "mailClaim" | "mailDelete", mailId: string): void;
  restyle(color: number): void;
  sit(): void;
  say(text: string, chan: "say" | "world" | "party"): void;
  market(cmd: "marketOpen" | "marketList" | "marketBuy" | "marketCancel", ...args: any[]): void;
  partyInvite(targetId: string): void; partyAccept(): void; partyLeave(): void; partyKick(targetId: string): void; respawnTown(town?: string): void; deathAt: { x: number; z: number; where: string; by: string } | null; reviveSelf(): void;
  /** Guild commands go straight to the host (see ui/guild.ts). */
  guild(cmd: "guildCreate" | "guildInvite" | "guildAccept" | "guildLeave" | "guildKick" | "guildPromote" | "guildDonate" | "guildUpgrade" | "guildLearn" | "guildBuy" | "guildEnter" | "guildExit" | "guildList" | "guildApply" | "guildApprove" | "guildReject", ...args: any[]): void;
  /** Friends and rankings (ui/social.ts). */
  social(cmd: "friendAdd" | "friendAccept" | "friendDecline" | "friendRemove" | "friendList" | "ranking", ...args: any[]): void;
  /** Guild quest board commands (ui/npc.ts). */
  quest(cmd: "questAccept" | "questTurnIn" | "questAbandon", questId: string): void;
  tradeReq(targetId: string): void; tradeAccept(): void; tradeOffer(items: Record<string, number>, gold: number): void; tradeConfirm(): void; tradeCancel(): void;
  cameraReset(): void;
  zoom(v: number): void;
  /** Walk to a point of the current map along a path round walls and trees; false if there is no way there. */
  walkTo(x: number, z: number): boolean;
  route(): { x: number; z: number }[];
  kills: number; crafted: boolean; autoMode: "melee" | "off";
}
let api: GameApi;
export const setGame = (g: GameApi) => { api = g; };
export const game = () => api;
