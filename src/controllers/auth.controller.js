const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/user.model');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

exports.register = async (req, res) => {
  try {
    const { username, password, google_id, email } = req.body;

    if (!username || !email)
      return res.status(400).json({ message: 'username y email son requeridos' });

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser)
      return res.status(409).json({ message: 'username o email ya existen' });

    let hashedPassword = null;

    if (!google_id) {
      if (!password)
        return res.status(400).json({ message: 'password requerido' });

      hashedPassword = await bcrypt.hash(password, 10);
    }

    const userid = uuidv4();
    const imgPath = `userImages/${username}/img.png`;

    const user = new User({
      username,
      userid,
      email,
      img: imgPath,
      google_id: google_id || null,
      password: hashedPassword
    });

    await user.save();

    const token = signToken({
      username: user.username,
      userid: user.userid,
      email: user.email
    });

    return res.json({
      token,
      user: {
        username: user.username,
        userid: user.userid,
        email: user.email,
        img: user.img
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'error interno' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, google_id } = req.body;

    if (!email)
      return res.status(400).json({ message: 'email requerido' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'usuario no encontrado' });

    if (google_id) {
      if (user.google_id !== google_id)
        return res.status(401).json({ message: 'google_id inválido' });

    } else {
      if (!user.password)
        return res.status(401).json({ message: 'usuario registrado con Google' });

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) return res.status(401).json({ message: 'password incorrecto' });
    }

    const token = signToken({
      username: user.username,
      userid: user.userid,
      email: user.email
    });

    return res.json({
      token,
      user: {
        username: user.username,
        userid: user.userid,
        email: user.email,
        img: user.img
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'error interno' });
  }
};

exports.me = async (req, res) => {
  const { user } = req; 
  const dbUser = await User.findOne({ userid: user.userid }).select('-password -__v');
  res.json(dbUser);
};

//============
// GOOGLE AUTH
//============

const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential)
      return res.status(400).json({ message: 'Token de Google faltante' });

    // Validar token con Google
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    const { email, sub: googleId, name, picture } = payload;

    if (!email)
      return res.status(400).json({ message: 'Google no proporcionó email' });

    // Buscar usuario existente
    let user = await User.findOne({ email });

    // Si no existe, crearlo
    if (!user) {
      user = new User({
        username: name.replace(/ /g, '_') + "_" + Date.now(),
        userid: uuidv4(),
        email,
        img: picture || '',
        google_id: googleId,
        password: null
      });

      await user.save();
    }

    // Si existe pero no tiene google_id, lo agregamos (opcional)
    if (!user.google_id) {
      user.google_id = googleId;
      await user.save();
    }

    // Firmar token igual que en login/register
    const token = signToken({
      username: user.username,
      userid: user.userid,
      email: user.email
    });

    return res.json({
      token,
      user: {
        username: user.username,
        userid: user.userid,
        email: user.email,
        img: user.img
      }
    });

  } catch (err) {
    console.error("Google Login Error:", err);
    res.status(401).json({ message: 'Token inválido de Google' });
  }
};
