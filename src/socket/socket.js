/* const { verifyToken } = require('../middleware/auth.middleware');

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
 */

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

module.exports = function setupSockets(serverHttp, options = {}) {
  const io = new Server(serverHttp, {
    cors: { origin: options.corsOrigin || '*' }
  });

  // auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Missing token'));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload; // expect { username, userid, email, iat, exp ... }
      return next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log('socket connected', socket.id, 'user', socket.user && socket.user.username);

    socket.on('createRoom', async ({ preferredCode }) => {
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
      socket.emit('roomCreated', { code });
      console.log('room created', code);
    });

  socket.on('joinRoom', async ({ code }) => {
    code = (code || '').toUpperCase();
    if (!rooms.has(code)) {
      return socket.emit('errorMessage', 'Sala no encontrada');
    }

    const room = rooms.get(code);

    if (room.players.some(p => p.userid === socket.user.userid)) {
      return socket.emit('errorMessage', 'Ya estás en esta sala');
    }

    if (room.players.length >= 2) {
      return socket.emit('errorMessage', 'Sala llena');
    }

    room.players.push({
      socketId: socket.id,
      userid: socket.user.userid,
      username: socket.user.username
    });

    socket.join(code);

      // Notify players
      const hostSocketId = room.players[0].socketId;
      io.to(hostSocketId).emit('opponentJoined', { opponent: { username: socket.user.username } });
      socket.emit('roomJoined', { code, role: 'P2' });

      // Start game automatically when we have 2 players
      if (room.players.length === 2) {
        room.currentTurn = 'P1';
        room.board = [[0,0,0],[0,0,0],[0,0,0]];
        // send startGame event with initial board and currentTurn
        io.to(code).emit('startGame', {
          code,
          board: room.board,
          currentTurn: room.currentTurn
        });
        console.log('start game', code);
      }
    });

    socket.on('playerMove', async ({ code, row, col }) => {
      code = (code || '').toUpperCase();
      if (!rooms.has(code)) return socket.emit('errorMessage', 'Sala no existe');
      const room = rooms.get(code);
      // find player index
      const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
      if (playerIndex === -1) return socket.emit('errorMessage', 'No estás en la sala');
      const playerMarker = playerIndex === 0 ? 'P1' : 'P2';
      // check turn
      if (room.currentTurn !== playerMarker) return socket.emit('errorMessage', 'No es tu turno');
      // validate coords
      if (row < 0 || row > 2 || col < 0 || col > 2) return socket.emit('errorMessage', 'Movimiento inválido');
      if (room.board[row][col] !== 0) return socket.emit('errorMessage', 'Casilla ocupada');

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

        const winnerName = won ? room.players[playerIndex].username : null;
        const loserName = won ? room.players.find((_,i) => i !== playerIndex).username : null;

        // persist match

        try {
          await Match.create({
            winner: winnerName,
            loser: loserName,
            date: new Date(),
            players: playersInfo
          });
        } catch (err) {
          console.error('Error saving match:', err);
        }

        // notify clients
        io.to(code).emit('boardUpdate', { board: room.board, currentTurn: room.currentTurn });
        io.to(code).emit('gameOver', {
          winner: winnerName,
          loser: loserName,
          board: room.board
        });

        // cleanup room
        rooms.delete(code);
        return;
      }

      // next turn
      room.currentTurn = (room.currentTurn === 'P1') ? 'P2' : 'P1';
      io.to(code).emit('boardUpdate', { board: room.board, currentTurn: room.currentTurn });
    });

    socket.on('leaveRoom', ({ code }) => {
      code = (code || '').toUpperCase();
      if (!rooms.has(code)) return;
      const room = rooms.get(code);
      // remove player
      room.players = room.players.filter(p => p.socketId !== socket.id);
      socket.leave(code);
      // inform other players
      io.to(code).emit('errorMessage', 'Oponente salió');
      // delete room if empty
      if (room.players.length === 0) rooms.delete(code);
      else rooms.set(code, room);
    });

    socket.on('disconnect', () => {
      // find rooms where socket was present and remove
      for (const [code, room] of rooms.entries()) {
        const idx = room.players.findIndex(p => p.socketId === socket.id);
        if (idx !== -1) {
          room.players.splice(idx, 1);
          io.to(code).emit('errorMessage', 'Oponente desconectado');
          if (room.players.length === 0) rooms.delete(code);
          else rooms.set(code, room);
        }
      }
    });

  });

  return io;
}
