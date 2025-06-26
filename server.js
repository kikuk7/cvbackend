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

// Middleware CORS yang dikonfigurasi secara spesifik
// PENTING: Ganti 'https://your-vercel-app.vercel.app' dengan URL publik Vercel Anda yang sebenarnya
const allowedOrigins = [
  'http://localhost:3000', // Untuk pengembangan lokal
  'https://cvalams-rizqis-projects-607b9812.vercel.app/' // GANTI INI DENGAN URL PUBLIK VERCEL ANDA!
];

app.use(cors({
  origin: function (origin, callback) {
    // Izinkan permintaan tanpa origin (misalnya permintaan dari Postman/curl)
    // Atau jika origin ada dalam daftar yang diizinkan
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Izinkan metode HTTP yang Anda gunakan
  allowedHeaders: ['Content-Type', 'Authorization'], // Izinkan header yang digunakan
  credentials: true // Jika Anda menggunakan cookies atau session (saat ini tidak, tapi bagus untuk masa depan)
}));

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
  const { idOrSlug } = req.params; 
  let query;
  let values;

  const numericId = parseInt(idOrSlug);

  if (!isNaN(numericId)) {
    query = `SELECT * FROM pages WHERE id = $1`;
    values = [numericId];
  } else {
    query = `SELECT * FROM pages WHERE slug = $1`;
    values = [idOrSlug];
  }

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Halaman tidak ditemukan.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching page by ID/Slug:', err);
    res.status(500).json({ message: 'Gagal mengambil halaman.' });
  }
});

// PUT (Update) halaman berdasarkan ID
app.put('/api/pages/:id', async (req, res) => {
  const { id } = req.params; 
  const numericId = parseInt(id); 

  if (isNaN(numericId)) {
      return res.status(400).json({ message: 'ID halaman tidak valid.' });
  }

  // Dapatkan semua kolom yang relevan dari body permintaan
  const {
    title, slug, hero_title, hero_video_url, hero_image_url,
    homepage_about_section_text, homepage_services_section_text,
    vision_title, vision_body, mission_title, mission_body, excellence_title,
    gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
    contact_location_title, contact_location_body, contact_email_title,
    contact_email_address, contact_whatsapp_number, main_intro_body,
    service_1_title, service_1_body, service_2_title, service_2_body,
    service_3_title, service_3_body, faq_main_title, body,
    faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
    faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images // Tambahkan faq_x dan images
  } = req.body;

  try {
    // Pastikan semua kolom di UPDATE query sesuai dengan 44 kolom di database Anda
    // dan urutan parameternya cocok dengan array 'values'.
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
        faq_1_question = $31, faq_1_answer = $32, faq_2_question = $33, faq_2_answer = $34, faq_3_question = $35, faq_3_answer = $36,
        faq_4_question = $37, faq_4_answer = $38, faq_5_question = $39, faq_5_answer = $40,
        images = $41,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $42
      RETURNING *;
    `;
    
    // Pastikan jumlah nilai di array 'values' ini adalah 42 (41 kolom data + 1 id)
    // dan urutannya cocok dengan placeholder $1 sampai $42.
    const values = [
      title, slug, hero_title, hero_video_url, hero_image_url,
      homepage_about_section_text, homepage_services_section_text,
      vision_title, vision_body, mission_title, mission_body, excellence_title,
      gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
      contact_location_title, contact_location_body, contact_email_title,
      contact_email_address, contact_whatsapp_number, main_intro_body,
      service_1_title, service_1_body, service_2_title, service_2_body,
      service_3_title, service_3_body, faq_main_title, body,
      faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
      faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images, // Ini akan menjadi $41
      numericId // Ini akan menjadi $42
    ];

    const result = await pool.query(updateQuery, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Halaman tidak ditemukan.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating page:', err);
    if (err.code === '23505' && err.constraint === 'pages_slug_key') {
      return res.status(422).json({ message: 'Slug sudah digunakan.', errors: { slug: ['Slug ini sudah ada.'] } });
    }
    res.status(500).json({ message: 'Gagal menyimpan perubahan halaman.' });
  }
});

// POST (Create) halaman baru
app.post('/api/pages', async (req, res) => {
  // Pastikan Anda mendapatkan semua kolom yang relevan dari body permintaan
  const { 
    title, slug, hero_title, hero_video_url, hero_image_url,
    homepage_about_section_text, homepage_services_section_text,
    vision_title, vision_body, mission_title, mission_body, excellence_title,
    gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
    contact_location_title, contact_location_body, contact_email_title,
    contact_email_address, contact_whatsapp_number, main_intro_body,
    service_1_title, service_1_body, service_2_title, service_2_body,
    service_3_title, service_3_body, faq_main_title, body,
    faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
    faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images // Tambahkan faq_x dan images
  } = req.body;

  try {
    if (!title || !slug) {
        return res.status(400).json({ message: 'Judul dan Slug wajib diisi.' });
    }

    // Pastikan daftar kolom di INSERT query sesuai dengan 44 kolom di database
    // dan urutan parameternya cocok dengan array 'insertValues'.
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
        faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
        faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *;
    `; 

    // Pastikan jumlah nilai di array 'insertValues' ini adalah 41 (jumlah kolom data tanpa id/timestamp)
    const insertValues = [
      title, slug, hero_title, hero_video_url, hero_image_url,
      homepage_about_section_text, homepage_services_section_text,
      vision_title, vision_body, mission_title, mission_body, excellence_title,
      gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
      contact_location_title, contact_location_body, contact_email_title,
      contact_email_address, contact_whatsapp_number, main_intro_body,
      service_1_title, service_1_body, service_2_title, service_2_body,
      service_3_title, service_3_body, faq_main_title, body,
      faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
      faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images // Ini adalah nilai ke-41
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
