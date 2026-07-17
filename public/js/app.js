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

  if (soundButton) {
    soundButton.addEventListener("click", async (event) => {
      event.stopPropagation();

      const enabled = await unlockNotificationSound();

      if (enabled) {
        // Одразу програємо сигнал як перевірку.
        await playPdaSound();
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
    count.textContent = String(data.unread || 0);
    count.hidden = !data.unread;

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
    } catch (error) {
      console.warn("Сервер сповіщень тимчасово недоступний.", error);
    }
  }
  button.addEventListener("click", async () => {
    await unlockNotificationSound();

    panel.hidden = !panel.hidden;

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    await loadNotifications(false);
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
})();

// Показує користувачеві назви зображень,
// вибраних для нової заявки.
(() => {
  const input = document.getElementById("screenshots");
  const output = document.getElementById("selected-files");

  if (!input || !output) {
    return;
  }

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);

    if (!files.length) {
      output.textContent = "";

      return;
    }

    output.innerHTML = files
      .map(
        (file) =>
          `<span>${escapeFileName(file.name)} · ${formatFileSize(
            file.size,
          )}</span>`,
      )
      .join("");
  });

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
