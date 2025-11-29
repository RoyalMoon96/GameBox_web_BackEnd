const Match = require('../models/match.model');
const User = require('../models/user.model');

const rooms = new Map();

/* ----------------------------------------------------
      MAIN MODULE EXPORT
----------------------------------------------------- */
module.exports = function snakeSockets(io, socket) {

  function makeCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  console.log("Snake socket connected:", socket.id, socket.user.username);

  /* ----------------------------------------------------
          CREATE ROOM
  ----------------------------------------------------- */
  socket.on("createRoom", ({ preferredCode }) => {
    let code = preferredCode ? preferredCode.toUpperCase() : makeCode();
    while (rooms.has(code)) code = makeCode();

    const room = {
      code,
      running: false,
      players: [
        {
          socketId: socket.id,
          username: socket.user.username,
          userid: socket.user.userid,
          x: 50,
          y: 250,
          vx: 0,
          vy: -20,
          tail: [],
          alive: true,
          grow: 0,   // <-- necesario para controlar el crecimiento
        }
      ],
      food: spawnFood(true)
    };

    rooms.set(code, room);
    socket.join(code);
    socket.emit("roomCreated", { code });

    console.log("Room created:", code);
  });

  /* ----------------------------------------------------
          JOIN ROOM
  ----------------------------------------------------- */
  socket.on("joinRoom", ({ code }) => {
    code = code.toUpperCase().trim();

    if (!rooms.has(code))
      return socket.emit("errorMessage", "Sala no encontrada");

    const room = rooms.get(code);

    if (room.players.length >= 2)
      return socket.emit("errorMessage", "Sala llena");

    room.players.push({
      socketId: socket.id,
      username: socket.user.username,
      userid: socket.user.userid,
      x: 250,
      y: 250,
      vx: 0,
      vy: -20,
      tail: [],
      alive: true,
      grow: 0,
    });

    socket.join(code);
    socket.emit("roomJoined", { code });

    io.to(code).emit("opponentJoined", {
      opponent: { username: socket.user.username }
    });

    if (room.players.length === 2) {
      room.running = true;
      io.to(code).emit("startGame", {});
      startgame(io, room);
    }
  });

  /* ----------------------------------------------------
          PLAYER MOVE
  ----------------------------------------------------- */
  socket.on("moveSnake", ({ dir }) => {
    for (const room of rooms.values()) {
      const p = room.players.find(x => x.socketId === socket.id);
      if (!p) continue;

      if (dir === "up" && p.vy === 0) { p.vx = 0; p.vy = -20; }
      if (dir === "down" && p.vy === 0) { p.vx = 0; p.vy = 20; }
      if (dir === "left" && p.vx === 0) { p.vx = -20; p.vy = 0; }
      if (dir === "right" && p.vx === 0) { p.vx = 20; p.vy = 0; }
    }
  });
  /* ----------------------------------------------------
          RESET GAME (nuevo evento)
  ----------------------------------------------------- */
  socket.on("restartGame", ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;

    // reiniciar jugadores
    room.players.forEach((p, i) => {
      p.x = i === 0 ? 100 : 300;
      p.y = i === 0 ? 100 : 300;
      p.vx = i === 0 ? 20 : -20;
      p.vy = 0;
      p.tail = [];
      p.grow = 0;
      p.alive = true;
    });

    room.food = spawnFood(true);
    room.running = true;

    io.to(code).emit("gameRestarted", {});
    startgame(io, room);
  });
  /* ----------------------------------------------------
          HANDLE DISCONNECT
  ----------------------------------------------------- */
  socket.on("disconnect", () => {
    console.log("Snake user disconnected:", socket.id);

    for (const room of rooms.values()) {
      const p = room.players.find(x => x.socketId === socket.id);
      if (!p) continue;

      p.alive = false;
      room.running = false;

      io.to(room.code).emit("opponentDisconnected", {
        message: "Tu oponente se desconectó"
      });

      rooms.delete(room.code);
    }
  });
};

function startgame(io, room) {

  const GAME_TICK = 150; // velocidad real de snake (ya no 1200 que era muy lento)

  setInterval(() => {
    if (!room.running) return;

    for (const p of room.players) {
      if (!p.alive) continue;


      /* ----------------------------------------------------
                COMER / CRECER
      ----------------------------------------------------- */
      if (p.x === room.food.x && p.y === room.food.y) {
        p.grow += 1;        // <-- MARCAR CRECIMIENTO
        room.food = spawnFood(false);
      }
    /* ----------------------------------------------------
                SI DEBE CRECER → AGREGAR COLA
        ----------------------------------------------------- */
      if (p.grow > 0) {
        p.last = p.tail[p.tail.length - 1] || { x: p.x, y: p.y };
      }
      
      /* ----------------------------------------------------
                MOVER CABEZA
      ----------------------------------------------------- */
      p.x += p.vx;
      p.y += p.vy;
      /* ----------------------------------------------------
                ACTUALIZAR LA COLA
      ----------------------------------------------------- */

      if (p.tail.length > 0) {
        for (let i = p.tail.length - 1; i > 0; i--) {
          p.tail[i] = { ...p.tail[i - 1] };
        }
        p.tail[0] = { x: p.x - p.vx, y: p.y - p.vy };
      }

      /* ----------------------------------------------------
                REVISAR PAREDES
      ----------------------------------------------------- */
      if (p.x < 0 || p.x > 280 || p.y < 0 || p.y > 280) {
        p.alive = false;
      }

      /* ----------------------------------------------------
      COLISIÓN CON SU COLA
      ----------------------------------------------------- */
       for (const seg of p.tail) {
          if (p.x === seg.x && p.y === seg.y) {
              p.alive = false;
            }
        } 
       
        /* ----------------------------------------------------
        COLISIÓN CON COLA DEL OTRO
        ----------------------------------------------------- */
        const opponent = room.players.find(x => x !== p);
        if (opponent) {
            for (const seg of opponent.tail) {
                if (p.x === seg.x && p.y === seg.y) {
                    p.alive = false;
                }
            }
            if (p.x === opponent.x && p.y === opponent.y) {
                p.alive = false;
            }
        }
        /* ----------------------------------------------------
                  SI DEBE CRECER → AGREGAR COLA
        ----------------------------------------------------- */
        if (p.grow > 0) {
          p.tail.push({ x: p.last.x, y: p.last.y });
          p.grow--;
        }
    }

    /* ----------------------------------------------------
            GAME OVER
    ----------------------------------------------------- */
    const alivePlayers = room.players.filter(p => p.alive);
    if (alivePlayers.length <= 1) {
      io.to(room.code).emit("gameOver", {
        winner: alivePlayers.length === 1 ? alivePlayers[0].username : null
      });
      room.running = false;
      saveMatch(room , alivePlayers[0]? alivePlayers[0].userid : "Draw", room.players.filter(p => !p.alive)[0].userid)
    }

    /* ----------------------------------------------------
            EMITIR ESTADO
    ----------------------------------------------------- */
    io.to(room.code).emit("stateUpdate", {
      players: room.players,
      food: room.food
    });

  }, GAME_TICK);
}

function spawnFood(isFirst = false) {
  if (isFirst) {
    return { x: 150, y: 150 }; // centro (20 * 10)
  }

  return {
    x: Math.floor(Math.random() * 15) * 20,
    y: Math.floor(Math.random() * 15) * 20,
  };
}


async function saveMatch(room, winnerId, loserId){

    // build players info array by fetching from DB to avoid trusting client data
    playersInfo = await Promise.all(room.players.map(async p => {
    const dbUser = await User.findOne({ userid: p.userid }).select('username userid email').lean();
    if (dbUser) return dbUser;
    // fallback minimal info
    return { username: p.username, userid: p.userid, email: null };
    }));

    try {
    await Match.create({
        winner: winnerId=="Draw"? {username:"Draw", userid:"", email:""}: playersInfo.find((p)=>p.userid == winnerId) ,
        loser: winnerId=="Draw"? {username:"Draw", userid:"", email:""}: playersInfo.find((p)=>p.userid == loserId),
        game: "Snake",
        date: new Date(),
        players: playersInfo
    });
    } catch (err) {
    console.error('Error saving match:', err);
    }
    return;
    
}