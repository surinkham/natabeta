// Load the 3D game only when this browser can create a WebGL context.
// Static imports of main.ts would construct the renderer before an error could be shown.
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch { return false; }
}

function showStartError(message?: string) {
  if (message) {
    document.getElementById("webgl-error-title")!.textContent = "เริ่มเกมไม่สำเร็จ";
    document.getElementById("webgl-error-message")!.textContent = message;
  }
  document.getElementById("webgl-unavailable")!.hidden = false;
}

if (!supportsWebGL()) showStartError();
else import("./main").catch(error => {
  console.error("Unable to start Pawtale Kingdoms:", error);
  showStartError("โหลดเกมไม่สำเร็จ ลองโหลดหน้านี้อีกครั้ง หากยังพบปัญหา กรุณาแจ้งทีมงานผ่าน Discord");
});
