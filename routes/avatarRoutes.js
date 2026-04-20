/**
 * avatarRoutes.js
 * Furl Life — Rutas del módulo Avatar Matching
 *
 * Registro en app.js:
 *   const avatarRoutes = require('./routes/avatarRoutes');
 *   app.use('/api/avatar', avatarRoutes);
 */

'use strict';

const express = require('express');
const multer  = require('multer');
const { matchAvatar } = require('../controllers/avatarMatchingController');

const router = express.Router();

// ── Configuración de multer ──────────────────────────────────────────────────
// memoryStorage: el buffer queda en req.file.buffer, sin escribir al disco.
// Ideal para OCI donde el almacenamiento en disco puede ser efímero.
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo
  fileFilter: (_req, file, cb) => {
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de archivo no soportado: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/avatar/match
 * Body: multipart/form-data
 *   - image: archivo de imagen de la mascota (jpeg, png, webp)
 */
router.post('/match', upload.single('image'), matchAvatar);

// ── Manejo de errores de multer ──────────────────────────────────────────────
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError || err.message?.includes('Tipo de archivo')) {
    return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
  }
  return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Error inesperado.' });
});

module.exports = router;
