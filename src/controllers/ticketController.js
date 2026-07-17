const fs = require("node:fs");
const path = require("node:path");
const { db } = require("../config/database");
const { setFlash } = require("../utils/flash");
const {
  STATUS_LABELS,
  PRIORITY_LABELS,
  addHistory,
  formatDuration,
} = require("../services/ticketService");
const {
  notifyStaff,
  notifyTicketOwner,
} = require("../services/notificationService");

function isStaff(user) {
  return ["it", "admin"].includes(user.role);
}

function dashboard(req, res) {
  const staff = isStaff(req.session.user);
  const where = staff ? "" : "WHERE t.created_by = ?";
  const params = staff ? [] : [req.session.user.id];

  const tickets = db
    .prepare(
      `
    SELECT t.*, creator.full_name AS creator_name, assignee.full_name AS assignee_name
    FROM tickets t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    ${where}
    ORDER BY CASE t.status WHEN 'new' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'waiting' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
             t.updated_at DESC
    LIMIT 100
  `,
    )
    .all(...params);

  const stats = db
    .prepare(
      `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
      SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) AS waiting_count,
      SUM(CASE WHEN status IN ('done','closed') THEN 1 ELSE 0 END) AS completed_count
    FROM tickets t ${where}
  `,
    )
    .get(...params);

  res.render("tickets/dashboard", {
    tickets,
    stats,
    isStaff: staff,
    statusLabels: STATUS_LABELS,
    priorityLabels: PRIORITY_LABELS,
  });
}

function showCreate(req, res) {
  const staff = isStaff(req.session.user);
  const equipment = staff
    ? db
        .prepare(
          "SELECT id, name, asset_tag, type FROM equipment WHERE status != 'retired' ORDER BY name",
        )
        .all()
    : db
        .prepare(
          "SELECT id, name, asset_tag, type FROM equipment WHERE assigned_user_id = ? AND status != 'retired' ORDER BY name",
        )
        .all(req.session.user.id);
  res.render("tickets/create", { equipment });
}

function create(req, res) {
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const category = String(req.body.category || "Інше").trim();
  const priority = ["low", "normal", "high", "critical"].includes(
    req.body.priority,
  )
    ? req.body.priority
    : "normal";
  const equipmentId = req.body.equipmentId
    ? Number(req.body.equipmentId)
    : null;

  if (!title || !description) {
    for (const file of req.files || []) {
      fs.unlink(file.path, () => {});
    }
    setFlash(req, "error", "Заповніть тему та опис заявки.");
    return res.redirect("/tickets/new");
  }

  let ticketId;

  try {
    db.exec("BEGIN");

    const result = db
      .prepare(
        `
      INSERT INTO tickets (title, description, category, priority, created_by, equipment_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        title,
        description,
        category,
        priority,
        req.session.user.id,
        equipmentId,
      );

    ticketId = Number(result.lastInsertRowid);

    const insertAttachment = db.prepare(`
      INSERT INTO ticket_attachments
        (ticket_id, uploaded_by, original_name, stored_name, mime_type, size_bytes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const file of req.files || []) {
      insertAttachment.run(
        ticketId,
        req.session.user.id,
        file.originalname,
        file.filename,
        file.mimetype,
        file.size,
      );
    }

    addHistory(
      ticketId,
      req.session.user.id,
      "created",
      (req.files || []).length
        ? `Заявку створено. Додано зображень: ${(req.files || []).length}`
        : "Заявку створено",
    );

    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {
      /* transaction was not started */
    }
    for (const file of req.files || []) {
      fs.unlink(file.path, () => {});
    }
    console.error("Ticket creation error:", error);
    setFlash(req, "error", "Не вдалося створити заявку.");
    return res.redirect("/tickets/new");
  }

  notifyStaff({
    io: req.app.get("io"),
    excludeUserId: req.session.user.id,
    type: "new_ticket",
    title: `Нова заявка #${ticketId}`,
    message: title,
    link: `/tickets/${ticketId}`,
  });

  setFlash(req, "success", "Заявку створено.");
  res.redirect(`/tickets/${ticketId}`);
}

function show(req, res) {
  const ticketId = Number(req.params.id);
  const ticket = db
    .prepare(
      `
    SELECT t.*, creator.full_name AS creator_name, creator.department, creator.office,
           assignee.full_name AS assignee_name, e.name AS equipment_name, e.asset_tag AS equipment_asset_tag
    FROM tickets t
    LEFT JOIN users creator ON creator.id = t.created_by
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
    LEFT JOIN equipment e ON e.id = t.equipment_id
    WHERE t.id = ?
  `,
    )
    .get(ticketId);

  if (!ticket) return res.status(404).render("errors/404");
  if (!isStaff(req.session.user) && ticket.created_by !== req.session.user.id) {
    return res.status(403).render("errors/403");
  }

  const comments = db
    .prepare(
      `
    SELECT c.*, u.full_name AS author_name, u.role AS author_role
    FROM ticket_comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.ticket_id = ? ORDER BY c.created_at ASC, c.id ASC
  `,
    )
    .all(ticketId);

  const history = db
    .prepare(
      `
    SELECT h.*, u.full_name AS author_name
    FROM ticket_history h
    LEFT JOIN users u ON u.id = h.user_id
    WHERE h.ticket_id = ? ORDER BY h.created_at DESC, h.id DESC
  `,
    )
    .all(ticketId);

  const attachments = db
    .prepare(
      `
    SELECT id, original_name, stored_name, mime_type, size_bytes, created_at
    FROM ticket_attachments
    WHERE ticket_id = ?
    ORDER BY created_at ASC, id ASC
  `,
    )
    .all(ticketId);

  const staffUsers = db
    .prepare(
      `
    SELECT id, full_name, role FROM users
    WHERE role IN ('it','admin') AND is_active = 1
    ORDER BY full_name
  `,
    )
    .all();

  res.render("tickets/detail", {
    ticket,
    comments,
    history,
    attachments,
    staffUsers,
    isStaff: isStaff(req.session.user),
    statusLabels: STATUS_LABELS,
    priorityLabels: PRIORITY_LABELS,
    formatDuration,
  });
}

function addComment(req, res) {
  const ticketId = Number(req.params.id);
  const body = String(req.body.body || "").trim();
  const ticket = db
    .prepare(
      "SELECT id, created_by, first_response_at FROM tickets WHERE id = ?",
    )
    .get(ticketId);

  if (!ticket) return res.status(404).render("errors/404");
  if (!isStaff(req.session.user) && ticket.created_by !== req.session.user.id) {
    return res.status(403).render("errors/403");
  }
  if (!body) {
    setFlash(req, "error", "Коментар не може бути порожнім.");
    return res.redirect(`/tickets/${ticketId}`);
  }

  db.prepare(
    "INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)",
  ).run(ticketId, req.session.user.id, body);

  if (isStaff(req.session.user) && !ticket.first_response_at) {
    db.prepare(
      "UPDATE tickets SET first_response_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(ticketId);
  } else {
    db.prepare(
      "UPDATE tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    ).run(ticketId);
  }

  addHistory(ticketId, req.session.user.id, "comment", "Додано коментар");

  const io = req.app.get("io");

  if (isStaff(req.session.user)) {
    notifyTicketOwner({
      io,
      ticket,
      actorUserId: req.session.user.id,
      type: "ticket_comment",
      title: `Новий коментар у заявці #${ticketId}`,
      message: body,
    });
  } else {
    notifyStaff({
      io,
      excludeUserId: req.session.user.id,
      type: "ticket_comment",
      title: `Новий коментар у заявці #${ticketId}`,
      message: body,
      link: `/tickets/${ticketId}`,
    });
  }

  setFlash(req, "success", "Коментар додано.");
  res.redirect(`/tickets/${ticketId}`);
  setFlash(req, "success", "Коментар додано.");
  res.redirect(`/tickets/${ticketId}`);
}

function update(req, res) {
  const ticketId = Number(req.params.id);
  const ticket = db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId);
  if (!ticket) return res.status(404).render("errors/404");

  const allowedStatuses = ["new", "in_progress", "waiting", "done", "closed"];
  const status = allowedStatuses.includes(req.body.status)
    ? req.body.status
    : ticket.status;
  const assignedTo = req.body.assignedTo ? Number(req.body.assignedTo) : null;

  if (assignedTo) {
    const assignee = db
      .prepare(
        "SELECT id FROM users WHERE id = ? AND role IN ('it','admin') AND is_active = 1",
      )
      .get(assignedTo);
    if (!assignee) {
      setFlash(req, "error", "Вибраного виконавця не знайдено.");
      return res.redirect(`/tickets/${ticketId}`);
    }
  }

  const changes = [];
  if (ticket.status !== status)
    changes.push(
      `Статус: ${STATUS_LABELS[ticket.status]} → ${STATUS_LABELS[status]}`,
    );
  if ((ticket.assigned_to || null) !== assignedTo)
    changes.push("Змінено виконавця");

  const setFirstResponse = !ticket.first_response_at;
  const setWorkStarted = status === "in_progress" && !ticket.work_started_at;
  const setResolved = status === "done" && !ticket.resolved_at;
  const setClosed = status === "closed" && !ticket.closed_at;

  db.prepare(
    `
    UPDATE tickets SET
      status = ?,
      assigned_to = ?,
      first_response_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE first_response_at END,
      work_started_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE work_started_at END,
      resolved_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE resolved_at END,
      closed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE closed_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(
    status,
    assignedTo,
    Number(setFirstResponse),
    Number(setWorkStarted),
    Number(setResolved),
    Number(setClosed),
    ticketId,
  );

  if (changes.length)
    addHistory(ticketId, req.session.user.id, "updated", changes.join(". "));
  const statusChanged = ticket.status !== status;
  const assigneeChanged = (ticket.assigned_to || null) !== assignedTo;

  if (statusChanged) {
    notifyTicketOwner({
      io: req.app.get("io"),
      ticket,
      actorUserId: req.session.user.id,
      type: "ticket_status_changed",
      title: `Змінено статус заявки #${ticketId}`,
      message: `Новий статус: ${STATUS_LABELS[status]}`,
    });
  }

  if (assigneeChanged && !statusChanged) {
    notifyTicketOwner({
      io: req.app.get("io"),
      ticket,
      actorUserId: req.session.user.id,
      type: "ticket_assignee_changed",
      title: `Оновлено заявку #${ticketId}`,
      message: "Для вашої заявки змінено виконавця.",
    });
  }
  setFlash(
    req,
    "success",
    changes.length ? "Заявку оновлено." : "Змін не було.",
  );
  res.redirect(`/tickets/${ticketId}`);
}

module.exports = { dashboard, showCreate, create, show, addComment, update };
