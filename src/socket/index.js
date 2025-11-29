const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// módulos por juego / funciones
const gatoSockets = require('./gato.sockets');
const chatSockets = require('./chat.sockets');
const conecta4Sockets = require('./conecta4.sockets');
const snakeSockets = require('./snake.sockets');

module.exports = function setupSockets(serverHttp, options = {}) {

  const io = new Server(serverHttp, {
    cors: { origin: options.corsOrigin || '*' }
  });

  // ---- AUTH ----
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing token'));

    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET);
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ---- ÚNICA conexión global ----
  io.on('connection', (socket) => {
    console.log("Usuario conectado:", socket.id);

    // registrar módulos
    chatSockets(io, socket);
    //games
    gatoSockets(io, socket);
    conecta4Sockets(io, socket)
    snakeSockets(io, socket)
    // otrosJuegosSockets(io, socket);

  });

  return io;
};
