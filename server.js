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
// Namun, dari kode Anda sebelumnya, Anda tampaknya menggunakan PG Pool terpisah.
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
                service_1_title, service_1_body, service_1_image_url,
                service_2_title, service_2_body, service_2_image_url,
                service_3_title, service_3_body, service_3_image_url,
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

        const insertValues = [
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


// --- ROUTE UNTUK STATISTIK PENGUNJUNG (VISITOR STATS) ---

// GET Statistik Pengunjung
app.get('/api/visitor-stats', async (req, res) => {
    try {
        // Ambil data statistik terbaru (asumsi ada satu baris untuk statistik global)
        const { data, error } = await supabase
            .from('visitor_stats')
            .select('total_visitors, today_visitors, online_users, last_updated, id')
            .order('last_updated', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = Baris tidak ditemukan
            throw error;
        }

        let currentStats = data;

        // Jika tidak ada data statistik, inisialisasi baris baru
        if (!currentStats) {
            console.log('No visitor stats found, initializing...');
            const { data: newStats, error: initError } = await supabase
                .from('visitor_stats')
                .insert({
                    date: new Date().toISOString().split('T')[0], // Tanggal hari ini YYYY-MM-DD
                    total_visitors: 0,
                    today_visitors: 0,
                    online_users: 0,
                    last_updated: new Date().toISOString()
                })
                .select('total_visitors, today_visitors, online_users, last_updated, id')
                .single();
            if (initError) throw initError;
            currentStats = newStats;
        }

        // Cek dan reset today_visitors jika tanggal sudah berganti
        const today = new Date().toISOString().split('T')[0];
        const lastUpdatedDate = currentStats.last_updated ? new Date(currentStats.last_updated).toISOString().split('T')[0] : '';

        if (lastUpdatedDate !== today) {
            // Reset today_visitors di DB
            const { error: updateError } = await supabase
                .from('visitor_stats')
                .update({ today_visitors: 0, last_updated: new Date().toISOString() })
                .eq('id', currentStats.id); // Update berdasarkan ID baris
            if (updateError) throw updateError;
            currentStats.today_visitors = 0; // Update nilai lokal juga
        }

        // Kirim data statistik yang sudah diproses ke frontend
        res.json({
            totalVisitors: currentStats.total_visitors, // Sesuaikan nama properti agar konsisten dengan frontend
            todayVisitors: currentStats.today_visitors, // Sesuaikan nama properti
            onlineUsers: currentStats.online_users,     // Sesuaikan nama properti
            id: currentStats.id // Kirim ID juga
        });
    } catch (err) {
        console.error('Error fetching visitor stats:', err.message);
        res.status(500).json({ message: 'Gagal mengambil statistik pengunjung.', error: err.message });
    }
});

// POST (Update) Statistik Pengunjung
app.post('/api/visitor-stats/update', async (req, res) => {
    const { type, visitorStatsId } = req.body; // Menerima tipe update dan ID baris

    if (!visitorStatsId) {
        return res.status(400).json({ message: 'visitorStatsId diperlukan untuk memperbarui statistik.' });
    }

    try {
        // Ambil data saat ini untuk menghindari race condition
        const { data: currentStats, error: fetchError } = await supabase
            .from('visitor_stats')
            .select('total_visitors, today_visitors, online_users, last_updated')
            .eq('id', visitorStatsId)
            .single();

        if (fetchError) {
            // Jika baris tidak ditemukan atau error lain saat fetch, kirim error
            console.error('Error fetching current stats for update:', fetchError.message);
            return res.status(404).json({ message: 'Statistik pengunjung tidak ditemukan.' });
        }

        let newTotal = currentStats.total_visitors;
        let newToday = currentStats.today_visitors;
        let newOnline = currentStats.online_users;

        // Pastikan today_visitors di-reset jika hari sudah berganti (double check)
        const today = new Date().toISOString().split('T')[0];
        const lastUpdatedDate = new Date(currentStats.last_updated).toISOString().split('T')[0];

        if (lastUpdatedDate !== today) {
            newToday = 0;
        }

        // Tentukan operasi update berdasarkan 'type'
        if (type === 'increment_all') {
            newTotal++;
            newToday++;
            newOnline++;
        } else if (type === 'decrement_online') {
            newOnline = Math.max(0, newOnline - 1); // Pastikan tidak negatif
        } else {
            return res.status(400).json({ message: 'Tipe update tidak valid.' });
        }

        const { data: updatedData, error: updateError } = await supabase
            .from('visitor_stats')
            .update({
                total_visitors: newTotal,
                today_visitors: newToday,
                online_users: newOnline,
                last_updated: new Date().toISOString()
            })
            .eq('id', visitorStatsId) // Update baris spesifik
            .select('total_visitors, today_visitors, online_users') // Pilih kolom yang akan dikembalikan
            .single();

        if (updateError) throw updateError;

        // Kirim data yang diperbarui kembali ke frontend
        res.json({
            message: 'Statistik pengunjung berhasil diperbarui.',
            totalVisitors: updatedData.total_visitors,
            todayVisitors: updatedData.today_visitors,
            onlineUsers: updatedData.online_users
        });

    } catch (err) {
        console.error('Error updating visitor stats:', err.message);
        res.status(500).json({ message: 'Gagal memperbarui statistik pengunjung.', error: err.message });
    }
});


// Start server
app.listen(port, () => {
    console.log(`Backend API berjalan di http://localhost:${port}`);
});