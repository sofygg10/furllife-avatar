'use strict';

const express = require('express');
const path    = require('path');
require('dotenv').config();

const avatarRoutes = require('./routes/avatarRoutes');

const app  = express();
const PORT = process.env.PORT || 3000; // Cambiar puerto predeterminado a 3001 si no está definido en el entorno

app.use(express.json());

// Avatares locales (catálogo estático)
app.use('/static/avatars', express.static(path.join(__dirname, 'assets/avatars')));

// Avatares generados por Fireworks AI (FLUX.1 Kontext Pro) — creados en runtime
app.use('/static/avatars_generated', express.static(process.env.GENERATED_DIR || path.join(__dirname, 'assets/avatars_generated')));
// Rutas del módulo Avatar Matching
app.use('/api/avatar', avatarRoutes);

// Health check para OCI Load Balancer
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Furl Life API corriendo en puerto ${PORT}`);
});

module.exports = app;
