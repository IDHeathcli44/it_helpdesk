// Невелика клієнтська логіка. Код навмисно не мініфікований.

document.querySelectorAll(".clickable-row[data-href]").forEach((row) => {
  row.addEventListener("click", (event) => {
    if (event.target.closest("a, button, input, select, textarea")) {
      return;
    }

    window.location.href = row.dataset.href;
  });
});

(() => {
  const button = document.getElementById("notificationButton");
  const panel = document.getElementById("notificationPanel");
  const list = document.getElementById("notificationList");
  const count = document.getElementById("notificationCount");
  const readButton = document.getElementById("markNotificationsRead");

  if (!button || !panel || !list || !count || !readButton) {
    return;
  }

  let previousUnread = 0;
  let notificationFeedInitialized = false;
  const knownNotificationIds = new Set();

  const PDA_SOUND_URL = "/sounds/pda/pda.mp3";
  const SOUND_SETTING_KEY = "helpdeskSoundEnabled";

  const soundButton = document.getElementById("enableNotificationSound");

  const pdaSound = new Audio(PDA_SOUND_URL);

  pdaSound.preload = "auto";
  pdaSound.volume = 0.8;

  let soundEnabled = localStorage.getItem(SOUND_SETTING_KEY) === "true";

  let audioReady = false;

  function updateSoundButton() {
    if (!soundButton) {
      return;
    }

    soundButton.textContent = soundEnabled
      ? "🔊 Звук увімкнено"
      : "🔇 Увімкнути звук";

    soundButton.classList.toggle("sound-enabled", soundEnabled);

    soundButton.title = soundEnabled
      ? "Вимкнути звукові сповіщення"
      : "Увімкнути звукові сповіщення";
  }

  async function prepareNotificationSound() {
    if (!soundEnabled) {
      return false;
    }

    if (audioReady) {
      return true;
    }

    try {
      pdaSound.pause();
      pdaSound.currentTime = 0;

      // Виклик відбувається під час дії користувача.
      pdaSound.volume = 0.001;

      await pdaSound.play();

      pdaSound.pause();
      pdaSound.currentTime = 0;
      pdaSound.volume = 0.8;

      audioReady = true;

      console.log("Звукові сповіщення підготовлені.");

      return true;
    } catch (error) {
      console.warn("Браузер поки не дозволив звук:", error);

      return false;
    }
  }

  async function playPdaSound() {
    if (!soundEnabled) {
      return;
    }

    try {
      pdaSound.pause();
      pdaSound.currentTime = 0;
      pdaSound.volume = 0.8;

      await pdaSound.play();

      audioReady = true;

      console.log("Звукове сповіщення відтворено.");
    } catch (error) {
      audioReady = false;

      // Не вимикаємо налаштування користувача.
      // Після наступного кліку браузер спробує
      // підготувати звук повторно.
      console.warn(
        "Не вдалося відтворити звук. " + "Клацніть по сторінці та повторіть.",
        error,
      );
    }
  }

  async function handleSoundPreparation() {
    if (soundEnabled && !audioReady) {
      await prepareNotificationSound();
    }
  }

  // Після кожного переходу або redirect перший клік
  // повторно готує аудіо, але не вимикає налаштування.
  document.addEventListener("pointerdown", handleSoundPreparation, true);

  document.addEventListener("keydown", handleSoundPreparation, true);

  if (soundButton) {
    soundButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      soundEnabled = !soundEnabled;
      audioReady = false;

      localStorage.setItem(SOUND_SETTING_KEY, String(soundEnabled));

      updateSoundButton();

      if (soundEnabled) {
        const prepared = await prepareNotificationSound();

        if (prepared) {
          // Перевірочний сигнал.
          await playPdaSound();
        }
      } else {
        pdaSound.pause();
        pdaSound.currentTime = 0;
      }
    });
  }

  updateSoundButton();
  function escapeHtml(value) {
    const div = document.createElement("div");

    div.textContent = value ?? "";

    return div.innerHTML;
  }

  function renderNotifications(data) {
    updateUnreadCount(data.unread);

    if (!Array.isArray(data.notifications)) {
      list.innerHTML =
        '<p class="notification-empty">Нових сповіщень немає.</p>';

      return;
    }

    list.innerHTML = data.notifications.length
      ? data.notifications
          .map(
            (item) => `
              <a
                class="notification-item ${item.is_read ? "" : "unread"}"
                href="${escapeHtml(item.link || "#")}"
                data-notification-id="${Number(item.id)}"
              >
                <strong>
                  ${escapeHtml(item.title)}
                </strong>

                <span>
                  ${escapeHtml(item.message)}
                </span>

                <small>
                  ${escapeHtml(item.created_at)}
                </small>
              </a>
            `,
          )
          .join("")
      : '<p class="notification-empty">Нових сповіщень немає.</p>';
  }

  function updateUnreadCount(unread) {
    const value = Math.max(0, Number(unread) || 0);
    count.textContent = String(value);
    count.hidden = value === 0;
  }

  async function loadNotifications(showDesktop = false) {
    try {
      const response = await fetch("/api/notifications", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn("Не вдалося завантажити сповіщення:", response.status);

        return;
      }

      const data = await response.json();
      const newNotifications = Array.isArray(data.notifications)
        ? data.notifications.filter((item) => !knownNotificationIds.has(Number(item.id)))
        : [];

      for (const item of data.notifications || []) {
        knownNotificationIds.add(Number(item.id));
      }

      renderNotifications(data);

      if (showDesktop && data.unread > previousUnread) {
        const newest = data.notifications?.[0];

        if (newest) {
          await playPdaSound();

          if (
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            new Notification(newest.title || "IT HelpDesk", {
              body: newest.message || "Нове сповіщення",
            });
          }
        }
      }

      previousUnread = data.unread || 0;
      if (
        showDesktop &&
        notificationFeedInitialized &&
        newNotifications.some((item) => pointsToCurrentTicket(item.link))
      ) {
        window.location.reload();
        return;
      }
      notificationFeedInitialized = true;
    } catch (error) {
      console.warn("Сервер сповіщень тимчасово недоступний.", error);
    }
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    panel.hidden = !panel.hidden;

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    await loadNotifications(false);
  });

  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  list.addEventListener("click", async (event) => {
    const notificationLink = event.target.closest(
      ".notification-item[data-notification-id]",
    );

    if (!notificationLink) {
      return;
    }

    event.preventDefault();
    const notificationId = Number(notificationLink.dataset.notificationId);
    const target = notificationLink.getAttribute("href") || "#";

    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      });
      const result = await response.json().catch(() => ({ ok: false }));

      if (!response.ok || !result.ok) {
        throw new Error("Notification was not updated.");
      }

      notificationLink.classList.remove("unread");
      updateUnreadCount(result.unread);
      previousUnread = Math.max(0, Number(result.unread) || 0);
    } catch (error) {
      console.warn("Помилка під час оновлення сповіщення.", error);
      await loadNotifications(false);

      return;
    }

    if (target !== "#") {
      window.location.assign(target);
    } else {
      await loadNotifications(false);
    }
  });

  readButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        console.warn("Не вдалося позначити сповіщення прочитаними.");

        return;
      }

      await loadNotifications(false);
    } catch (error) {
      console.warn("Помилка під час оновлення сповіщень.", error);
    }
  });

  document.addEventListener("click", (event) => {
    if (!panel.contains(event.target) && !button.contains(event.target)) {
      panel.hidden = true;
    }
  });

  loadNotifications(false);

  if (typeof io !== "function") {
    console.error("Socket.IO не завантажено. Перевірте footer.ejs.");
  } else {
    const socket = io({
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Socket.IO підключено:", socket.id);
    });

    socket.on("notification:new", async (notification) => {
      console.log("Отримано realtime-сповіщення:", notification);

      await loadNotifications(false);
      await playPdaSound();

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(notification.title || "IT HelpDesk", {
          body: notification.message || "Нове сповіщення",
        });
      }

      if (pointsToCurrentTicket(notification.link)) {
        window.location.reload();
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Помилка Socket.IO:", error.message);
    });

    socket.on("disconnect", (reason) => {
      console.warn("Socket.IO відключено:", reason);
    });
  }

  // Резервна перевірка, якщо WebSocket тимчасово недоступний.
  setInterval(() => {
    loadNotifications(true);
  }, 30000);

  function pointsToCurrentTicket(link) {
    if (!link || !/^\/tickets\/\d+$/.test(window.location.pathname)) {
      return false;
    }

    try {
      return new URL(link, window.location.origin).pathname === window.location.pathname;
    } catch {
      return false;
    }
  }
})();

// Показує назву вибраного файла інвентаризації.
(() => {
  const input = document.getElementById("inventoryFile");
  const fileName = document.getElementById("inventoryFileName");

  if (!input || !fileName) {
    return;
  }

  const picker = input.closest(".inventory-file-picker");

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    fileName.textContent = file
      ? `${file.name} · ${formatInventoryFileSize(file.size)}`
      : "XLSX, XLS або CSV · до 10 МБ";
    picker?.classList.toggle("has-file", Boolean(file));
  });

  function formatInventoryFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.ceil(bytes / 1024))} КБ`;
    }
    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }
})();

// Показує користувачеві назви зображень,
// вибраних для нової заявки.
(() => {
  const input = document.getElementById("screenshots");
  const output = document.getElementById("selected-files");
  const description = document.getElementById("ticketDescription");
  const pasteStatus = document.getElementById("pasteImageStatus");

  if (!input || !output) {
    return;
  }

  input.addEventListener("change", () => {
    renderSelectedFiles();
    showPasteStatus("");
  });

  document.addEventListener("paste", handleDescriptionPaste, true);

  function handleDescriptionPaste(event) {
    if (!description || event.target !== description) {
      return;
    }

    const clipboardImages = getClipboardImages(event.clipboardData);

    if (!clipboardImages.length) {
      return;
    }

    event.preventDefault();

    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/bmp",
    ]);
    const maxFileSize = 10 * 1024 * 1024;
    const existingFiles = Array.from(input.files || []);
    const availableSlots = Math.max(0, 5 - existingFiles.length);
    const rejected = [];
    const accepted = [];

    for (const file of clipboardImages) {
      if (!allowedTypes.has(file.type)) {
        rejected.push("Формат зображення з буфера не підтримується.");
      } else if (file.size > maxFileSize) {
        rejected.push("Зображення з буфера перевищує 10 МБ.");
      } else if (accepted.length >= availableSlots) {
        rejected.push("До заявки можна додати не більше 5 зображень.");
      } else {
        accepted.push(file);
      }
    }

    if (accepted.length && typeof DataTransfer === "function") {
      const transfer = new DataTransfer();
      for (const file of [...existingFiles, ...accepted]) {
        transfer.items.add(file);
      }
      input.files = transfer.files;
    } else if (accepted.length) {
      rejected.push("Цей браузер не дозволяє додавати файли з буфера обміну.");
      accepted.length = 0;
    }

    const message = accepted.length
      ? `Додано з буфера: ${accepted.length}.`
      : rejected[0] || "Не вдалося додати зображення з буфера.";
    renderSelectedFiles();
    showPasteStatus(message, accepted.length === 0 || rejected.length > 0);
  }

  function getClipboardImages(clipboardData) {
    if (!clipboardData) {
      return [];
    }

    const files = [];
    const seen = new Set();
    const addImage = (file) => {
      if (!file || !String(file.type || "").startsWith("image/")) {
        return;
      }
      const key = `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
      if (!seen.has(key)) {
        seen.add(key);
        files.push(file);
      }
    };

    for (const file of Array.from(clipboardData.files || [])) {
      addImage(file);
    }
    for (const item of Array.from(clipboardData.items || [])) {
      if (item.kind === "file") {
        addImage(item.getAsFile());
      }
    }
    return files;
  }

  function renderSelectedFiles() {
    const files = Array.from(input.files || []);

    if (!files.length) {
      output.innerHTML = "";

      return;
    }

    const fileList = files
      .map(
        (file) =>
          `<span>${escapeFileName(file.name)} · ${formatFileSize(
            file.size,
          )}</span>`,
      )
      .join("");
    output.innerHTML = fileList;
  }

  function showPasteStatus(message, warning = false) {
    if (!pasteStatus) {
      return;
    }
    pasteStatus.textContent = message;
    pasteStatus.classList.toggle("warning", warning);
    pasteStatus.hidden = !message;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
      return `${Math.ceil(bytes / 1024)} КБ`;
    }

    return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  }

  function escapeFileName(value) {
    const div = document.createElement("div");

    div.textContent = value;

    return div.innerHTML;
  }
})();
