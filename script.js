document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.querySelector(".menu-btn");
  const nav = document.querySelector(".nav-links");

  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(isOpen));
      menuBtn.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
      menuBtn.textContent = isOpen ? "CLOSE" : "MENU";
    });
  }

  const form = document.querySelector("#contactForm");
  const note = document.querySelector("#formNote");

  if (form && note) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      note.textContent = "MESSAGE READY. CONNECT THIS FORM TO YOUR EMAIL SERVICE / BACKEND.";
      form.reset();
    });
  }

  const wallpaperGrid = document.querySelector("#wallpaperGrid");
  const wallpaperEmpty = document.querySelector("#wallpaperEmpty");

  const adminLogin = document.querySelector("#adminLogin");
  const adminTools = document.querySelector("#adminTools");
  const adminNote = document.querySelector("#adminNote");

  const renderWallpapers = (wallpapers, canDelete = false) => {
    if (!wallpaperGrid || !wallpaperEmpty) return;
    wallpaperGrid.querySelectorAll(".wallpaper-card").forEach(card => card.remove());
    wallpaperEmpty.hidden = wallpapers.length > 0;
    wallpapers.forEach((wallpaper) => {
      const card = document.createElement("article");
      card.className = "wallpaper-card";
      const image = document.createElement("img");
      image.src = wallpaper.url;
      image.alt = wallpaper.name;
      image.loading = "lazy";
      const meta = document.createElement("div");
      meta.className = "wallpaper-meta";
      const name = document.createElement("span");
      name.textContent = wallpaper.name;
      const download = document.createElement("a");
      download.className = "download-link";
      download.href = wallpaper.url;
      download.download = wallpaper.name;
      download.textContent = "DOWNLOAD";
      meta.append(name, download);
      if (canDelete) {
        const remove = document.createElement("button");
        remove.className = "delete-link";
        remove.type = "button";
        remove.textContent = "DELETE";
        remove.addEventListener("click", async () => {
          await fetch(`/api/wallpapers/${encodeURIComponent(wallpaper.id)}`, {method: "DELETE"});
          loadWallpapers(true);
        });
        meta.append(remove);
      }
      card.append(image, meta);
      wallpaperGrid.append(card);
    });
  };

  const loadWallpapers = async (canDelete = false) => {
    if (!wallpaperGrid || !wallpaperEmpty) return;
    try {
      const response = await fetch("/api/wallpapers");
      if (!response.ok) throw new Error("Unable to load wallpapers.");
      renderWallpapers(await response.json(), canDelete);
    } catch {
      wallpaperEmpty.hidden = false;
      wallpaperEmpty.textContent = "START THE SERVER TO LOAD WALLPAPERS.";
    }
  };

  if (wallpaperGrid && wallpaperEmpty) loadWallpapers();

  if (adminLogin && adminTools) {
    const setAdminState = (authenticated) => {
      adminTools.hidden = !authenticated;
      adminLogin.hidden = authenticated;
      if (authenticated) loadWallpapers(true);
    };

    fetch("/api/auth/me").then(response => setAdminState(response.ok)).catch(() => {});
    adminLogin.addEventListener("submit", async (event) => {
      event.preventDefault();
      adminNote.textContent = "SIGNING IN...";
      const response = await fetch("/api/auth/login", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(Object.fromEntries(new FormData(adminLogin)))});
      if (!response.ok) {
        adminNote.textContent = "INVALID ADMIN CREDENTIALS.";
        return;
      }
      adminNote.textContent = "";
      adminLogin.reset();
      setAdminState(true);
    });

    document.querySelector("#adminLogout")?.addEventListener("click", async () => {
      await fetch("/api/auth/logout", {method: "POST"});
      setAdminState(false);
    });

    document.querySelector("#wallpaperUpload")?.addEventListener("change", async (event) => {
      const files = [...event.target.files];
      for (const file of files) {
        const formData = new FormData();
        formData.append("wallpaper", file);
        const response = await fetch("/api/wallpapers", {method: "POST", body: formData});
        if (!response.ok) adminNote.textContent = "UPLOAD REJECTED. USE JPG, PNG OR WEBP UNDER 8 MB.";
      }
      event.target.value = "";
      loadWallpapers(true);
    });
  }

  const revealItems = document.querySelectorAll(".work-row,.service-item,.timeline-row");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = "1";
        entry.target.style.transform = "translateY(0)";
        observer.unobserve(entry.target);
      }
    });
  }, {threshold: 0.08});

  revealItems.forEach(item => {
    item.style.opacity = "0";
    item.style.transform = "translateY(18px)";
    item.style.transition = "opacity .6s ease, transform .6s ease";
    observer.observe(item);
  });
});

document.documentElement.classList.add("js-ready");
