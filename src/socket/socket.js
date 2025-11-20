const { verifyToken } = require('../middleware/auth.middleware');

module.exports = function setupSocket(io, usersMap) {

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token;

      if (!token) {
        return next(new Error('auth error: token requerido'));
      }

      const payload = verifyToken(token);
      socket.user = {
        username: payload.username,
        userid: payload.userid,
        email: payload.email
      };

      next();
    } catch (err) {
      console.log('Socket auth error:', err.message);
      return next(new Error('auth error'));
    }
  });

  io.on('connection', (socket) => {
    const username = socket.user.username;
    console.log('Cliente conectado:', socket.id, username);

    usersMap[socket.id] = username;
    socket.broadcast.emit('user_connected', username);

    socket.on('message', (data) => {
      io.emit('message', data);
    });

    socket.on('disconnect', () => {
      const uname = usersMap[socket.id];
      if (uname) {
        socket.broadcast.emit('user_disconnected', uname);
        delete usersMap[socket.id];
      }
      console.log('Cliente desconectado:', socket.id, uname);
    });
  });
};
