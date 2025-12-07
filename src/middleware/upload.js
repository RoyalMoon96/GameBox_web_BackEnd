const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');

// Asegurar carpeta raíz
if (!fs.existsSync(uploadRoot)) {
    fs.mkdirSync(uploadRoot, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // El usuario viene del authMiddleware
        const userId = req.user?.userid;

        if (!userId) {
            return cb(new Error("No userId found in request. Did you forget authMiddleware?"));
        }

        // Ruta final: uploads/<userid>
        const userFolder = path.join(uploadRoot, userId);

        // Crear carpeta si no existe
        if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder, { recursive: true });
        } else {
            // Si la carpeta existe, borrar todos los archivos dentro
            try {
                const files = fs.readdirSync(userFolder);
                files.forEach(file => {
                    const filePath = path.join(userFolder, file);
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                    }
                });
            } catch (error) {
                console.error('Error al limpiar carpeta:', error);
            }
        }


        cb(null, userFolder);
    },

    filename: (req, file, cb) => {
        // Puedes cambiar esto si quieres renombrar la imagen
        cb(null, file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const validExtensions = ['jpg', 'jpeg', 'png'];
    const ext = file.originalname.split('.').pop().toLowerCase();

    cb(null, validExtensions.includes(ext));
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
