// Mailbox: letters to a character carrying gold and items, claimed from the Mail window. Every SYSTEM_MAIL reaches each
// character once (mailGot remembers which), so a new reward is one entry here and a deploy.
import { addItem, type Inventory } from "./inventory";

export interface Mail { id: string; from: string; title: string; body: string; gold?: number; items?: [string, number][]; at: number; claimed?: boolean }
export interface Mailbox { mail?: Mail[]; mailGot?: string[] }

export const SYSTEM_MAIL: Omit<Mail, "at">[] = [
  { id: "welcome-500k", from: "ทีมงาน Pawtale", title: "🎁 ของขวัญต้อนรับนักผจญภัย", body: "ขอบคุณที่มาร่วมผจญภัยใน Pawtale Kingdoms! รับทองเริ่มต้นไปใช้ได้เลย", gold: 500000 },
];
export const MAIL_MAX = 50;

/** Put each system mail this character has not had yet into its box (oldest letters drop off past MAIL_MAX). */
export function deliverSystemMail(p: Mailbox, now = Date.now()) {
  const got = (p.mailGot ??= []), box = (p.mail ??= []);
  for (const m of SYSTEM_MAIL) if (!got.includes(m.id)) { got.push(m.id); box.unshift({ ...m, at: now }); }
  if (box.length > MAIL_MAX) box.length = MAIL_MAX;
}

/** Take a letter's gold and items. All or nothing: a bag without room for every item takes none of them. */
export function claimMail(p: Mailbox & { gold: number; inv: Inventory }, mailId: string): string | undefined {
  const m = p.mail?.find(x => x.id === mailId); if (!m) return "ไม่พบจดหมาย"; if (m.claimed) return "รับไปแล้ว";
  const inv: Inventory = JSON.parse(JSON.stringify(p.inv));
  for (const [it, n] of m.items ?? []) if (!addItem(inv, it, n)) return "กระเป๋าเต็ม — ทำที่ว่างก่อนรับของ";
  Object.assign(p.inv, inv); p.gold += m.gold ?? 0; m.claimed = true; return undefined;
}
export const hasAttachment = (m: Mail) => !!(m.gold || m.items?.length);
export const unclaimed = (p: Mailbox) => (p.mail ?? []).filter(m => hasAttachment(m) && !m.claimed).length;
