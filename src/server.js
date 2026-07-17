const http = require("node:http");
const { Server } = require("socket.io");

const {
  app,
  sessionMiddleware,
} = require("./app");

const PORT = Number(process.env.PORT) || 3000;

const httpServer = http.createServer(app);

const io = new Server(httpServer);

io.engine.use(sessionMiddleware);

io.use((socket, next) => {
  const user = socket.request.session?.user;

  if (!user?.id || !user?.role) {
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