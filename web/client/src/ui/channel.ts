// Channel picker: a "CH n" tag under the minimap; tapping it lists every channel with its head count (the server caps
// each at MAX_PER_CHANNEL) and moves you to the one you pick — or opens a new one.
import { MAX_PER_CHANNEL, NetHost } from "../net/host";
import { body, createWindow, setHTML, toggleWindow } from "./windows";

export function setupChannel(host: NetHost) {
  const tag = Object.assign(document.createElement("button"), { className: "ch-tag", title: "เปลี่ยน channel" });
  document.querySelector("#minimap .row")!.prepend(tag);
  const show = () => { tag.textContent = `CH ${host.channel}`; };
  show(); setInterval(show, 2000);   // the server tells us the channel just after joining
  createWindow("channels", "Channel", `<div class="hint">แต่ละ channel คือโลกคนละชุด รับได้ ${MAX_PER_CHANNEL} คน · ย้าย channel = โหลดเกมใหม่ (ตัวละครบันทึกไว้แล้ว)</div><div id="ch-list"></div>`);
  const el = body("channels");
  const refresh = async () => {
    const list = await NetHost.channels(), mine = host.channel;
    const next = Math.max(1, ...list.map(c => c.channel)) + 1;
    setHTML(el.querySelector("#ch-list")!, list.map(c => `<div class="shoprow"><span><b>CH ${c.channel}</b> ${c.channel === mine ? "· คุณอยู่ที่นี่" : ""}<br><small>${c.clients} / ${MAX_PER_CHANNEL} คน</small></span>
      ${c.channel === mine ? "" : `<button data-ch="${c.channel}" ${c.clients >= MAX_PER_CHANNEL ? "disabled" : ""}>${c.clients >= MAX_PER_CHANNEL ? "เต็ม" : "ย้าย"}</button>`}</div>`).join("")
      + `<div class="shoprow"><span><b>CH ${next}</b><br><small>channel ใหม่ (ว่าง)</small></span><button data-ch="${next}">เปิด</button></div>`);
  };
  tag.addEventListener("click", () => { toggleWindow("channels"); refresh(); });
  el.addEventListener("click", e => { const b = (e.target as HTMLElement).closest<HTMLElement>("[data-ch]"); if (b) NetHost.switchTo(+b.dataset.ch!); });
}
