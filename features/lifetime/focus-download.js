"use strict";

(() => {
  const link = document.getElementById("focus-download");
  const status = document.getElementById("focus-download-status");
  const partSizes = [20971520, 20971520, 17818086];
  let loading = false;

  link.addEventListener("click", async event => {
    if (link.download) return;
    event.preventDefault();
    if (loading) return;
    loading = true;
    status.textContent = "다운로드 준비 중…";
    try {
      const parts = await Promise.all(partSizes.map(async (expectedSize, index) => {
        const response = await fetch("focus-0.15.15-part-" + (index + 1) + ".bin");
        if (!response.ok) throw new Error("Download failed");
        const part = await response.blob();
        if (part.size !== expectedSize) throw new Error("Incomplete download");
        return part;
      }));
      const apk = new Blob(parts, {type: "application/vnd.android.package-archive"});
      link.href = URL.createObjectURL(apk);
      link.download = "OjjudaFocus-Studio-0.15.15.apk";
      status.textContent = "APK 다운로드";
      link.click();
    } catch {
      status.textContent = "다시 다운로드";
    } finally {
      loading = false;
    }
  });
})();
