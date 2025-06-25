require('dotenv').config(); // Untuk memuat variabel lingkungan dari .env
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors'); // Mengizinkan permintaan dari domain Nuxt.js Anda

const app = express();
const port = process.env.PORT || 3001; // Gunakan port dari env, fallback ke 3001

// Konfigurasi koneksi database PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Middleware
app.use(cors()); // Izinkan semua permintaan CORS. Di produksi, batasi domain yang spesifik.
app.use(express.json()); // Mengizinkan server menerima JSON di body permintaan

// --- API Routes untuk Halaman ---

// GET semua halaman
app.get('/api/pages', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pages ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pages:', err);
    res.status(500).json({ message: 'Gagal mengambil halaman.' });
  }
});

// GET halaman berdasarkan ID atau Slug
app.get('/api/pages/:idOrSlug', async (req, res) => {
  const { idOrSlug } = req.params; // idOrSlug ini akan selalu berupa string dari URL
  let query;
  let values;

  // Coba konversi idOrSlug ke integer.
  // Jika berhasil (bukan NaN), berarti itu ID numerik.
  // Jika gagal (NaN), berarti itu adalah slug string.
  const numericId = parseInt(idOrSlug);

  if (!isNaN(numericId)) {
    // Jika parameter adalah angka, cari berdasarkan kolom 'id'
    query = `SELECT * FROM pages WHERE id = $1`;
    values = [numericId];
  } else {
    // Jika parameter bukan angka, cari berdasarkan kolom 'slug'
    query = `SELECT * FROM pages WHERE slug = $1`;
    values = [idOrSlug]; // idOrSlug sudah berupa string
  }

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      // Jika tidak ditemukan berdasarkan ID atau slug yang diberikan
      return res.status(404).json({ message: 'Halaman tidak ditemukan.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching page by ID/Slug:', err);
    // Tambahkan penanganan spesifik jika error bukan 404
    res.status(500).json({ message: 'Gagal mengambil halaman.' });
  }
});

// PUT (Update) halaman berdasarkan ID
app.put('/api/pages/:id', async (req, res) => {
  const { id } = req.params; // ID dari URL parameter, ini adalah string
  // Penting: Pastikan 'id' yang diterima dari req.params adalah integer untuk perbandingan di WHERE clause
  const numericId = parseInt(id); 

  // Validasi dasar untuk ID
  if (isNaN(numericId)) {
      return res.status(400).json({ message: 'ID halaman tidak valid.' });
  }

  const {
    title, slug, hero_title, hero_video_url, hero_image_url,
    homepage_about_section_text, homepage_services_section_text,
    vision_title, vision_body, mission_title, mission_body, excellence_title,
    gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
    contact_location_title, contact_location_body, contact_email_title,
    contact_email_address, contact_whatsapp_number, main_intro_body,
    service_1_title, service_1_body, service_2_title, service_2_body,
    service_3_title, service_3_body, faq_main_title, body
  } = req.body;

  try {
    const updateQuery = `
      UPDATE pages
      SET
        title = $1, slug = $2, hero_title = $3, hero_video_url = $4, hero_image_url = $5,
        homepage_about_section_text = $6, homepage_services_section_text = $7,
        vision_title = $8, vision_body = $9, mission_title = $10, mission_body = $11,
        excellence_title = $12, gallery_intro_body = $13, contact_overlay_text = $14,
        contact_title = $15, contact_phone = $16, contact_location_title = $17,
        contact_location_body = $18, contact_email_title = $19, contact_email_address = $20,
        contact_whatsapp_number = $21, main_intro_body = $22,
        service_1_title = $23, service_1_body = $24, service_2_title = $25, service_2_body = $26,
        service_3_title = $27, service_3_body = $28, faq_main_title = $29, body = $30,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $31 -- Perhatikan: $31 ini akan menerima nilai 'id' yang sudah di-parse ke integer
      RETURNING *;
    `;
    const values = [
      title, slug, hero_title, hero_video_url, hero_image_url,
      homepage_about_section_text, homepage_services_section_text,
      vision_title, vision_body, mission_title, mission_body, excellence_title,
      gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
      contact_location_title, contact_location_body, contact_email_title,
      contact_email_address, contact_whatsapp_number, main_intro_body,
      service_1_title, service_1_body, service_2_title, service_2_body,
      service_3_title, service_3_body, faq_main_title, body,
      numericId // Gunakan numericId yang sudah di-parse di sini
    ];

    const result = await pool.query(updateQuery, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Halaman tidak ditemukan.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating page:', err);
    // Tambahkan penanganan error validasi slug unik
    if (err.code === '23505' && err.constraint === 'pages_slug_key') {
      return res.status(422).json({ message: 'Slug sudah digunakan.', errors: { slug: ['Slug ini sudah ada.'] } });
    }
    res.status(500).json({ message: 'Gagal menyimpan perubahan halaman.' });
  }
});

// POST (Create) halaman baru
app.post('/api/pages', async (req, res) => {
  // Semua kolom yang dapat diisi saat membuat halaman baru
  const { 
    title, slug, hero_title, hero_video_url, hero_image_url,
    homepage_about_section_text, homepage_services_section_text,
    vision_title, vision_body, mission_title, mission_body, excellence_title,
    gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
    contact_location_title, contact_location_body, contact_email_title,
    contact_email_address, contact_whatsapp_number, main_intro_body,
    service_1_title, service_1_body, service_2_title, service_2_body,
    service_3_title, service_3_body, faq_main_title, body 
  } = req.body;

  try {
    // Lakukan validasi dasar di sini
    if (!title || !slug) {
        return res.status(400).json({ message: 'Judul dan Slug wajib diisi.' });
    }

    const insertQuery = `
      INSERT INTO pages (
        title, slug, hero_title, hero_video_url, hero_image_url,
        homepage_about_section_text, homepage_services_section_text,
        vision_title, vision_body, mission_title, mission_body, excellence_title,
        gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
        contact_location_title, contact_location_body, contact_email_title,
        contact_email_address, contact_whatsapp_number, main_intro_body,
        service_1_title, service_1_body, service_2_title, service_2_body,
        service_3_title, service_3_body, faq_main_title, body,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `; 

    const insertValues = [
      title, slug, hero_title, hero_video_url, hero_image_url,
      homepage_about_section_text, homepage_services_section_text,
      vision_title, vision_body, mission_title, mission_body, excellence_title,
      gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
      contact_location_title, contact_location_body, contact_email_title,
      contact_email_address, contact_whatsapp_number, main_intro_body,
      service_1_title, service_1_body, service_2_title, service_2_body,
      service_3_title, service_3_body, faq_main_title, body
    ];

    const result = await pool.query(insertQuery, insertValues);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating page:', err);
    if (err.code === '23505' && err.constraint === 'pages_slug_key') {
      return res.status(422).json({ message: 'Slug sudah digunakan.', errors: { slug: ['Slug ini sudah ada.'] } });
    }
    res.status(500).json({ message: 'Gagal membuat halaman baru.' });
  }
});


// DELETE halaman
app.delete('/api/pages/:id', async (req, res) => {
  const { id } = req.params;
  const numericId = parseInt(id); 

  if (isNaN(numericId)) {
      return res.status(400).json({ message: 'ID halaman tidak valid.' });
  }

  try {
    const result = await pool.query('DELETE FROM pages WHERE id = $1 RETURNING *', [numericId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Halaman tidak ditemukan.' });
    }
    res.json({ message: 'Halaman berhasil dihapus.' });
  } catch (err) {
    console.error('Error deleting page:', err);
    res.status(500).json({ message: 'Gagal menghapus halaman.' });
  }
});


// Start server
app.listen(port, () => {
  console.log(`Backend API berjalan di http://localhost:${port}`);
});
