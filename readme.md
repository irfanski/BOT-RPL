# 🤖 Bot WhatsApp Loker

Sistem lowongan kerja berbasis WhatsApp dengan fitur lengkap untuk pencari kerja dan perusahaan.

## 📋 Fitur

### Pencari Kerja
- ✅ Lihat daftar lowongan kerja
- ✅ Filter lowongan by skill
- ✅ Lamar pekerjaan (upload CV)
- ✅ Cek status lamaran
- ✅ Update profil

### Perusahaan
- ✅ Posting lowongan baru
- ✅ Lihat daftar pelamar
- ✅ Download CV pelamar
- ✅ Update status lamaran
- ✅ Kelola lowongan (aktifkan/tutup)

## 🛠️ Tech Stack

- **Node.js** v16+
- **Baileys** (WhatsApp Multi-Device)
- **MySQL** (Database)
- **dotenv** (Environment config)

## 📦 Installation

### 1. Clone atau Download Project

```bash
git clone <repository-url>
cd loker-bot-wa
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Database

Jalankan query SQL yang sudah kamu execute sebelumnya (termasuk ALTER TABLE yang sudah dilakukan).

### 4. Setup Environment Variables

Copy file `.env.example` jadi `.env`:

```bash
cp .env.example .env
```

Edit file `.env` sesuai konfigurasi database kamu:

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=
DB_NAME=loker_db
```

### 5. Jalankan Bot

```bash
npm start
```

Atau untuk development dengan auto-reload:

```bash
npm run dev
```

### 6. Scan QR Code

Setelah bot jalan, akan muncul QR Code di terminal. Scan dengan WhatsApp kamu:

1. Buka WhatsApp
2. Tap **Menu (⋮)** > **Linked Devices**
3. Tap **Link a Device**
4. Scan QR Code yang muncul di terminal

## 🚀 Cara Pakai

### Pertama Kali

1. Kirim pesan apa aja ke bot (misal: "Halo")
2. Bot akan minta kamu registrasi
3. Pilih role: **Nyari Kerja** atau **Nyari Karyawan**
4. Ikuti step registrasinya
5. Selesai! Kamu bisa pakai semua fitur

### Menu Utama

**Pencari Kerja:**
- 📋 Cari Lowongan
- 📊 Cek Status Lamaran
- ⚙️ Update Profil

**Perusahaan:**
- ➕ Posting Lowongan Baru
- 📥 Lihat Pelamar
- 📋 Kelola Lowongan

## 📁 Struktur Folder

```
loker-bot-wa/
├── src/
│   ├── config/
│   │   └── database.js          # Koneksi MySQL
│   ├── controllers/
│   │   └── authController.js    # Handle registrasi & auth
│   ├── services/
│   │   ├── baileys.js          # Setup Baileys bot
│   │   ├── messageHandler.js   # Handle pesan masuk
│   │   └── sessionManager.js   # Manage user session
│   ├── utils/
│   │   └── helpers.js          # Helper functions
│   └── index.js                # Entry point
├── uploads/
│   └── cv/                     # Folder CV yang diupload
├── sessions/                   # Baileys session data
├── .env                        # Environment variables
├── package.json
└── README.md
```

## 🔍 Troubleshooting

### QR Code tidak muncul
- Pastikan tidak ada session lama di folder `./sessions`
- Hapus folder `./sessions` dan restart bot

### Database connection failed
- Cek konfigurasi di `.env`
- Pastikan MySQL sudah jalan
- Cek port database (default: 3307)

### Bot tidak respon
- Cek console untuk error
- Pastikan nomor WA tidak diblock
- Cek koneksi internet

## 📝 Development Status

✅ **Phase 1: Basic Setup** - DONE
- Setup project
- Koneksi database
- Init Baileys bot
- Registrasi user

⏳ **Phase 2: Job Features** - IN PROGRESS
- Lihat lowongan
- Lamar kerja
- Upload CV

⏳ **Phase 3: Company Features** - PENDING
- Posting lowongan
- Kelola pelamar

⏳ **Phase 4: Notifications** - PENDING
- Notif status lamaran
- Notif pelamar baru

## 🤝 Contributing

Feel free to contribute! Create issue atau pull request.

## 📄 License

ISC

---

by irfan