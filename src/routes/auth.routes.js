const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.post('/google', authCtrl.googleLogin);
router.get('/me', authMiddleware, authCtrl.me);

module.exports = router;
