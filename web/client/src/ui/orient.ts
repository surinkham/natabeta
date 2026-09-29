// Phones play landscape: the stick on the left, the attack ring on the right and the world wide across. Held upright,
// an in-game card asks to turn the phone; its button goes full screen and locks landscape where the browser allows it
// (Android Chrome — iOS Safari can do neither, the card then just asks). The installed app is landscape already
// (manifest.webmanifest). Landscape only: the card stays until the phone is turned.
export function setupOrientation() {
  if (!document.body.classList.contains("touch")) return;
  const box = document.createElement("div"); box.id = "rotate"; box.className = "hud";
  box.innerHTML = `<div><div class="rot-ico">📱↻</div><b>หมุนมือถือเป็นแนวนอน</b><small>เล่นแนวนอนเห็นโลกกว้างขึ้น ปุ่มไม่บังจอ</small>
    <div class="dead-acts"><button id="rot-go">เล่นแนวนอน (เต็มจอ)</button></div></div>`;
  document.body.appendChild(box);
  const portrait = matchMedia("(orientation: portrait)");
  const check = () => { box.hidden = !portrait.matches; };
  portrait.addEventListener("change", check); check();
  box.querySelector("#rot-go")!.addEventListener("click", async () => {
    try { await document.documentElement.requestFullscreen?.({ navigationUI: "hide" }); } catch {}
    try { await (screen.orientation as any)?.lock?.("landscape"); } catch {}
    check();
  });
}
