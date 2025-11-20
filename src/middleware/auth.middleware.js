const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;

  if (!token) return res.status(401).json({ message: 'token requerido' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      username: payload.username,
      userid: payload.userid,
      email: payload.email
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'token invalido' });
  }
}

function verifyToken(token) {
  if (!token) throw new Error('token requerido');
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { authMiddleware, verifyToken };
