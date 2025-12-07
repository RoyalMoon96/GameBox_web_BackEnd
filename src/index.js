require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const path = require('path');
const User = require('./models/user.model');

const { connect } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const statsRoutes = require("./routes/statsRoutes");
const upload = require("./middleware/upload");
const { authMiddleware } = require("./middleware/auth.middleware");

const setupSockets = require('./socket/index');
const { uploadAvatar } = require('./controllers/uploadController');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/myapp';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use("/api", statsRoutes);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.post("/update-me", authMiddleware, upload.single("image"), uploadAvatar);



(async () => {
  await connect(MONGO_URI);

  const server = http.createServer(app);

  setupSockets(server, { corsOrigin: "*" });

  server.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
})();
