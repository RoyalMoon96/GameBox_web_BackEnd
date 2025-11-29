const Match = require("../models/match.model");

exports.getStats = async (req, res) => {
  try {
    const userid = req.user.userid; // viene del middleware auth

    // Buscar solo juegos donde el usuario participó
    const matches = await Match.find({
      "players.userid": userid
    }).sort({ createdAt: -1 });

    const formatted = matches.map(m => ({
      winner: m.winner?.username,
      date: m.date,
      game: m.game || "unknown",
      details: `Players: ${m.players.map(p => p.username).join(", ")}`
    }));
    const formatted_wins = matches.map(m => ({winner_id: m.winner?.userid}));
    const player_wins= formatted_wins.filter((m)=>m.winner_id==req.user.userid).length || 0
    res.json({
      ok: true,
      stats: formatted,
      wins: player_wins
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
};