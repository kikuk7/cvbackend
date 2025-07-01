// server.js

// Memuat variabel lingkungan dari file .env
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg'); // Untuk koneksi ke database PostgreSQL utama
const cors = require('cors');
const multer = require('multer'); // Untuk menangani upload file
const { createClient } = require('@supabase/supabase-js'); // Untuk interaksi dengan Supabase
const { v4: uuidv4 } = require('uuid'); // Untuk menghasilkan ID unik

const app = express();
const port = process.env.PORT || 8080; // Port untuk menjalankan server

// --- Konfigurasi Database PostgreSQL (Jika terpisah dari Supabase PG) ---
// Jika Supabase adalah satu-satunya database Anda, bagian ini mungkin tidak diperlukan
// atau perlu disesuaikan untuk menunjuk ke Supabase's managed Postgres.
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { // Penting untuk koneksi aman ke database di lingkungan cloud (misal: Railway)
        rejectUnauthorized: false // Mungkin perlu disetel ke true di produksi dengan sertifikat yang tepat
    }
});

// --- Konfigurasi Supabase Client ---
// Mengambil URL dan Kunci Supabase dari variabel lingkungan
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET;

// Validasi keberadaan kunci Supabase sebelum inisialisasi
if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('ERROR: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in environment variables. Server cannot start.');
    // Menghentikan proses Node.js jika kunci penting tidak ada
    process.exit(1);
}
// Menginisialisasi Supabase client dengan service_role_key untuk izin penuh di backend
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Konfigurasi Multer untuk Upload File ---
const upload = multer({
    storage: multer.memoryStorage(), // Menyimpan file di memori
    limits: {
        fileSize: 5 * 1024 * 1024 // Batas ukuran file 5 MB
    }
});

// --- Konfigurasi CORS (Cross-Origin Resource Sharing) ---
// Daftar origin (URL frontend) yang diizinkan untuk mengakses API ini
const allowedOrigins = [
    'http://localhost:3000', // Untuk pengembangan Nuxt lokal
    'https://cvalams-rizqis-projects-607b9812.vercel.app', // Contoh URL Vercel preview
    'https://cvalams.vercel.app' // URL produksi Vercel Anda
    // Tambahkan URL Vercel lain yang mungkin Anda gunakan jika ada
];

app.use(cors({
    origin: function (origin, callback) {
        // Izinkan permintaan tanpa origin (misal: dari Postman/Insomnia atau permintaan server-to-server)
        // Atau jika origin termasuk dalam daftar allowedOrigins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true); // Izinkan
        } else {
            console.error('CORS: Origin not allowed:', origin); // Log origin yang ditolak
            callback(new Error('Not allowed by CORS')); // Tolak
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Metode HTTP yang diizinkan
    allowedHeaders: ['Content-Type', 'Authorization'], // Header yang diizinkan
    credentials: true // Mengizinkan pengiriman kredensial (misal: cookies, authorization headers)
}));

// Middleware untuk parsing JSON body dari request
app.use(express.json());

// --- DAFTAR KOLOM LENGKAP DARI TABEL PAGES ANDA ---
// Ini harus sama persis dengan nama kolom di skema database Anda.
const ALL_PAGE_COLUMNS = `
    id, title, slug, hero_title, hero_video_url, hero_image_url,
    homepage_about_section_text, homepage_services_section_text,
    vision_title, vision_body, mission_title, mission_body, excellence_title,
    gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
    contact_location_title, contact_location_body, contact_email_title,
    contact_email_address, contact_whatsapp_number, main_intro_body,
    service_1_title, service_1_body, service_1_image_url,
    service_2_title, service_2_body, service_2_image_url,
    service_3_title, service_3_body, service_3_image_url,
    faq_main_title, body, created_at, updated_at,
    faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
    faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
    hero_video_source_type, hero_image_source_type,
    homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
    excellence_image_1_url, excellence_image_2_url, excellence_image_3_url
`;

// --- ROUTE UNTUK MANAJEMEN HALAMAN (PAGES) ---

// GET semua halaman
app.get('/api/pages', async (req, res) => {
    try {
        const result = await pool.query(`SELECT ${ALL_PAGE_COLUMNS} FROM pages ORDER BY id ASC`);
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
        query = `SELECT ${ALL_PAGE_COLUMNS} FROM pages WHERE id = $1`;
        values = [numericId];
    } else {
        query = `SELECT ${ALL_PAGE_COLUMNS} FROM pages WHERE slug = $1`;
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

// Endpoint untuk mengunggah gambar ke Supabase Storage
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
        }

        const file = req.file;
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `${uuidv4()}.${fileExtension}`; // Nama file unik

        const { data, error } = await supabase.storage
            .from(supabaseStorageBucket)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false // Jangan menimpa jika sudah ada file dengan nama yang sama
            });

        if (error) {
            console.error('Supabase upload error:', error);
            return res.status(500).json({ message: 'Gagal mengunggah file ke Supabase Storage.', error: error.message });
        }

        // Dapatkan URL publik dari file yang diunggah
        const { data: publicUrlData } = supabase.storage
            .from(supabaseStorageBucket)
            .getPublicUrl(fileName);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error('Gagal mendapatkan URL publik setelah upload.');
        }

        res.status(200).json({ publicUrl: publicUrlData.publicUrl });

    } catch (err) {
        console.error('Upload endpoint error:', err);
        res.status(500).json({ message: 'Kesalahan server saat mengunggah gambar.', error: err.message });
    }
});

// PUT (Update) halaman berdasarkan ID
app.put('/api/pages/:id', async (req, res) => {
    const { id } = req.params;
    const numericId = parseInt(id);

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
        service_1_title, service_1_body, service_1_image_url,
        service_2_title, service_2_body, service_2_image_url,
        service_3_title, service_3_body, service_3_image_url,
        faq_main_title, body,
        faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
        faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
        hero_video_source_type, hero_image_source_type,
        homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
        excellence_image_1_url, excellence_image_2_url, excellence_image_3_url
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
                service_1_title = $23, service_1_body = $24, service_1_image_url = $25,
                service_2_title = $26, service_2_body = $27, service_2_image_url = $28,
                service_3_title = $29, service_3_body = $30, service_3_image_url = $31,
                faq_main_title = $32, body = $33,
                faq_1_question = $34, faq_1_answer = $35, faq_2_question = $36, faq_2_answer = $37, faq_3_question = $38, faq_3_answer = $39,
                faq_4_question = $40, faq_4_answer = $41, faq_5_question = $42, faq_5_answer = $43,
                images = $44,
                hero_video_source_type = $45, hero_image_source_type = $46,
                homepage_bottom_image_1_url = $47, homepage_bottom_image_2_url = $48, homepage_bottom_image_3_url = $49,
                excellence_image_1_url = $50, excellence_image_2_url = $51, excellence_image_3_url = $52,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $53
            RETURNING *;
        `;

        const values = [
            title, slug, hero_title, hero_video_url, hero_image_url,
            homepage_about_section_text, homepage_services_section_text,
            vision_title, vision_body, mission_title, mission_body, excellence_title,
            gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
            contact_location_title, contact_location_body, contact_email_title,
            contact_email_address, contact_whatsapp_number, main_intro_body,
            service_1_title, service_1_body, service_1_image_url,
            service_2_title, service_2_body, service_2_image_url,
            service_3_title, service_3_body, service_3_image_url,
            faq_main_title, body,
            faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
            faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
            hero_video_source_type, hero_image_source_type,
            homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
            excellence_image_1_url, excellence_image_2_url, excellence_image_3_url,
            numericId
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
    const {
        title, slug, hero_title, hero_video_url, hero_image_url,
        homepage_about_section_text, homepage_services_section_text,
        vision_title, vision_body, mission_title, mission_body, excellence_title,
        gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
        contact_location_title, contact_location_body, contact_email_title,
        contact_email_address, contact_whatsapp_number, main_intro_body,
        service_1_title, service_1_body,
        // --- START: Perubahan di sini untuk service_X_image_url di POST ---
        service_1_image_url, // Ditambahkan
        service_2_title, service_2_body,
        service_2_image_url, // Ditambahkan
        service_3_title, service_3_body,
        service_3_image_url, // Ditambahkan
        // --- END: Perubahan di sini ---
        faq_main_title, body,
        faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
        faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
        hero_video_source_type, hero_image_source_type,
        homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
        excellence_image_1_url, excellence_image_2_url, excellence_image_3_url
    } = req.body;

    try {
        if (!title || !slug) {
            return res.status(400).json({ message: 'Judul dan Slug wajib diisi.' });
        }

        // Total kolom di DB sekarang 44 (lama) + 3 (hp_bottom) + 3 (excellence) + 3 (service_img) = 53
        const insertQuery = `
            INSERT INTO pages (
                title, slug, hero_title, hero_video_url, hero_image_url,
                homepage_about_section_text, homepage_services_section_text,
                vision_title, vision_body, mission_title, mission_body, excellence_title,
                gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
                contact_location_title, contact_location_body, contact_email_title,
                contact_email_address, contact_whatsapp_number, main_intro_body,
                service_1_title, service_1_body,
                service_1_image_url,
                service_2_title, service_2_body,
                service_2_image_url,
                service_3_title, service_3_body,
                service_3_image_url,
                faq_main_title, body,
                faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
                faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
                hero_video_source_type, hero_image_source_type,
                homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
                excellence_image_1_url, excellence_image_2_url, excellence_image_3_url,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING *;
        `;

        // Pastikan jumlah placeholder sesuai dengan jumlah nilai (53 nilai + 2 timestamp)
        const insertValues = [
            title, slug, hero_title, hero_video_url, hero_image_url,
            homepage_about_section_text, homepage_services_section_text,
            vision_title, vision_body, mission_title, mission_body, excellence_title,
            gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
            contact_location_title, contact_location_body, contact_email_title,
            contact_email_address, contact_whatsapp_number, main_intro_body,
            service_1_title, service_1_body,
            service_1_image_url,
            service_2_title, service_2_body,
            service_2_image_url,
            service_3_title, service_3_body,
            service_3_image_url,
            faq_main_title, body,
            faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
            faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
            hero_video_source_type, hero_image_source_type,
            homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
            excellence_image_1_url, excellence_image_2_url, excellence_image_3_url
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