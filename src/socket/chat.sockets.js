module.exports = function chatSockets(io, socket) {

  // unirse a sala de chat
  socket.on("joinChatRoom", ({ room }) => {
    socket.join(room);
    console.log(`Socket ${socket.id} se unió a sala de chat ${room} como ${socket.user && socket.user.username}`);
    socket.emit("chatJoined", { room });
  });

  // salir de sala de chat
  socket.on("leaveChatRoom", ({ room }) => {
    socket.leave(room);
    console.log(`Socket ${socket.id} salió de sala de chat ${room}`);
    socket.emit("chatLeft", { room });
  });

  // mensajes
  socket.on("chatMessage", ({ room, msg }) => {
    if (!room) return;
    username = socket.user.username
    io.to(room).emit("chatMessage", {
      username,
      msg,
      time: Date.now(),
      room
    });
  });

};
