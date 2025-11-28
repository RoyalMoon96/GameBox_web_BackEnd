// src/models/match.model.js
const mongoose = require('mongoose');

const PlayerInfoSchema = new mongoose.Schema({
  username: String,
  userid: String,
  email: String,
}, { _id: false });

const MatchSchema = new mongoose.Schema({
  winner:  { type: PlayerInfoSchema, default: null },
  loser:  { type: PlayerInfoSchema, default: null },
  game: { type: String, default: null },
  date: { type: Date, default: Date.now },
  players: { type: [PlayerInfoSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Match', MatchSchema);
