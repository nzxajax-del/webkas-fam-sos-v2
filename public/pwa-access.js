(() => {
  const isSecure = location.protocol === "https:" || location.hostname === "localhost";
  if ("serviceWorker" in navigator && isSecure) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}), { once: true });
  }

  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
  });

  const style = document.createElement("style");
  style.textContent = `
    #webkas-app-dialog{position:fixed;inset:0;z-index:1201;display:none;align-items:flex-end;justify-content:center;padding:16px;background:#0009}
    #webkas-app-dialog[data-open="true"]{display:flex}
    #webkas-app-card{width:min(100%,440px);padding:20px;border:1px solid #536744;border-radius:22px;background:#10150e;color:#f6f8f2;box-shadow:0 20px 70px #000a;font:15px/1.5 system-ui,sans-serif}
    #webkas-app-card h2{margin:0 0 6px;font-size:20px}
    #webkas-app-card p{margin:6px 0 14px;color:#cbd3c3}
    #webkas-app-card .webkas-app-action{display:flex;width:100%;justify-content:center;align-items:center;gap:8px;min-height:44px;margin-top:9px;padding:11px 14px;border:1px solid #c1f45a;border-radius:12px;background:#c1f45a;color:#10120e;font-weight:850;cursor:pointer;text-decoration:none}
    #webkas-app-card .webkas-app-secondary{background:#151b12;color:#f6f8f2;border-color:#46553a}
    #webkas-app-card .webkas-app-disabled{background:#20251d;border-color:#424a3c;color:#aab3a2;cursor:not-allowed}
    #webkas-app-close{float:right;border:0;background:transparent;color:#dce5d5;font-size:24px;cursor:pointer}
    #webkas-app-note{font-size:12px;color:#aab3a2!important}
    @media(min-width:700px){#webkas-app-dialog{align-items:center}}
  `;
  document.head.appendChild(style);

  const dialog = document.createElement("div");
  dialog.id = "webkas-app-dialog";
  dialog.setAttribute("role", "presentation");
  dialog.innerHTML = `<section id="webkas-app-card" role="dialog" aria-modal="true" aria-labelledby="webkas-app-title"><button id="webkas-app-close" type="button" aria-label="Tutup">×</button><h2 id="webkas-app-title">WEBKAS FAM SOS V2</h2><p>Pilih cara mengakses WEBKAS dari perangkat Android.</p><button id="webkas-pwa-install" class="webkas-app-action" type="button">Pasang WEBKAS di layar utama</button><p id="webkas-app-note">Jika tombol instal belum tersedia, buka menu Chrome (⋮), lalu pilih “Tambahkan ke layar utama” atau “Instal aplikasi”.</p><button id="webkas-apk-download" class="webkas-app-action webkas-app-disabled" type="button" disabled aria-disabled="true">APK Android — sedang disiapkan</button><p id="webkas-app-note">Unduhan APK akan diaktifkan setelah berkas resmi dibangun, diuji, dan diunggah. Jangan unduh APK dari sumber tidak resmi.</p><button id="webkas-app-close-secondary" class="webkas-app-action webkas-app-secondary" type="button">Kembali ke WEBKAS</button></section>`;
  document.body.appendChild(dialog);

  const open = () => { dialog.dataset.open = "true"; document.getElementById("webkas-pwa-install").focus(); };
  const close = () => { delete dialog.dataset.open; const trigger = document.getElementById("webkas-app-open"); if (trigger) trigger.focus(); };
  document.addEventListener("click", (event) => { if (event.target.closest("#webkas-app-open")) open(); });
  document.getElementById("webkas-app-close").addEventListener("click", close);
  document.getElementById("webkas-app-close-secondary").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && dialog.dataset.open === "true") close(); });
  document.getElementById("webkas-pwa-install").addEventListener("click", async () => {
    if (installPrompt) {
      installPrompt.prompt();
      try { await installPrompt.userChoice; } catch (_) {}
      installPrompt = null;
      return;
    }
    alert("Untuk memasang WEBKAS: buka menu Chrome (⋮), lalu pilih “Tambahkan ke layar utama” atau “Instal aplikasi” jika tersedia.");
  });
  window.addEventListener("appinstalled", () => {
    const button = document.getElementById("webkas-pwa-install");
    if (button) { button.textContent = "WEBKAS sudah terpasang"; button.disabled = true; }
  });
})();
