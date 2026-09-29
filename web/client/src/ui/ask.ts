// In-game questions and notices (house rule: never the browser's confirm()/alert() — they break the game's look and
// block the page). One box in index.html (#ask), styled like the death screen.
const $ = (id: string) => document.getElementById(id)!;
/** Ask a yes/no question over the play field; resolves true for `yes`. With `no` empty it is a notice with one button. */
export function ask(q: string, note = "", yes = "ตกลง", no = "ยกเลิก") {
  const box = $("ask");
  $("ask-q").textContent = q; $("ask-note").textContent = note; $("ask-yes").textContent = yes; $("ask-no").textContent = no; $("ask-no").hidden = !no; box.hidden = false;
  return new Promise<boolean>(done => {
    const pick = (v: boolean) => () => { box.hidden = true; $("ask-yes").onclick = $("ask-no").onclick = null; done(v); };
    $("ask-yes").onclick = pick(true); $("ask-no").onclick = pick(false);
  });
}
/** A notice with a single OK button (the in-game alert()). */
export const tell = (q: string, note = "", ok = "ตกลง") => ask(q, note, ok, "").then(() => undefined);
/** Ask how many (1..max) with a slider and a number box in the same in-game box; resolves 0 when cancelled.
 *  `note(n)` is the line under them (e.g. the gold for n). */
export async function askCount(q: string, max: number, note: (n: number) => string, yes = "ตกลง") {
  const done = ask(q, "", yes), box = $("ask-note");
  box.innerHTML = `<span class="ask-count"><input type="range" min="1" max="${max}" value="${max}"><input type="number" min="1" max="${max}" value="${max}"></span><span class="ask-count-note"></span>`;
  const [range, num] = box.querySelectorAll("input"), line = box.querySelector<HTMLElement>(".ask-count-note")!;
  const set = (v: number) => { const n = Math.min(max, Math.max(1, Math.round(v) || 1)); range.value = num.value = String(n); line.textContent = note(n); return n; };
  range.oninput = () => set(+range.value); num.oninput = () => { if (num.value !== "") set(+num.value); }; set(max);
  return (await done) ? set(+num.value) : 0;
}
