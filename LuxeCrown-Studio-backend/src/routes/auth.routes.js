
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/register',       ctrl.register);
router.post('/login',          ctrl.login);
router.post('/google',         ctrl.googleAuth);
router.post('/refresh',        ctrl.refreshToken);
router.post('/logout',         ctrl.logout);
router.post('/forgot-password',ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);
router.get ('/me',  authenticate, ctrl.getMe);

module.exports = router;
