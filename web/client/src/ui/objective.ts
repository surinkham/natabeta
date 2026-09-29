import { OBJECTIVES } from "@shared/data";
import { game } from "./api";
import { sys } from "./chat";
let idx = 0;
export function refreshObjective() {
  const g = game(); const o = OBJECTIVES[idx]; if (!o) return;
  const done = o.done === "points0" ? g.P.points === 0 && g.P.level >= 1 && g.P.STR + g.P.VIT + g.P.DEX + g.P.AGI + g.P.INT + g.P.LUK > 30
    : o.done === "kills5" ? g.kills >= 5 : o.done === "crafted" ? g.crafted : false;
  if (done && idx < OBJECTIVES.length - 1) { sys(`✅ ${o.text}`, "lvl"); idx++; }
  document.getElementById("objtext")!.textContent = OBJECTIVES[idx].text;
}
