const http = require("node:http");
const { Server } = require("socket.io");
const {
  databaseEnvironment,
  initializeDatabase,
} = require("./config/database");
const { seedDevelopmentData } = require("./config/developmentSeed");
const authService = require("./modules/auth/authService");

initializeDatabase();

if (databaseEnvironment === "development") {
  seedDevelopmentData();
}

const {
  app,
  sessionMiddleware,
} = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const httpServer = http.createServer(app);

const io = new Server(httpServer);

io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const sessionUser = socket.request.session?.user;
  const user = sessionUser?.id
    ? authService.getSessionUser(sessionUser.id)
    : null;

  if (!user?.id || !user?.role || !user.is_active || user.must_change_password) {
    return next(new Error("Unauthorized"));
  }

  socket.user = {
    id: Number(user.id),
    role: user.role,
  };

  return next();
});

io.on("connection", (socket) => {
  const { id, role } = socket.user;

  socket.join(`user:${id}`);

  if (role === "admin" || role === "it") {
    socket.join(`role:${role}`);
    socket.join("staff");
  }

  console.log(
    `Socket connected: user=${id}, role=${role}, socket=${socket.id}`,
  );

  socket.on("disconnect", (reason) => {
    console.log(
      `Socket disconnected: user=${id}, reason=${reason}`,
    );
  });
});

app.set("io", io);

httpServer.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}`);
});
