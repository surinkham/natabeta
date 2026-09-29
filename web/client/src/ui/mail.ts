// Mail window: letters with gold and items (shared/mail.ts). "รับของ" takes the attachment, 🗑 throws a read letter away.
import { itemName } from "@shared/data";
import { hasAttachment, unclaimed, type Mail } from "@shared/mail";
import { game } from "./api";
import { icon } from "./icons";
import { body, createWindow, isOpen, setHTML } from "./windows";

const esc = (s: string) => s.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`);
const when = (at: number) => new Date(at).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function setupMail() {
  createWindow("mail", "📬 จดหมาย", `<div id="mail-list"></div><div class="hint">ของขวัญและรางวัลจากทีมงานมาที่นี่ — กด "รับของ" เพื่อเก็บเข้ากระเป๋า</div>`);
  body("mail").addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-mail]"); if (!b) return;
    const [cmd, id] = b.dataset.mail!.split("|"); game().mail(cmd as "mailClaim" | "mailDelete", id);
  });
}
const row = (m: Mail) => {
  const gifts = [m.gold ? `<span class="mail-gift">💰 ${m.gold.toLocaleString()} Gold</span>` : "",
    ...(m.items ?? []).map(([it, n]) => `<span class="mail-gift"><span class="ic">${icon(it)}</span>${itemName(it)} ×${n}</span>`)].join("");
  const act = hasAttachment(m) && !m.claimed ? `<button data-mail="mailClaim|${m.id}">รับของ</button>` : `<button class="mail-del" data-mail="mailDelete|${m.id}" title="ลบจดหมาย">🗑</button>`;
  return `<div class="mail-row${m.claimed || !hasAttachment(m) ? " read" : ""}"><div><b>${esc(m.title)}</b><small>${esc(m.from)} · ${when(m.at)}</small><p>${esc(m.body)}</p>${gifts ? `<div>${gifts}${m.claimed ? ` <small>✔ รับแล้ว</small>` : ""}</div>` : ""}</div>${act}</div>`;
};
/** Redraw the list (when open) and the red dot on the menu button. */
export function refreshMail() {
  const P = game().P as { mail?: Mail[] };
  for (const el of document.querySelectorAll("#menu [data-win=mail]")) el.classList.toggle("alert", unclaimed(P) > 0);
  if (!isOpen("mail")) return;
  setHTML(body("mail").querySelector("#mail-list")!, (P.mail ?? []).map(row).join("") || `<div class="hint">ยังไม่มีจดหมาย</div>`);
}
