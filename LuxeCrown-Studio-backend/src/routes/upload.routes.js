const express = require('express');
const router  = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const {
  upload,
  uploadServiceImages,
  deleteServiceImage,
  uploadAvatar,
} = require('../services/upload.service');


router.post(
  '/service/:serviceId',
  authenticate,
  requireAdmin,
  upload.array('images', 5),
  uploadServiceImages
);


router.delete(
  '/service-image/:imageId',
  authenticate,
  requireAdmin,
  deleteServiceImage
);


router.post(
  '/avatar',
  authenticate,
  upload.single('avatar'),
  uploadAvatar
);

module.exports = router;
