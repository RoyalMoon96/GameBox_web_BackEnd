const mongoose = require('mongoose');

const StatSchema = new mongoose.Schema({
  winner: { type: String, required: true },
  date: { type: Date, default: Date.now },
  game: { type: String, required: true },
  details: { type: String, default: '' }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  userid: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  img: { type: String, default: '' },      // userImages/{username}/img.png
  google_id: { type: String, default: null },
  password: { type: String, default: null },  // bcrypt hashed
  stats: { type: [StatSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
