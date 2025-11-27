const Match = require("../models/match.model");
const User   = require("../models/user.model");

const roomsC4 = new Map(); // code -> {...}

function makeCode(len = 4) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < len; i++)
    s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/* ============================================================
   LOGICA DE VICTORIA CONECTA 4
============================================================ */
function checkWinC4(board, r, c, marker) {
  const dirs = [
    [1, 0],   // vertical
    [0, 1],   // horizontal
    [1, 1],   // diagonal \
    [1, -1],  // diagonal /
  ];

  for (const [dr, dc] of dirs) {
    let count = 1;

    // adelante
    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr][cc] === marker) {
      count++; rr += dr; cc += dc;
    }

    // atrás
    rr = r - dr; cc = c - dc;
    while (rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[rr][cc] === marker) {
      count++; rr -= dr; cc -= dc;
    }

    if (count >= 4) return true;
  }

  return false;
}

module.exports = function conecta4Sockets(io, socket) {
  console.log("C4 socket connected", socket.id, socket.user.username);

  /* ============================================================
     CREAR SALA
  ============================================================ */
  socket.on("createRoomC4", ({ preferredCode }) => {
    let code = preferredCode ? preferredCode.toUpperCase() : makeCode();

    while (roomsC4.has(code)) code = makeCode();

    const board = Array.from({ length: 6 }, () => Array(7).fill(0));

    const room = {
      code,
      players: [
        {
          socketId: socket.id,
          userid: socket.user.userid,
          username: socket.user.username,
        },
      ],
      board,
      currentTurn: "P1",
    };

    roomsC4.set(code, room);

    socket.join(code);

    socket.emit("roomCreatedC4", { code });

    console.log("C4 room created", code);
  });

  /* ============================================================
     UNIRSE A SALA
  ============================================================ */
  socket.on("joinRoomC4", ({ code }) => {
    code = code.toUpperCase();

    if (!roomsC4.has(code)) {
      return socket.emit("errorMessageC4", "Sala no encontrada");
    }

    const room = roomsC4.get(code);

    if (room.players.length >= 2) {
      return socket.emit("errorMessageC4", "Sala llena");
    }

    // evitar estar en otra sala
    for (const [otherCode, otherRoom] of roomsC4.entries()) {
      if (otherCode === code) continue;

      const idx = otherRoom.players.findIndex(
        (p) => p.userid === socket.user.userid
      );

      if (idx !== -1) {
        otherRoom.players.splice(idx, 1);
        socket.leave(otherCode);
        io.to(otherCode).emit("errorMessageC4", "Oponente salió");
      }
    }

    const guest = {
      socketId: socket.id,
      userid: socket.user.userid,
      username: socket.user.username,
    };

    room.players.push(guest);
    socket.join(code);

    const host = room.players[0];

    // Notificar roles
    io.to(host.socketId).emit("playerInfoC4", {
      self: { username: host.username, role: "P1" },
      opponent: { username: guest.username, role: "P2" },
    });

    io.to(guest.socketId).emit("playerInfoC4", {
      self: { username: guest.username, role: "P2" },
      opponent: { username: host.username, role: "P1" },
    });

    console.log(`C4 ${guest.username} joined ${code}`);
    io.to(code).emit("roomJoinedC4", {
      code
    });

    // iniciar si hay dos
    if (room.players.length === 2) {
      io.to(code).emit("startGameC4", {
        code,
        board: room.board,
        currentTurn: room.currentTurn,
      });

      console.log("C4 start game", code);
    }
  });

  /* ============================================================
     MOVIMIENTO
  ============================================================ */
  socket.on("playerMoveC4", async ({ code, column }) => {
    if (!roomsC4.has(code)) return;
    const room = roomsC4.get(code);

    const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
    if (playerIndex === -1) return socket.emit("errorMessageC4", "No estás en la sala");

    const marker = playerIndex === 0 ? "P1" : "P2";

    if (room.currentTurn !== marker) {
      return socket.emit("errorMessageC4", "No es tu turno");
    }

    if (column < 0 || column > 6) {
      return socket.emit("errorMessageC4", "Columna inválida");
    }

    // colocar ficha
    let rowPlaced = -1;
    for (let r = 5; r >= 0; r--) {
      if (room.board[r][column] === 0) {
        room.board[r][column] = marker;
        rowPlaced = r;
        break;
      }
    }

    if (rowPlaced === -1) {
      return socket.emit("errorMessageC4", "Columna llena");
    }

    // victoria
    const won = checkWinC4(room.board, rowPlaced, column, marker);
    const draw = room.board.flat().every((c) => c !== 0);

    // actualizar tablero
    io.to(code).emit("boardUpdateC4", {
      board: room.board,
      row: rowPlaced,
      col: column,
      value: marker,
    });

    if (won || draw) {
      let winnerName = null;
      let loserName = null;

      if (won) {
        winnerName = room.players[playerIndex].username;
        loserName = room.players.find((_, i) => i !== playerIndex).username;
      }

      // mandar gameOver
      io.to(code).emit("gameOverC4", {
        winner: winnerName,
        loser: loserName,
        board: room.board,
      });

      room.currentTurn = null;
      return;
    }

    // siguiente turno
    room.currentTurn = room.currentTurn === "P1" ? "P2" : "P1";
  });

  /* ============================================================
     SALIR
  ============================================================ */
  socket.on("leaveRoomC4", ({ code }) => {
    if (!roomsC4.has(code)) return;

    const room = roomsC4.get(code);

    room.players = room.players.filter((p) => p.socketId !== socket.id);
    socket.leave(code);

    io.to(code).emit("errorMessageC4", "Oponente salió");

    if (room.players.length === 0) roomsC4.delete(code);
  });

  /* ============================================================
     REINICIAR PARTIDA (solo host)
  ============================================================ */
  socket.on("restartGameC4", ({ code }) => {
    if (!roomsC4.has(code)) return;

    const room = roomsC4.get(code);

    if (room.players[0].socketId !== socket.id) {
      return socket.emit("errorMessageC4", "Solo el host puede reiniciar");
    }

    room.board = Array.from({ length: 6 }, () => Array(7).fill(0));
    room.currentTurn = "P1";

    io.to(code).emit("restartGameC4", {
      board: room.board,
      currentTurn: room.currentTurn,
    });
  });

  /* ============================================================
     DESCONEXIÓN
  ============================================================ */
  socket.on("disconnect", () => {
    for (const [code, room] of roomsC4.entries()) {
      const idx = room.players.findIndex((p) => p.socketId === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit("errorMessageC4", "Oponente desconectado");

        if (room.players.length === 0) roomsC4.delete(code);
        else roomsC4.set(code, room);
      }
    }
  });
};
