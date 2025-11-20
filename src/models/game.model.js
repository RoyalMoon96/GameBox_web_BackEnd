const mongoose = require('mongoose');

const GameSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  img_url: { type: String, default: '' },
  categorys: { type: [String], default: [] },
  description: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Game', GameSchema);
