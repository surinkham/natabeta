import { itemIcon } from "../items/item-icons";
import { ITEMS, SKILLS } from "@shared/data";
// Hand-drawn SVG icons (32×32) for skills and items — crisp at any size, themed to the parchment UI. No emoji.
const P = { steel: "#cfd6de", steelDk: "#6b7480", gold: "#e0b23f", goldDk: "#9a6f12", wood: "#a5713a", woodDk: "#5c3a16", red: "#d8433c", redDk: "#8a1f1a",
            blue: "#3e78c4", blueDk: "#1f3f78", bone: "#f1e9d2", fur: "#c98a48", green: "#5cb85c", ink: "#2b1a0e", pink: "#ef6f8f", teal: "#3b8f9a", leather: "#8b5a2b" };
const O = "#2b1a0e", W = "#fff8e6", GOLD = "#f0c463", STEEL = "#dfe6ee";
/** Outlined stroke: a dark wide pass under a light narrow one, so glyphs read on any tile colour. */
const line = (d: string, outer: number, inner: number, fill = "none", color = W) => `<path d="${d}" fill="${fill}" stroke="${O}" stroke-width="${outer}"/><path d="${d}" fill="${fill}" stroke="${color}" stroke-width="${inner}"/>`;
const spark = (x: number, y: number, k = 1) => `<path d="M${x} ${y - 4 * k} l${1.3 * k} ${2.7 * k} ${2.7 * k} ${1.3 * k} ${-2.7 * k} ${1.3 * k} ${-1.3 * k} ${2.7 * k} ${-1.3 * k} ${-2.7 * k} ${-2.7 * k} ${-1.3 * k} ${2.7 * k} ${-1.3 * k}z" fill="${W}" stroke="${O}" stroke-width="1"/>`;
/** A short sword, blade up-right; scale/offset let other icons tuck a small one in. */
const sword = (k = 1, dx = 0, dy = 0) => `<g transform="translate(${dx} ${dy}) scale(${k})">${line("M9 23 L24 8", 6, 3.4, "none", STEEL)}<path d="M24 8 l1.5 -1.5" stroke="${O}" stroke-width="3"/>${line("M7.5 18.5 L13.5 24.5", 5.5, 3, "none", GOLD)}${line("M8 24 L4.5 27.5", 4.5, 2.2, "none", "#a5713a")}</g>`;
const arrow = () => `${line("M6 26 L23 9", 4.2, 2, "none", "#d9a466")}<path d="M26 6 l-9 2 7 7z" fill="${STEEL}" stroke="${O}" stroke-width="1.4"/><path d="M6.5 25.5 l-1.5 -5.5 3.5 2.5z M6.5 25.5 l5.5 1.5 -2.5 -3.5z" fill="${W}" stroke="${O}" stroke-width="1"/>`;
/** Skill tile: rounded square, element gradient (light → dark), a faint inner bevel, the glyph on top. */
const badge = (id: string, c1: string, c2: string, glyph: string) => wrap(`<defs><radialGradient id="sk-${id}" cx="32%" cy="28%" r="85%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="url(#sk-${id})" stroke="${O}" stroke-width="1.5"/><rect x="3.4" y="3.4" width="25.2" height="25.2" rx="5.6" fill="none" stroke="#fff" stroke-opacity=".35"/>${glyph}`);
const wrap = (body: string) => `<svg viewBox="0 0 32 32" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const ICONS: Record<string, string> = {
  // ---- skills: one badge style (rounded tile, element-coloured gradient, cream glyph with a dark outline)
  SKILL_BASIC: badge("basic", "#b8c8d8", "#34465a", sword()),
  SKILL_SLASH: badge("slash", "#9fd8ff", "#1f3f78", `${line("M6 23 Q9 9 26 6", 6, 3.5, "none")}${spark(24, 6)}${sword(0.55, 3, 13)}`),
  SKILL_DASH: badge("dash", "#a8f0e0", "#1f6f78", `${line("M11 9 l7 7 -7 7", 6, 3.5, "none")}${line("M18 9 l7 7 -7 7", 6, 3.5, "none")}${line("M4 12 h4 M3 16 h6 M4 20 h4", 4, 2, "none")}`),
  SKILL_BASH: badge("bash", "#f5c878", "#8a4a12", `<g transform="rotate(-35 16 15)"><rect x="8" y="5" width="16" height="9" rx="2" fill="${W}" stroke="${O}" stroke-width="1.6"/><rect x="14.5" y="14" width="3" height="14" rx="1.2" fill="#b07a40" stroke="${O}" stroke-width="1.3"/></g>${spark(7, 25, 1.2)}`),
  SKILL_WHIRL: badge("whirl", "#cdeeff", "#2f6fa0", line("M17 16 a2 2 0 1 0 -3 -1.5 a5 5 0 1 0 8 -3 a8.5 8.5 0 1 0 -1 13", 5, 2.6, "none")),
  SKILL_HEAL: badge("heal", "#c8f5b0", "#2f7d3a", `<path d="M16 26 C6 19 5 13 9 9.5 C12 7 15 9 16 11 C17 9 20 7 23 9.5 C27 13 26 19 16 26z" fill="#ff8a9a" stroke="${O}" stroke-width="1.6"/>${line("M16 13 v8 M12 17 h8", 5, 2.8, "none")}`),
  SKILL_HEAL_CIRCLE: badge("healc", "#eaffb8", "#3a8a3a", `${line("M16 7 a9 9 0 1 1 -0.1 0", 5, 2.6, "none")}${line("M16 11 v10 M11 16 h10", 5.5, 3, "none", GOLD)}`),
  SKILL_SHOOT: badge("shoot", "#ecd3a0", "#6b4a22", arrow()),
  SKILL_POWER_SHOT: badge("power", "#ffb8a8", "#8a1f1a", `<circle cx="19" cy="13" r="7.2" fill="none" stroke="${O}" stroke-width="4"/><circle cx="19" cy="13" r="7.2" fill="none" stroke="${W}" stroke-width="2"/><circle cx="19" cy="13" r="3.6" fill="#ff6a5a" stroke="${O}" stroke-width="1.5"/>${arrow()}`),
  SKILL_ARROW_RAIN: badge("rain", "#ddd0ff", "#4a3a8a", `<path d="M7 13 a4 4 0 0 1 4.5 -4.5 a5.5 5.5 0 0 1 10 1 a4 4 0 0 1 3.5 7 h-16 a3 3 0 0 1 -2 -3.5z" fill="${W}" stroke="${O}" stroke-width="1.6"/>${[9, 15.5, 22].map(x => `${line(`M${x} 19 l-2 8`, 3.6, 1.8, "none")}<path d="M${x - 2.6} 28.5 l-1 -3.6 3.2 1.2z" fill="${STEEL}" stroke="${O}" stroke-width="1"/>`).join("")}`),
  SKILL_BOLT: badge("bolt", "#b8e2ff", "#1a3a8a", `<path d="M21 5 C28 8 28.5 17 22 20.5 C18 23 13 22.5 11 20 L4 27.5 L7.5 19 L4.5 20 L10 13.5 C11 8.5 16 4 21 5z" fill="#6fb8ff" stroke="${O}" stroke-width="1.5"/><path d="M20 9 C24 10.5 24.5 15.5 21 17.5 C18 19 14.5 17.5 14.5 14.5 C14.5 11.5 17 8.8 20 9z" fill="#d8f0ff"/><circle cx="19.5" cy="13.8" r="2.2" fill="${W}"/>`),
  SKILL_METEOR: badge("meteor", "#ffd890", "#a02a10", `${line("M16 16 L4 27 M18 19 L9 29 M13 13 L3 20", 5, 2.8, "none", "#ffb040")}<circle cx="21" cy="11" r="7" fill="#6b4a3a" stroke="${O}" stroke-width="1.6"/><path d="M18 9 l3 2 -1 3 M23 8 l1 3" fill="none" stroke="#ff9a3a" stroke-width="1.6"/>`),
  SKILL_FROST_NOVA: badge("frost", "#e6faff", "#2f8ab8", line("M16 5 v22 M6.5 10.5 l19 11 M6.5 21.5 l19 -11 M13 6.5 l3 3 3 -3 M13 25.5 l3 -3 3 3 M6 14.5 l4 -1 -1 -4 M26 17.5 l-4 1 1 4 M6 17.5 l4 1 -1 4 M26 14.5 l-4 -1 1 -4", 4, 2, "none")),
  SKILL_GROUND_SLAM: badge("slam", "#ecd0a8", "#6b3a1a", `${line("M3 24 h26", 4, 2, "none", "#b07a40")}${line("M16 22 l-5 6 M16 22 l5 6 M16 22 v7", 3.5, 1.6, "none", "#ffcf6a")}<path d="M16 4 l2.4 5.6 6 -1.8 -3.4 5.2 4.8 3.8 -6 .4 .2 6 -4 -4.6 -4 4.6 .2 -6 -6 -.4 4.8 -3.8 -3.4 -5.2 6 1.8z" fill="#ffe08a" stroke="${O}" stroke-width="1.4"/>`),
  SKILL_LIGHTNING: badge("thunder", "#f0e2ff", "#4a2a8a", `<path d="M18 3 L8 18 H15 L12 29 L25 12 H18 L22 3z" fill="#ffe46a" stroke="${O}" stroke-width="1.6"/>`),
  SKILL_FLAME_BLADE: badge("flame", "#ffe2a0", "#b8320f", `<path d="M9 24 C8 16 14 15 12 8 C17 12 18 8 16 4 C24 9 27 18 19 22z" fill="#ffab3a" stroke="${O}" stroke-width="1.4"/><path d="M12 21 C12 16 16 15 15 11 C19 14 21 18 17 21z" fill="#ffe46a"/>${sword()}`),
  SKILL_HAWKEYE: badge("hawk", "#d6f5c8", "#23604a", `<path d="M3.5 16 Q16 4.5 28.5 16 Q16 27.5 3.5 16z" fill="${W}" stroke="${O}" stroke-width="1.6"/><circle cx="16" cy="16" r="5.6" fill="#4fb86a" stroke="${O}" stroke-width="1.4"/><circle cx="16" cy="16" r="2.4" fill="${O}"/><circle cx="14.2" cy="14" r="1.2" fill="${W}"/>${line("M16 2.5 v4 M16 25.5 v4 M1.8 16 h3 M27.2 16 h3", 3.4, 1.6, "none", GOLD)}`),
  SKILL_GROVE_MEND: badge("grove", "#e2ffc8", "#2e6e30", `<path d="M16 28 C6 25 3.5 15 8.5 5.5 C11.5 13 17 17 16 28z" fill="#8fdc6a" stroke="${O}" stroke-width="1.4"/><path d="M16 28 C26 25 28.5 15 23.5 5.5 C20.5 13 15 17 16 28z" fill="#6cc452" stroke="${O}" stroke-width="1.4"/><path d="M16 22 C10.5 18 10.5 13.5 13.2 12.4 C15 11.8 16 13.2 16 13.8 C16 13.2 17 11.8 18.8 12.4 C21.5 13.5 21.5 18 16 22z" fill="#ff8a9a" stroke="${O}" stroke-width="1.3"/>${spark(25, 5.5, 0.7)}`),
  SKILL_GLACIER_RING: badge("glacier", "#f0fbff", "#2a78b0", `${line("M16 6.5 a9.5 9.5 0 1 1 -0.1 0", 6, 3.4, "none", "#dff6ff")}${[[16, 2], [30, 16], [16, 30], [2, 16]].map(([x, y]) => `<path d="M${x} ${y - 3.6} l2.4 3.6 -2.4 3.6 -2.4 -3.6z" fill="#9fe6ff" stroke="${O}" stroke-width="1.2"/>`).join("")}${spark(16, 16, 0.8)}`),
  SKILL_DUNE_QUAKE: badge("dune", "#ffe6a8", "#8a5418", `<path d="M8 12 l3 -3.5 3.2 2 -1 3.5z M19.5 8.5 l3 -2.2 2.4 3 -3.2 2.2z" fill="#c08a4a" stroke="${O}" stroke-width="1.2"/>${line("M5 6 v3 M27 13 v3", 3, 1.4, "none", "#fff2c8")}<path d="M1.5 22 Q9 13.5 16 19.5 Q23 12.5 30.5 18.5 V30.5 H1.5z" fill="#f0c878" stroke="${O}" stroke-width="1.5"/>${line("M16 30 L13.5 25.5 L18 22.5 L14.8 19", 3.6, 1.6, "none", "#7a4a1a")}`),
  SKILL_CINDER_CLEAVE: badge("cinder", "#ffd89a", "#a0240c", `${line("M14 18 L6.5 28.5", 5, 2.6, "none", "#a5713a")}<path d="M9.5 5.5 H23 Q26.5 13 20.5 18.5 H10z" fill="${STEEL}" stroke="${O}" stroke-width="1.6"/><path d="M22 5 C27.5 8.5 28.5 14.5 24 19 C25 13.5 21.5 12 22 5z" fill="#ffab3a" stroke="${O}" stroke-width="1.2"/><circle cx="27" cy="22.5" r="1.3" fill="#ffd24a" stroke="${O}" stroke-width=".8"/><circle cx="24" cy="26" r="1" fill="#ffd24a" stroke="${O}" stroke-width=".8"/>`),
  SKILL_ECLIPSE_STORM: badge("eclipse", "#eadcff", "#3a1f6a", `${line("M16 1.8 v2.6 M6 5.5 l1.8 1.8 M26 5.5 l-1.8 1.8 M3 13 h2.6 M29 13 h-2.6", 3, 1.4, "none", "#ffd98a")}<circle cx="16" cy="12.5" r="7" fill="none" stroke="${O}" stroke-width="4"/><circle cx="16" cy="12.5" r="7" fill="#2a1a3a" stroke="#ffd98a" stroke-width="2"/><path d="M18 18.5 L12 26 H16.2 L14 30.5 L21.5 22 H17.2 L19.5 18.5z" fill="#ffe46a" stroke="${O}" stroke-width="1.3"/>`),
  SKILL_REVIVE: badge("revive", "#fff6d8", "#a07018", `<ellipse cx="16" cy="4.8" rx="5" ry="1.8" fill="none" stroke="${O}" stroke-width="3"/><ellipse cx="16" cy="4.8" rx="5" ry="1.8" fill="none" stroke="${GOLD}" stroke-width="1.4"/>${[1, -1].map(k => `<g transform="translate(${k < 0 ? 32 : 0} 0) scale(${k} 1)"><path d="M14.5 18 C8.5 18 4.5 14 3.5 8 C7.5 11 9.5 10 11.8 11 C9.8 13 11.8 15 14.5 15z" fill="${W}" stroke="${O}" stroke-width="1.3"/></g>`).join("")}${line("M16 8.5 v19 M11.5 14 h9", 5.5, 3, "none", GOLD)}`),
  // the stat reset scroll: a usable, so it wears the framed tile like the skills — a scroll with a turning arrow pair
  STAT_RESET: badge("reset", "#fff0c8", "#8a4a12", `<rect x="7.5" y="6.5" width="17" height="19" rx="1.5" fill="#f3e6c4" stroke="${O}" stroke-width="1.4"/><rect x="5.5" y="4.3" width="21" height="4.2" rx="2.1" fill="#d9b877" stroke="${O}" stroke-width="1.3"/><rect x="5.5" y="23.5" width="21" height="4.2" rx="2.1" fill="#d9b877" stroke="${O}" stroke-width="1.3"/>${line("M11.5 15.3 A5 5 0 0 1 20 12.4", 3.4, 1.8, "none", "#3e78c4")}<path d="M21.2 9.6 l-0.2 3.9 -3.6 -1.3z" fill="#3e78c4" stroke="${O}" stroke-width=".9"/>${line("M20.5 17 A5 5 0 0 1 12 19.8", 3.4, 1.8, "none", "#3e78c4")}<path d="M10.8 22.6 l0.2 -3.9 3.6 1.3z" fill="#3e78c4" stroke="${O}" stroke-width=".9"/>`),
  // ---- consumables & materials
  HP_POTION: wrap(`<path d="M13 3 h6 v6 l5 8 v9 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3 v-9 l5 -8z" fill="${P.red}" stroke="${P.redDk}" stroke-width="2"/><path d="M11 17 h10 v8 a2 2 0 0 1 -2 2 h-6 a2 2 0 0 1 -2 -2z" fill="${P.redDk}" opacity=".5"/><rect x="12" y="2" width="8" height="4" rx="1" fill="${P.wood}" stroke="${P.woodDk}"/><path d="M14 12 q-2 3 -1 6" stroke="#ffd0cc" stroke-width="2" fill="none"/>`),
  WOLF_FANG: wrap(`<path d="M10 4 q10 2 12 6 q-4 8 -10 22 q-3 -12 -4 -20 q-1 -6 2 -8z" fill="${P.bone}" stroke="#a89a78" stroke-width="2"/><path d="M12 8 q4 2 6 4" stroke="#fff" stroke-width="2"/>`),
  WOLF_HIDE: wrap(`<path d="M6 8 q6 -6 20 0 q3 8 0 16 q-8 6 -20 0 q-3 -8 0 -16z" fill="#8c8f95" stroke="#4b4e55" stroke-width="2"/><path d="M10 10 q6 3 12 0 M9 20 q7 -3 14 0" stroke="#c9ccd1" stroke-width="2" fill="none"/>`),
  IRON_ORE: wrap(`<path d="M8 22 l4 -12 l8 -4 l6 8 l-2 10 l-12 2z" fill="#6f6a66" stroke="#3a3632" stroke-width="2"/><path d="M12 12 l8 -3 l3 6" fill="#9a948f" stroke="none"/><circle cx="17" cy="17" r="2.5" fill="${P.steel}"/><circle cx="12" cy="20" r="1.5" fill="${P.steel}"/>`),
  // ---- weapons
  WOODEN_SWORD: wrap(`<path d="M7 25 L23 9" stroke="${P.wood}" stroke-width="5"/><path d="M7 25 L23 9" stroke="#d9a466" stroke-width="2"/><path d="M20 6 l4 4" stroke="${P.woodDk}" stroke-width="3"/><path d="M4 22 l6 6" stroke="${P.woodDk}" stroke-width="3"/><circle cx="5" cy="27" r="2.2" fill="${P.leather}" stroke="${P.woodDk}"/>`),
  WOLF_FANG_SWORD: wrap(`<path d="M7 25 L24 8" stroke="${P.bone}" stroke-width="6"/><path d="M7 25 L24 8" stroke="#fff" stroke-width="2"/><path d="M22 6 l4 4" stroke="${P.gold}" stroke-width="3"/><path d="M4 22 l6 6" stroke="${P.gold}" stroke-width="3"/><circle cx="9" cy="23" r="2.4" fill="${P.blue}" stroke="${P.blueDk}"/><circle cx="5" cy="27" r="2" fill="${P.leather}" stroke="${P.woodDk}"/>`),
  // ---- armour
  KNIGHT_HELMET: wrap(`<path d="M8 20 v-6 a8 8 0 0 1 16 0 v6z" fill="${P.steel}" stroke="${P.steelDk}" stroke-width="2"/><rect x="8" y="14" width="16" height="4" fill="${P.steelDk}"/><path d="M11 14 v4 M15 14 v4 M19 14 v4" stroke="${P.ink}" stroke-width="1.2"/><path d="M8 20 h16 v6 a3 3 0 0 1 -3 3 h-10 a3 3 0 0 1 -3 -3z" fill="${P.steel}" stroke="${P.steelDk}" stroke-width="2"/><path d="M16 4 q-2 -3 -5 -1 q1 3 5 4z" fill="${P.red}" stroke="${P.redDk}"/><path d="M8 13 h16" stroke="${P.gold}" stroke-width="2"/>`),
  KNIGHT_CHEST: wrap(`<path d="M8 6 l4 -2 h8 l4 2 v14 q-8 8 -16 0z" fill="${P.steel}" stroke="${P.steelDk}" stroke-width="2"/><path d="M16 6 v16" stroke="${P.steelDk}" stroke-width="1.5"/><path d="M8 6 h16" stroke="${P.gold}" stroke-width="2"/><circle cx="16" cy="14" r="2.5" fill="${P.gold}" stroke="${P.goldDk}"/>`),
  STARTER_CHEST: wrap(`<path d="M8 6 l4 -2 h8 l4 2 v14 q-8 8 -16 0z" fill="${P.teal}" stroke="#1f4f56" stroke-width="2"/><path d="M8 6 h16" stroke="${P.gold}" stroke-width="2"/><path d="M12 12 h8 M12 16 h8" stroke="#1f4f56" stroke-width="1.5"/>`),
  KNIGHT_GLOVES: wrap(`<path d="M10 28 v-10 l-3 -4 l3 -2 v-6 h9 v6 l4 2 l-2 4 v10z" fill="${P.steel}" stroke="${P.steelDk}" stroke-width="2"/><path d="M10 18 h11" stroke="${P.gold}" stroke-width="2"/><path d="M13 6 v12 M16 6 v12 M19 6 v12" stroke="${P.steelDk}" stroke-width="1.2"/>`),
  KNIGHT_BOOTS: wrap(`<path d="M10 4 h8 v14 h6 a3 3 0 0 1 3 3 v4 h-17 v-21z" fill="${P.steel}" stroke="${P.steelDk}" stroke-width="2"/><path d="M10 4 h8" stroke="${P.gold}" stroke-width="3"/><path d="M10 25 h17" stroke="${P.ink}" stroke-width="2"/>`),
  STARTER_BOOTS: wrap(`<path d="M10 4 h8 v14 h6 a3 3 0 0 1 3 3 v4 h-17 v-21z" fill="${P.leather}" stroke="${P.woodDk}" stroke-width="2"/><path d="M10 25 h17" stroke="${P.ink}" stroke-width="2"/><path d="M12 10 h4 M12 14 h4" stroke="${P.woodDk}" stroke-width="1.5"/>`),
  KNIGHT_CAPE: wrap(`<path d="M9 5 h14 l3 22 q-10 4 -20 0z" fill="${P.blue}" stroke="${P.blueDk}" stroke-width="2"/><path d="M9 5 h14" stroke="${P.gold}" stroke-width="3"/><circle cx="16" cy="18" r="3" fill="${P.gold}"/><circle cx="12.5" cy="14" r="1.4" fill="${P.gold}"/><circle cx="16" cy="12.5" r="1.4" fill="${P.gold}"/><circle cx="19.5" cy="14" r="1.4" fill="${P.gold}"/>`),
  KITE_SHIELD: wrap(`<path d="M8 4 h16 v12 q0 8 -8 12 q-8 -4 -8 -12z" fill="${P.blue}" stroke="${P.gold}" stroke-width="2.5"/><circle cx="16" cy="16" r="3" fill="${P.gold}"/><circle cx="12.5" cy="12" r="1.4" fill="${P.gold}"/><circle cx="16" cy="10.5" r="1.4" fill="${P.gold}"/><circle cx="19.5" cy="12" r="1.4" fill="${P.gold}"/>`),
  // ---- slots (empty) & misc
  SLOT_Head: wrap(`<path d="M8 20 v-6 a8 8 0 0 1 16 0 v6z M8 20 h16 v6 h-16z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_Face: wrap(`<circle cx="11" cy="16" r="5" fill="none" stroke="#b39a78" stroke-width="2"/><circle cx="21" cy="16" r="5" fill="none" stroke="#b39a78" stroke-width="2"/><path d="M16 16 h0" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_MainWeapon: wrap(`<path d="M7 25 L24 8 M20 6 l4 4 M4 22 l6 6" fill="none" stroke="#b39a78" stroke-width="2.5"/>`),
  SLOT_Back: wrap(`<path d="M9 5 h14 l3 22 q-10 4 -20 0z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_Accessory1: wrap(`<circle cx="16" cy="18" r="7" fill="none" stroke="#b39a78" stroke-width="2.5"/><path d="M12 9 l4 -4 l4 4" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_Chest: wrap(`<path d="M8 6 l4 -2 h8 l4 2 v14 q-8 8 -16 0z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_OffHand: wrap(`<path d="M8 4 h16 v12 q0 8 -8 12 q-8 -4 -8 -12z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_Gloves: wrap(`<path d="M10 28 v-10 l-3 -4 l3 -2 v-6 h9 v6 l4 2 l-2 4 v10z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_Boots: wrap(`<path d="M10 4 h8 v14 h6 a3 3 0 0 1 3 3 v4 h-17z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  SLOT_Accessory2: wrap(`<path d="M8 10 q8 -8 16 0 q-2 12 -8 16 q-6 -4 -8 -16z" fill="none" stroke="#b39a78" stroke-width="2"/>`),
  // ---- menu glyphs (single colour, inherit via currentColor)
  MENU_status: wrap(`<rect x="5" y="16" width="5" height="11" fill="currentColor"/><rect x="13" y="9" width="5" height="18" fill="currentColor"/><rect x="21" y="4" width="5" height="23" fill="currentColor"/>`),
  MENU_items: wrap(`<path d="M6 11 h20 v15 a2 2 0 0 1 -2 2 h-16 a2 2 0 0 1 -2 -2z" fill="currentColor"/><path d="M11 11 v-3 a5 5 0 0 1 10 0 v3" fill="none" stroke="currentColor" stroke-width="2.5"/>`),
  MENU_equip: wrap(`<path d="M8 5 h16 v11 q0 8 -8 12 q-8 -4 -8 -12z" fill="currentColor"/>`),
  MENU_skill: wrap(`<path d="M16 3 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="currentColor"/>`),
  MENU_sit: wrap(`<path d="M8 6 h4 v10 h10 v-4 h4 v14 h-4 v-6 h-10 v6 h-4z" fill="currentColor"/>`),
  MENU_camera: wrap(`<rect x="4" y="10" width="17" height="13" rx="2" fill="currentColor"/><path d="M21 14 l7 -4 v13 l-7 -4z" fill="currentColor"/>`),
  MENU_guild: wrap(`<path d="M6 27 V12 l4 -3 v4 h3 V8 l3 -3 l3 3 v5 h3 V9 l4 3 V27 H19 v-6 a3 3 0 0 0 -6 0 v6z" fill="currentColor"/>`),
  MENU_players: wrap(`<circle cx="11" cy="11" r="4.5" fill="currentColor"/><circle cx="22" cy="12" r="3.5" fill="currentColor"/><path d="M3 26 q8 -10 16 0z M17 25 q5 -7 11 0z" fill="currentColor"/>`),
  MENU_codex: wrap(`<path d="M5 6 q5 -2 11 1 v20 q-6 -3 -11 -1z M27 6 q-5 -2 -11 1 v20 q6 -3 11 -1z" fill="currentColor"/>`),
  MENU_mail: wrap(`<rect x="4" y="8" width="24" height="17" rx="2" fill="currentColor"/><path d="M5 9 l11 9 l11 -9" fill="none" stroke="#2b1d10" stroke-width="2.2"/>`),
  MENU_logout: wrap(`<path d="M14 5 H6 v22 h8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 16 h14 M21 10 l6 6 l-6 6" fill="none" stroke="currentColor" stroke-width="3"/>`),
  MENU_options: wrap(`<circle cx="16" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M16 3 v5 M16 24 v5 M3 16 h5 M24 16 h5 M7 7 l3.5 3.5 M21.5 21.5 l3.5 3.5 M25 7 l-3.5 3.5 M10.5 21.5 l-3.5 3.5" stroke="currentColor" stroke-width="3"/>`),
  GOLD: wrap(`<ellipse cx="16" cy="16" rx="10" ry="8" fill="${P.gold}" stroke="${P.goldDk}" stroke-width="2"/><ellipse cx="16" cy="14" rx="7" ry="5" fill="none" stroke="${P.goldDk}" stroke-width="1.5"/>`),
};
// ---- special (boss-tome) skills: the same tile in the skill's own colours, a motif for its effect and, small in the
// corner, the weapon it needs
const MOTIF: Record<string, string> = {
  moon: line("M20 5 a11 11 0 1 0 6 17 a8.5 8.5 0 1 1 -6 -17z", 4.5, 2.2, W),
  bolt: `<path d="M18 3 L9 17 H15 L12 29 L24 13 H17z" fill="${W}" stroke="${O}" stroke-width="1.6"/>`,
  flame: `<path d="M16 29 C8 27 7 19 12 13 C12 17 14 18 15 18 C13 12 16 6 20 3 C20 9 26 12 25 20 C24.5 26 20 29 16 29z" fill="${W}" stroke="${O}" stroke-width="1.6"/>`,
  snow: line("M16 4 v24 M5.6 10 l20.8 12 M5.6 22 l20.8 -12 M13 6 l3 3 3 -3 M13 26 l3 -3 3 3", 4.6, 2.2),
  spikes: `<path d="M3 27 L8 12 L12 27z M11 27 L17 5 L22 27z M20 27 L25 14 L29 27z" fill="${W}" stroke="${O}" stroke-width="1.5"/>`,
  swirl: line("M17 16 a2 2 0 1 0 -3 -1.5 a5 5 0 1 0 8 -3 a9 9 0 1 0 -14 7", 4.6, 2.2),
  cross: line("M7 7 L25 25 M25 7 L7 25", 6, 3.2),
  streak: line("M4 10 H22 M8 16 H28 M4 22 H22", 4.4, 2),
  star: spark(16, 16, 2.6),
  column: `${line("M11 29 V6 M21 29 V6", 4, 2)}${spark(16, 7, 1.4)}`,
  rain: line("M8 5 l-3 8 M16 4 l-3 9 M24 5 l-3 8 M10 16 l-3 9 M19 16 l-3 10", 4, 2),
  fan: line("M16 28 L6 6 M16 28 L16 4 M16 28 L26 6", 4.4, 2),
  leaf: `<path d="M5 27 C5 14 14 6 27 5 C26 18 18 27 5 27z" fill="${W}" stroke="${O}" stroke-width="1.6"/><path d="M6 26 L21 11" stroke="${O}" stroke-width="1.4"/>`,
  wave: line("M3 20 q4 -8 8 0 t8 0 t8 0 M3 12 q4 -6 8 0 t8 0 t8 0", 4.4, 2.2),
  sun: `<circle cx="16" cy="16" r="6.5" fill="${W}" stroke="${O}" stroke-width="1.6"/>${line("M16 2 v4 M16 26 v4 M2 16 h4 M26 16 h4 M6 6 l3 3 M23 23 l3 3 M26 6 l-3 3 M6 26 l3 -3", 3.6, 1.6)}`,
  cloud: `<path d="M7 22 a5 5 0 0 1 1 -10 a7 7 0 0 1 13 -2 a5.5 5.5 0 0 1 4 12z" fill="${W}" stroke="${O}" stroke-width="1.6"/><circle cx="12" cy="26" r="1.8" fill="${W}" stroke="${O}"/><circle cx="20" cy="27" r="1.4" fill="${W}" stroke="${O}"/>`,
  lance: `<path d="M26 6 L20 8 L8 24 L10 26 L24 12z" fill="${W}" stroke="${O}" stroke-width="1.6"/>`,
  comet: `${line("M6 26 L18 14 M4 20 L14 12 M12 28 L20 18", 3.6, 1.6)}${spark(22, 10, 1.7)}`,
  blade: `<path d="M16 29 L12 12 L16 3 L20 12z" fill="${W}" stroke="${O}" stroke-width="1.6"/>${line("M9 12 H23", 4, 2, "none", GOLD)}`,
  hole: `<circle cx="16" cy="16" r="6" fill="${O}" stroke="${W}" stroke-width="2"/>${line("M16 4 a12 12 0 0 1 12 12 M16 28 a12 12 0 0 1 -12 -12", 3.6, 1.6)}`,
  orb: `<circle cx="16" cy="16" r="8" fill="${W}" stroke="${O}" stroke-width="1.6"/>${spark(16, 16, 1.2)}`,
};
const STYLE_MOTIF: Record<string, string> = { fan: "moon", skyblade: "blade", "cone-spikes": "spikes", spin: "swirl", "thunder-cone": "bolt", "cone-ice": "snow", cross: "cross",
  dashline: "streak", pillar: "column", implode: "hole", rain: "rain", "rain-dark": "rain", "arrow-ice": "snow", "arrow-fire": "flame", "arrow-bolt": "bolt", "fan-arrows": "fan",
  beam: "column", "spikes-vine": "leaf", meteor: "comet", "arrow-wind": "swirl", hail: "snow", firepillar: "flame", chain: "bolt", quake: "spikes", bigwave: "wave",
  flare: "sun", cloud: "cloud", lance: "lance", comet: "comet" };
const staffMini = `${line("M7 29 L15 18", 3.6, 1.8, "none", "#d9a466")}<circle cx="16.5" cy="16.5" r="2.6" fill="#7fd0ff" stroke="${O}" stroke-width="1"/>`;
for (const [id, S] of Object.entries(SKILLS)) if (S.special && !ICONS[id]) {
  const mini = S.requires === "sword" ? sword(0.42, 1, 17) : S.requires === "bow" ? `<g transform="translate(1 17) scale(0.42)">${arrow()}</g>` : `<g transform="translate(1 14) scale(0.55)">${staffMini}</g>`;
  ICONS[id] = badge(id.toLowerCase(), S.color2 ?? "#ffffff", S.color ?? "#555555", `${MOTIF[STYLE_MOTIF[S.style ?? ""] ?? "star"]}${mini}`);
}
/** A skill without a drawing of its own still gets the skill tile (its emoji on the frame), never a bare emoji. */
const skillTile = (id: string, emoji: string) => ICONS[id] = badge(id.toLowerCase(), "#f2dca8", "#7a4a1c", `<text x="16" y="17" text-anchor="middle" dominant-baseline="central" font-size="16">${emoji}</text>`);
/** Usables drawn on the skill tile on purpose (asked for a framed icon): these win over the catalog item art. */
const FRAMED = new Set(["STAT_RESET"]);
/** Food and cooking ingredients (shared/cooking.ts) show their own emoji: the item painter would draw them as potions. */
const cookIcon = (id: string) => { const d = ITEMS[id]; return d && (d.food || d.type === "Ingredient") && d.icon ? `<span style="display:grid;place-items:center;width:100%;height:100%;font-size:min(26px,80%)">${d.icon}</span>` : undefined; };
export const icon = (id: string, fallback = "") => cookIcon(id) ?? (FRAMED.has(id) ? ICONS[id] : undefined) ?? itemIcon(id) ?? ICONS[id] ?? (fallback && id.startsWith("SKILL_") ? skillTile(id, fallback) : fallback ? `<span style="font-size:18px">${fallback}</span>` : "");
export const slotIcon = (slot: string) => ICONS["SLOT_" + slot] ?? "";
