// controllers/uploadController.js
const User = require('../models/user.model');
const path = require('path');

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file && !req.body.username ) {
      return res.status(400).json({ message: "No se recibio informacion" });
    }
    query={}
    if (req.file) {
      // Ruta pública del archivo
      avatarUrl = `${process.env.SERVER_URL}/uploads/${req.user.userid}/${req.file.filename}`;
      query["img"]=avatarUrl
    }
    if (req.body.username){
      query["username"]=req.body.username
    }
    // Actualizar en DB
    const dbUser = await User.findOneAndUpdate(
        { userid: req.user.userid },
        { $set: query },
        { new: true }
    )
      .select('-password -__v');
    console.log(dbUser)
    res.json(
        {
            "username": dbUser.username,
            "userid":  dbUser.userid,
            "email":  dbUser.email,
            "img":  dbUser.img,
        }
    ); // <--- DEVUELVES EL USER COMPLETO

    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error al subir imagen" });
  }
};
