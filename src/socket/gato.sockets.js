const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Match = require('../models/match.model');
const User = require('../models/user.model');

const rooms = new Map(); // code -> { code, players: [{socketId, userid, username}], board, currentTurn }

function makeCode(len = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for(let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)];
  return s;
}

function checkWin(board, playerMarker) {
  // playerMarker is 'P1' or 'P2'
  const b = board;
  for (let i=0;i<3;i++){
    if (b[i][0]===playerMarker && b[i][1]===playerMarker && b[i][2]===playerMarker) return true;
    if (b[0][i]===playerMarker && b[1][i]===playerMarker && b[2][i]===playerMarker) return true;
  }
  if (b[0][0]===playerMarker && b[1][1]===playerMarker && b[2][2]===playerMarker) return true;
  if (b[0][2]===playerMarker && b[1][1]===playerMarker && b[2][0]===playerMarker) return true;
  return false;
}

module.exports = function gatoSockets(io, socket) {
console.log('socket connected', socket.id, 'user', socket.user && socket.user.username);

    socket.on('createRoomGato', async ({ preferredCode }) => {
      let code = preferredCode ? preferredCode.toUpperCase() : makeCode();
      // avoid collisions
      while (rooms.has(code)) code = makeCode();
      const board = [[0,0,0],[0,0,0],[0,0,0]];
      const room = {
        code,
        players: [{ socketId: socket.id, userid: socket.user.userid, username: socket.user.username }],
        board,
        currentTurn: 'P1'
      };
      rooms.set(code, room);
      socket.join(code);
      
      // CAMBIO: roomCreated -> roomCreatedGato
      socket.emit('roomCreatedGato', { code });
      
      console.log('room created', code);
    });

  socket.on('joinRoomGato', async ({ code }) => {
    code = (code || '').toUpperCase();
    if (!rooms.has(code)) {
      
      // CAMBIO: errorMessage -> errorMessageGato
      return socket.emit('errorMessageGato', 'Sala no encontrada');
    }

    const room = rooms.get(code);

    for (const [otherCode, otherRoom] of rooms.entries()) {

      // Evitar borrar de la sala actual
      if (otherCode === code) continue;

      const idx = otherRoom.players.findIndex(p => p.userid === socket.user.userid);
      if (idx !== -1) {
        otherRoom.players.splice(idx, 1);
        socket.leave(otherCode);

        // CAMBIO: errorMessage -> errorMessageGato
        io.to(otherCode).emit('errorMessageGato', 'Oponente salió');
        console.log(`Usuario ${socket.user.username} salió automáticamente de sala ${otherCode}`);
      }
}
    if (room.players.length >= 2) {
      // CAMBIO: errorMessage -> errorMessageGato
      return socket.emit('errorMessageGato', 'Sala llena');
    }

    room.players.push({
      socketId: socket.id,
      userid: socket.user.userid,
      username: socket.user.username
    });

    socket.join(code);

      // Notify players
      // Notify host that opponent joined
      const host = room.players[0];
      const guest = room.players[1];

      // CAMBIO: playerInfo -> playerInfoGato
      // Send to Host (P1)
      io.to(host.socketId).emit("playerInfoGato", {
        self: { username: host.username, role: "P1" },
        opponent: { username: guest.username, role: "P2" }
      });

      // CAMBIO: playerInfo -> playerInfoGato
      // Send to Guest (P2)
      io.to(guest.socketId).emit("playerInfoGato", {
        self: { username: guest.username, role: "P2" },
        opponent: { username: host.username, role: "P1" }
      });

      // Guest officially joined
      socket.emit("roomJoinedGato", { code, role: "P2" });
      
      // CAMBIO: opponentJoined -> opponentJoinedGato (Este debe ir en el if para informar al host)
      // Agregado, el host necesita saber que alguien entró, debe estar dentro del bloque de joinRoomGato en el backend
      io.to(host.socketId).emit('opponentJoinedGato', { opponent: { username: guest.username } });

      // Start game automatically when we have 2 players
      if (room.players.length === 2) {
        room.currentTurn = 'P1';
        room.board = [[0,0,0],[0,0,0],[0,0,0]];
        // send startGame event with initial board and currentTurn
        io.to(code).emit('startGameGato', {
          code,
          board: room.board,
          currentTurn: room.currentTurn
        });
        console.log('start game', code);
      }
    });

    socket.on('playerMoveGato', async ({ code, row, col }) => {
      code = (code || '').toUpperCase();
      // CAMBIO: errorMessage -> errorMessageGato
      if (!rooms.has(code)) return socket.emit('errorMessageGato', 'Sala no existe');
      const room = rooms.get(code);
      // find player index
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      // CAMBIO: errorMessage -> errorMessageGato
      if (playerIndex === -1) return socket.emit('errorMessageGato', 'No estás en la sala');
      const playerMarker = playerIndex === 0 ? 'P1' : 'P2';
      // check turn
      // CAMBIO: errorMessage -> errorMessageGato
      if (room.currentTurn !== playerMarker) return socket.emit('errorMessageGato', 'No es tu turno');
      // validate coords
      // CAMBIO: errorMessage -> errorMessageGato
      if (row < 0 || row > 2 || col < 0 || col > 2) return socket.emit('errorMessageGato', 'Movimiento inválido');
      // CAMBIO: errorMessage -> errorMessageGato
      if (room.board[row][col] !== 0) return socket.emit('errorMessageGato', 'Casilla ocupada');

      // apply move
      room.board[row][col] = playerMarker;
      
      // check win
      const won = checkWin(room.board, playerMarker);
      const draw = room.board.flat().every(cell => cell !== 0);
      
      if (won || draw) {
        // build players info array by fetching from DB to avoid trusting client data
        const playersInfo = await Promise.all(room.players.map(async p => {
          const dbUser = await User.findOne({ userid: p.userid }).select('username userid email').lean();
          if (dbUser) return dbUser;
          // fallback minimal info
          return { username: p.username, userid: p.userid, email: null };
        }));
        console.log("playersInfo:")
        console.log(playersInfo)
        
        const winnerName = won ? room.players[playerIndex].userid : null;
        const loserName = won ? room.players.find((_,i) => i !== playerIndex).userid : null;
        console.log("winnerID:")
        console.log(winnerName)
        console.log("loserID:")
        console.log(loserName)

        // persist match

        try {
          await Match.create({
            winner: playersInfo.find((p)=>{p.userid == winnerName}) ,
            loser: playersInfo.find((p)=>{p.userid == loserName}),
            game: "Tic Tac Toe",
            date: new Date(),
            players: playersInfo
          });
        } catch (err) {
          console.error('Error saving match:', err);
        }

        // notify clients
        // CAMBIO: boardUpdate -> boardUpdateGato
        io.to(code).emit('boardUpdateGato', { board: room.board, currentTurn: room.currentTurn });
        
        // CAMBIO: gameOver -> gameOverGato
        io.to(code).emit('gameOverGato', {
          winner: playersInfo.find((p)=>{p.userid == winnerName}).username,
          loser: playersInfo.find((p)=>{p.userid == winnerName}).username,
          board: room.board
        });

        room.currentTurn = null; // Finalizada
        return;
      }

      // next turn
      room.currentTurn = (room.currentTurn === 'P1') ? 'P2' : 'P1';
      // CAMBIO: boardUpdate -> boardUpdateGato
      io.to(code).emit('boardUpdateGato', { board: room.board, currentTurn: room.currentTurn });
    });

    // CAMBIO: leaveRoom -> leaveRoomGato
    socket.on('leaveRoomGato', ({ code }) => {
      code = (code || '').toUpperCase();
      if (!rooms.has(code)) return;
      const room = rooms.get(code);
      // remove player
      room.players = room.players.filter(p => p.socketId !== socket.id);
      socket.leave(code);
      // inform other players
      // CAMBIO: errorMessage -> errorMessageGato
      io.to(code).emit('errorMessageGato', 'Oponente salió');
      // delete room if empty
      if (room.players.length === 0) rooms.delete(code);
      else rooms.set(code, room);
    });

    socket.on("restartGameGato", ({ code }) => {
      if (!rooms.has(code)) return;

      const room = rooms.get(code);

      // Solo el host (P1) puede reiniciar
      // CAMBIO: errorMessage -> errorMessageGato
      if (room.players[0].socketId !== socket.id) {
        return socket.emit("errorMessageGato", "Solo el host puede reiniciar la partida");
      }

      // Reiniciar tablero
      room.board = [[0,0,0],[0,0,0],[0,0,0]];
      room.currentTurn = "P1";

      io.to(code).emit("restartGameGato", {
        board: room.board,
        currentTurn: room.currentTurn
      });

      console.log(`Juego reiniciado en sala ${code}`);
    });

    socket.on('disconnect', () => {
      // find rooms where socket was present and remove
      for (const [code, room] of rooms.entries()) {
        const idx = room.players.findIndex(p => p.socketId === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          // CAMBIO: errorMessage -> errorMessageGato
          io.to(code).emit('errorMessageGato', 'Oponente desconectado');
          if (room.players.length === 0) rooms.delete(code);
          else rooms.set(code, room);
        }
      }
    });

};