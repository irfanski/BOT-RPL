import { query } from '../config/database.js';
import { generateId, formatDate, formatCurrency } from '../utils/helpers.js';

// Ambil ID perusahaan dari user_id
async function getPerusahaanId(userId) {
  const sql = 'SELECT id FROM perusahaan WHERE user_id = ?';
  const results = await query(sql, [userId]);
  return results[0]?.id || null;
}

// Ambil semua lowongan milik perusahaan
async function getCompanyLowongan(perusahaanId) {
  const sql = `
    SELECT l.*, 
           (SELECT COUNT(*) FROM lamaran WHERE lowongan_id = l.id) as jumlah_pelamar
    FROM lowongan l
    WHERE l.perusahaan_id = ?
    ORDER BY l.created_at DESC
  `;
  return await query(sql, [perusahaanId]);
}

// Simpan lowongan baru
async function saveLowongan(perusahaanId, data) {
  try {
    const lastLowongan = await query('SELECT id FROM lowongan ORDER BY id DESC LIMIT 1');
    const lowonganId = generateId('LWG', lastLowongan[0]?.id);
    
    console.log('💾 Saving lowongan:', {
      lowonganId,
      perusahaanId,
      posisi: data.posisi,
      deskripsi: data.deskripsi ? data.deskripsi.substring(0, 50) + '...' : null,
      lokasi: data.lokasi
    });
    
    await query(
      `INSERT INTO lowongan 
       (id, perusahaan_id, posisi, deskripsi, lokasi, tipe_pekerjaan, gaji_min, gaji_max, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')`,
      [
        lowonganId, 
        perusahaanId, 
        data.posisi, 
        data.deskripsi, 
        data.lokasi || null,
        data.tipe_pekerjaan || 'full_time',
        data.gaji_min || null,
        data.gaji_max || null
      ]
    );
    
    console.log('✅ Lowongan saved successfully:', lowonganId);
    return lowonganId;
  } catch (err) {
    console.error('❌ Error saving lowongan:', err);
    console.error('Error detail:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
}

// Simpan skill untuk lowongan - FIXED VERSION
async function saveLowonganSkills(lowonganId, skillIds) {
  try {
    console.log(`💾 Saving ${skillIds.length} skills for lowongan ${lowonganId}`);
    
    // Ambil last ID sekali di awal
    const lastLS = await query('SELECT id FROM lowongan_skill ORDER BY id DESC LIMIT 1');
    let lastNum = lastLS[0]?.id ? parseInt(lastLS[0].id.replace('LSK', '')) : 0;
    
    // Loop dan increment manual
    for (let i = 0; i < skillIds.length; i++) {
      lastNum++;
      const lsId = `LSK${lastNum.toString().padStart(3, '0')}`;
      
      console.log(`  ↳ Linking skill ${skillIds[i]} → ${lsId}`);
      
      await query(
        'INSERT INTO lowongan_skill (id, lowongan_id, skill_id) VALUES (?, ?, ?)',
        [lsId, lowonganId, skillIds[i]]
      );
    }
    
    console.log('✅ All skills linked successfully');
  } catch (err) {
    console.error('❌ Error saving lowongan skills:', err);
    console.error('Error detail:', err.message);
    throw err;
  }
}

// Ambil semua skill dari database
async function getAllSkills() {
  const sql = 'SELECT * FROM skill ORDER BY nama_skill ASC';
  return await query(sql);
}

// Cari atau buat skill baru
async function findOrCreateSkill(skillName) {
  try {
    // Normalize skill name (trim dan lowercase untuk comparison)
    const normalizedName = skillName.trim();
    
    console.log(`🔍 Finding/creating skill: "${normalizedName}"`);
    
    // Cek apakah skill sudah ada (case-insensitive)
    const existing = await query(
      'SELECT id FROM skill WHERE LOWER(nama_skill) = LOWER(?)',
      [normalizedName]
    );
    
    if (existing.length > 0) {
      console.log(`  ↳ Skill exists: ${existing[0].id}`);
      return existing[0].id;
    }
    
    // Buat skill baru
    const lastSkill = await query('SELECT id FROM skill ORDER BY id DESC LIMIT 1');
    const skillId = generateId('SKL', lastSkill[0]?.id);
    
    await query(
      'INSERT INTO skill (id, nama_skill) VALUES (?, ?)',
      [skillId, normalizedName]
    );
    
    console.log(`  ↳ Skill created: ${skillId}`);
    return skillId;
  } catch (err) {
    console.error('❌ Error find or create skill:', err);
    console.error('Error detail:', err.message);
    throw err;
  }
}

// Ambil pelamar untuk lowongan tertentu
async function getLowonganApplicants(lowonganId) {
  const sql = `
    SELECT 
      lm.id as lamaran_id,
      lm.status,
      lm.tanggal_melamar,
      u.nama as nama_pelamar,
      pk.alamat,
      pk.no_hp,
      cv.file_cv,
      cv.original_filename
    FROM lamaran lm
    JOIN pencari_kerja pk ON lm.pencari_kerja_id = pk.id
    JOIN users u ON pk.user_id = u.id
    LEFT JOIN cv ON lm.cv_id = cv.id
    WHERE lm.lowongan_id = ?
    ORDER BY lm.created_at DESC
  `;
  return await query(sql, [lowonganId]);
}

// Update status lamaran
async function updateLamaranStatus(lamaranId, newStatus, catatan = null) {
  try {
    const sql = catatan 
      ? 'UPDATE lamaran SET status = ?, catatan_perusahaan = ?, updated_at = NOW() WHERE id = ?'
      : 'UPDATE lamaran SET status = ?, updated_at = NOW() WHERE id = ?';
    
    const params = catatan 
      ? [newStatus, catatan, lamaranId]
      : [newStatus, lamaranId];
    
    await query(sql, params);
    return true;
  } catch (err) {
    console.error('❌ Error updating lamaran status:', err);
    throw err;
  }
}

// Ambil data pelamar untuk notifikasi
async function getApplicantInfo(lamaranId) {
  const sql = `
    SELECT 
      u.no_wa,
      u.nama,
      l.posisi,
      p.nama_perusahaan
    FROM lamaran lm
    JOIN pencari_kerja pk ON lm.pencari_kerja_id = pk.id
    JOIN users u ON pk.user_id = u.id
    JOIN lowongan l ON lm.lowongan_id = l.id
    JOIN perusahaan pr ON l.perusahaan_id = pr.id
    JOIN users p ON pr.user_id = p.id
    WHERE lm.id = ?
  `;
  const results = await query(sql, [lamaranId]);
  return results[0] || null;
}

// Update status lowongan (aktif/tutup)
async function updateLowonganStatus(lowonganId, newStatus) {
  try {
    await query(
      'UPDATE lowongan SET status = ?, updated_at = NOW() WHERE id = ?',
      [newStatus, lowonganId]
    );
    return true;
  } catch (err) {
    console.error('❌ Error updating lowongan status:', err);
    throw err;
  }
}

// Format list lowongan perusahaan
function formatCompanyLowonganList(lowonganList) {
  if (lowonganList.length === 0) {
    return 'Kamu belum punya lowongan.\n\nYuk posting lowongan pertamamu! Ketik "1" atau "posting".';
  }
  
  let text = '📋 *Lowongan Perusahaan Kamu*\n\n';
  
  lowonganList.forEach((loker, index) => {
    const statusIcon = loker.status === 'aktif' ? '🟢' : '🔴';
    text += `${index + 1}. ${statusIcon} *${loker.posisi}*\n`;
    text += `   Status: ${loker.status.charAt(0).toUpperCase() + loker.status.slice(1)}\n`;
    text += `   Pelamar: ${loker.jumlah_pelamar} orang\n`;
    text += `   ID: ${loker.id}\n\n`;
  });
  
  text += 'Ketik nomor atau ID untuk lihat detail!';
  
  return text;
}

// Format list pelamar
function formatApplicantsList(applicants, posisi) {
  if (applicants.length === 0) {
    return `Belum ada yang lamar posisi *${posisi}*.\n\nTunggu sebentar lagi ya!`;
  }
  
  let text = `🔥 *Pelamar untuk ${posisi}*\n\n`;
  text += `Total: ${applicants.length} orang\n\n`;
  
  applicants.forEach((app, index) => {
    const statusEmoji = {
      'dikirim': '📨',
      'diproses': '⏳',
      'diterima': '✅',
      'ditolak': '❌'
    };
    
    text += `${index + 1}. *${app.nama_pelamar}*\n`;
    text += `   ${app.alamat}\n`;
    text += `   Status: ${statusEmoji[app.status]} ${app.status.charAt(0).toUpperCase() + app.status.slice(1)}\n`;
    text += `   Tanggal: ${app.tanggal_melamar}\n`;
    text += `   ID: ${app.lamaran_id}\n\n`;
  });
  
  text += 'Ketik nomor atau ID lamaran untuk lihat detail!';
  
  return text;
}

export {
  getPerusahaanId,
  getCompanyLowongan,
  saveLowongan,
  saveLowonganSkills,
  getAllSkills,
  findOrCreateSkill,
  getLowonganApplicants,
  updateLamaranStatus,
  getApplicantInfo,
  updateLowonganStatus,
  formatCompanyLowonganList,
  formatApplicantsList
};