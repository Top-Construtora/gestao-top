const { Server } = require("socket.io");

let io;
const userSockets = new Map();

function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:4200",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    socket.on('register', (userId) => {
        userSockets.set(userId, socket.id);
    });

    socket.on("disconnect", () => {
      for (let [userId, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(userId);
          break;
        }
      }
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.io não foi inicializado!");
  }
  return io;
}

function getSocketIdByUser(userId) {
    return userSockets.get(userId);
}

module.exports = {
  init,
  getIO,
  getSocketIdByUser
};