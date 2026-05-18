const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const { query }  = require('../config/db');
const { asyncHandler } = require('../middleware/error.middleware');

// ---- Configure Cloudinary ----
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ---- Multer: store files in memory (we stream directly to Cloudinary) ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 8 * 1024 * 1024 }, // 8MB max per file
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Only JPG, PNG and WebP images are allowed.'), false);
    }
    cb(null, true);
  },
});

// ---- Upload a buffer to Cloudinary ----
const uploadToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder:         'LuxeCrown-Studio/services',
        transformation: [
          { width: 800, height: 600, crop: 'fill', gravity: 'auto' },  // auto crop
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
        ...options,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    stream.end(buffer);
  });

// ---- Delete from Cloudinary ----
const deleteFromCloudinary = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('[Cloudinary] Delete error:', err.message);
  }
};

// ============================================================
// ROUTE HANDLER: POST /api/upload/service/:serviceId
// Admin uploads one or more images for a service
// ============================================================
const uploadServiceImages = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;

  // Verify service exists
  const svc = await query('SELECT id FROM services WHERE id = $1', [serviceId]);
  if (!svc.rows.length) {
    return res.status(404).json({ error: 'Service not found.' });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No image files provided.' });
  }

  // Check how many images this service already has
  const countRes = await query(
    'SELECT COUNT(*) FROM service_images WHERE service_id = $1',
    [serviceId]
  );
  const currentCount = parseInt(countRes.rows[0].count);
  const canAdd = 5 - currentCount;

  if (canAdd <= 0) {
    return res.status(400).json({ error: 'Maximum of 5 images per service. Delete some first.' });
  }

  const filesToProcess = req.files.slice(0, canAdd);
  const results = [];

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const cloudResult = await uploadToCloudinary(file.buffer, {
      public_id: `LuxeCrown-Studio/services/${serviceId}/${Date.now()}_${i}`,
    });

    await query(
      `INSERT INTO service_images (service_id, url, public_id, alt_text, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [serviceId, cloudResult.secure_url, cloudResult.public_id, file.originalname, currentCount + i]
    );

    results.push({ url: cloudResult.secure_url, public_id: cloudResult.public_id });
  }

  res.status(201).json({
    message: `${results.length} image(s) uploaded successfully.`,
    images:  results,
  });
});

// ============================================================
// ROUTE HANDLER: DELETE /api/upload/service-image/:imageId
// Admin deletes a specific service image
// ============================================================
const deleteServiceImage = asyncHandler(async (req, res) => {
  const { imageId } = req.params;

  const result = await query('SELECT * FROM service_images WHERE id = $1', [imageId]);
  if (!result.rows.length) {
    return res.status(404).json({ error: 'Image not found.' });
  }

  const img = result.rows[0];
  if (img.public_id) {
    await deleteFromCloudinary(img.public_id);
  }

  await query('DELETE FROM service_images WHERE id = $1', [imageId]);
  res.json({ message: 'Image deleted successfully.' });
});

// ============================================================
// ROUTE HANDLER: POST /api/upload/avatar
// User uploads a profile avatar
// ============================================================
const uploadAvatar = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });

  const cloudResult = await uploadToCloudinary(req.file.buffer, {
    folder:         'LuxeCrown-Studio/avatars',
    public_id:      `LuxeCrown-Studio/avatars/${req.user.id}`,
    transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
    overwrite:      true,
  });

  await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [cloudResult.secure_url, req.user.id]);

  res.json({ avatar_url: cloudResult.secure_url, message: 'Avatar updated.' });
});

module.exports = {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  uploadServiceImages,
  deleteServiceImage,
  uploadAvatar,
};
