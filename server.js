// server.js

require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 8080;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);

const supabaseStorageBucket = process.env.SUPABASE_STORAGE_BUCKET;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const allowedOrigins = [
  'http://localhost:3000',
  'https://cvalams-rizqis-projects-607b9812.vercel.app',
  'https://cvalams.vercel.app',
  'https://cvsumberalamraya.vercel.app',
  'https://www.cvsumberalamraya.com'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      console.error('CORS: Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'))
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// --- DAFTAR KOLOM LENGKAP DARI TABEL PAGES ANDA (50 kolom setelah penambahan) ---
// Ini harus sama persis dengan yang Anda dapatkan dari pgAdmin/Supabase Table Editor.
// Urutan dan nama harus sesuai!
const ALL_PAGE_COLUMNS = `
  id, title, slug, hero_title, hero_video_url, hero_image_url,
  homepage_about_section_text, homepage_services_section_text,
  vision_title, vision_body, mission_title, mission_body, excellence_title,
  gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
  contact_location_title, contact_location_body, contact_email_title,
  contact_email_address, contact_whatsapp_number, main_intro_body,
  service_1_title, service_1_body, service_1_image_url, service_2_title, service_2_body, service_2_image_url, service_3_title, service_3_body, service_3_image_url, -- Tambahan service_X_image_url di sini
  faq_main_title, body, created_at, updated_at,
  faq_1_question, faq_1_answer, faq_2_question, faq_2_answer, faq_3_question, faq_3_answer,
  faq_4_question, faq_4_answer, faq_5_question, faq_5_answer, images,
  hero_video_source_type, hero_image_source_type,
  homepage_bottom_image_1_url, homepage_bottom_image_2_url, homepage_bottom_image_3_url,
  excellence_image_1_url, excellence_image_2_url, excellence_image_3_url
`;

//visitor

const ONLINE_TIMEOUT_MINUTES = 3;

// Endpoint GET Statistik Pengunjung
app.get('/api/visitor-stats', async (req, res) => {
    try {
        const now = new Date();
        const cutoffTime = new Date(now.getTime() - ONLINE_TIMEOUT_MINUTES * 60 * 1000).toISOString();

        // 1. Bersihkan sesi lama dari tabel online_sessions
        //    (Ini bisa juga dilakukan oleh cron job terpisah untuk efisiensi)
        const { error: cleanupError } = await supabase
            .from('online_sessions')
            .delete()
            .lt('last_activity', cutoffTime);
        if (cleanupError) console.error('Error cleaning up old online sessions:', cleanupError);

        // 2. Hitung jumlah online_users yang masih aktif
        const { count: currentOnlineUsers, error: countError } = await supabase
            .from('online_sessions')
            .select('*', { count: 'exact' }); // Menghitung baris yang tersisa (yaitu, aktif)
        if (countError) throw countError;

        // 3. Ambil baris statistik utama (total, today)
        const { data: currentStats, error: fetchStatsError } = await supabase
            .from('visitor_stats')
            .select('total_visitors, today_visitors, online_users, last_updated, id') // Tidak perlu last_activity di sini lagi
            .order('last_updated', { ascending: false })
            .limit(1)
            .single();

        if (fetchStatsError && fetchStatsError.code !== 'PGRST116') {
            throw fetchStatsError;
        }

        let mainStats = currentStats;
        let changesMade = false;
        let newTodayVisitors = mainStats ? mainStats.today_visitors : 0;

        // Jika baris statistik utama tidak ada, inisialisasi
        if (!mainStats) {
            console.log('Main visitor stats row not found, initializing...');
            const { data: newMainStats, error: initError } = await supabase
                .from('visitor_stats')
                .insert({
                    date: now.toISOString().split('T')[0],
                    total_visitors: 0,
                    today_visitors: 0,
                    online_users: currentOnlineUsers, // Set online_users awal dari hitungan sesi
                    last_updated: now.toISOString()
                })
                .select('total_visitors, today_visitors, online_users, last_updated, id')
                .single();
            if (initError) throw initError;
            mainStats = newMainStats;
            changesMade = true;
        }

        // Logika untuk mereset 'today_visitors' jika hari sudah berganti
        const todayString = now.toISOString().split('T')[0];
        const lastUpdatedDateString = mainStats.last_updated ? new Date(mainStats.last_updated).toISOString().split('T')[0] : '';

        if (lastUpdatedDateString !== todayString) {
            newTodayVisitors = 0;
            changesMade = true;
        }

        // Perbarui online_users di tabel visitor_stats utama dengan hitungan terbaru
        if (mainStats.online_users !== currentOnlineUsers) {
            mainStats.online_users = currentOnlineUsers;
            changesMade = true;
        }
        if (newTodayVisitors !== mainStats.today_visitors) {
            mainStats.today_visitors = newTodayVisitors;
            changesMade = true;
        }

        if (changesMade) {
            const { error: updateMainStatsError } = await supabase
                .from('visitor_stats')
                .update({ 
                    today_visitors: mainStats.today_visitors, 
                    online_users: mainStats.online_users,
                    last_updated: now.toISOString()
                })
                .eq('id', mainStats.id);
            if (updateMainStatsError) {
                console.error('Error updating main visitor stats during GET cleanup:', updateMainStatsError);
            }
        }

        res.json({
            totalVisitors: mainStats.total_visitors,
            todayVisitors: mainStats.today_visitors,
            onlineUsers: mainStats.online_users, // Kirim online_users yang sudah dihitung
            id: mainStats.id // Kirim ID dari baris visitor_stats utama
        });
    } catch (err) {
        console.error('Error fetching visitor stats:', err.message);
        res.status(500).json({ message: 'Gagal mengambil statistik pengunjung.', error: err.message });
    }
});

// --- Endpoint untuk Menerima Heartbeat dari Frontend ---
app.post('/api/visitor-stats/heartbeat', async (req, res) => {
    const { sessionId } = req.body; // Menerima sessionId dari frontend

    if (!sessionId) {
        return res.status(400).json({ message: 'sessionId diperlukan untuk heartbeat.' });
    }

    try {
        const now = new Date();
        const ipAddress = req.ip; // Ambil IP dari request
        const userAgent = req.headers['user-agent']; // Ambil user-agent

        // UPSERT ke tabel online_sessions:
        // Jika sessionId sudah ada, perbarui last_activity.
        // Jika tidak ada, tambahkan baris baru.
        const { data, error } = await supabase
            .from('online_sessions')
            .upsert(
                { session_id: sessionId, last_activity: now.toISOString(), ip_address: ipAddress, user_agent: userAgent },
                { onConflict: 'session_id', ignoreDuplicates: false }
            )
            .select('session_id') // Hanya perlu mengonfirmasi upsert
            .single();

        if (error) throw error;

        res.json({ message: 'Heartbeat received.', sessionId: data.session_id });
    } catch (err) {
        console.error('Error processing heartbeat:', err.message);
        res.status(500).json({ message: 'Gagal memproses heartbeat.', error: err.message });
    }
});

// --- Endpoint untuk initial increment total/today (online_users dihitung dari sesi) ---
app.post('/api/visitor-stats/increment-counts', async (req, res) => {
    const { visitorStatsId } = req.body;

    if (!visitorStatsId) {
        return res.status(400).json({ message: 'visitorStatsId diperlukan.' });
    }

    try {
        const now = new Date();
        const { data: currentStats, error: fetchError } = await supabase
            .from('visitor_stats')
            .select('total_visitors, today_visitors, last_updated') // Tidak perlu online_users di sini
            .eq('id', visitorStatsId)
            .single();

        if (fetchError) {
            console.error('Error fetching current stats for increment-counts:', fetchError.message);
            return res.status(404).json({ message: 'Statistik pengunjung tidak ditemukan.' });
        }

        let newTotal = currentStats.total_visitors;
        let newToday = currentStats.today_visitors;
        
        // Logika reset today_visitors jika hari sudah berganti
        const todayString = now.toISOString().split('T')[0];
        const lastUpdatedDateString = new Date(currentStats.last_updated).toISOString().split('T')[0];

        if (lastUpdatedDateString !== todayString) {
            newToday = 0;
        }

        newTotal++; // Selalu tingkatkan total
        newToday++; // Selalu tingkatkan today (karena ini adalah kunjungan pertama pada sesi ini)

        const { data: updatedData, error: updateError } = await supabase
            .from('visitor_stats')
            .update({
                total_visitors: newTotal,
                today_visitors: newToday,
                last_updated: now.toISOString() // Perbarui last_updated karena ada perubahan
            })
            .eq('id', visitorStatsId)
            .select('total_visitors, today_visitors')
            .single();

        if (updateError) throw updateError;

        // Setelah update, hitung online_users lagi untuk respons yang akurat
        const { count: finalOnlineUsers, error: finalCountError } = await supabase
            .from('online_sessions')
            .select('*', { count: 'exact' })
            .gt('last_activity', new Date(now.getTime() - ONLINE_TIMEOUT_MINUTES * 60 * 1000).toISOString()); // Hitung yang masih aktif
        if (finalCountError) throw finalCountError;


        res.json({
            message: 'Counts incremented.',
            totalVisitors: updatedData.total_visitors,
            todayVisitors: updatedData.today_visitors,
            onlineUsers: finalOnlineUsers // Kirim online_users yang akurat
        });

    } catch (err) {
        console.error('Error incrementing visitor counts:', err.message);
        res.status(500).json({ message: 'Gagal memperbarui hitungan pengunjung.', error: err.message });
    }
});


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

// Endpoint untuk mengunggah gambar
app.post('/api/upload-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
    }

    const file = req.file;
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${uuidv4()}.${fileExtension}`;

    const { data, error } = await supabase.storage
      .from(supabaseStorageBucket)
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      return res.status(500).json({ message: 'Gagal mengunggah file ke Supabase Storage.', error: error.message });
    }

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
    service_1_title, service_1_body,
    // --- START: Perubahan di sini untuk service_X_image_url ---
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
    // Total kolom setelah penambahan 3 service_X_image_url adalah 50.
    // 50 kolom data + 1 id = 51 placeholder.
    // Placeholder akan menjadi $1 sampai $50 (untuk data) + $51 (untuk id).
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
        service_1_title = $23, service_1_body = $24,
        service_1_image_url = $25, -- Kolom baru
        service_2_title = $26, service_2_body = $27,
        service_2_image_url = $28, -- Kolom baru
        service_3_title = $29, service_3_body = $30,
        service_3_image_url = $31, -- Kolom baru
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

    // Pastikan jumlah nilai di array 'values' ini adalah 53 (52 kolom data + 1 id)
    // dan urutannya cocok dengan placeholder $1 sampai $53.
    const values = [
      title, slug, hero_title, hero_video_url, hero_image_url,
      homepage_about_section_text, homepage_services_section_text,
      vision_title, vision_body, mission_title, mission_body, excellence_title,
      gallery_intro_body, contact_overlay_text, contact_title, contact_phone,
      contact_location_title, contact_location_body, contact_email_title,
      contact_email_address, contact_whatsapp_number, main_intro_body,
      service_1_title, service_1_body,
      service_1_image_url, // Ditambahkan
      service_2_title, service_2_body,
      service_2_image_url, // Ditambahkan
      service_3_title, service_3_body,
      service_3_image_url, // Ditambahkan
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
        service_1_image_url, -- Ditambahkan
        service_2_title, service_2_body,
        service_2_image_url, -- Ditambahkan
        service_3_title, service_3_body,
        service_3_image_url, -- Ditambahkan
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
      service_1_image_url, // Ditambahkan
      service_2_title, service_2_body,
      service_2_image_url, // Ditambahkan
      service_3_title, service_3_body,
      service_3_image_url, // Ditambahkan
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

app.get('/api/visitor-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('visitor_stats')
      .select('*')
      .limit(1)
      .single()

    if (error) throw error

    res.json({
      total: data.total,
      today: data.today,
      online: data.online
    })
  } catch (err) {
    console.error('Gagal mengambil statistik visitor:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
})
