import { query } from '../config/database.js';
import { formatCurrency } from '../utils/helpers.js';

// Ambil semua lowongan aktif
async function getActiveLowongan() {
  const sql = `
    SELECT l.*, p.nama_perusahaan
    FROM lowongan l
    JOIN perusahaan p ON l.perusahaan_id = p.id
    WHERE l.status = 'aktif'
    ORDER BY l.created_at DESC
  `;
  return await query(sql);
}

// Ambil detail lowongan dengan skill yang dibutuhkan
async function getLowonganDetail(lowonganId) {
  const sql = `
    SELECT l.*, p.nama_perusahaan, p.alamat as alamat_perusahaan
    FROM lowongan l
    JOIN perusahaan p ON l.perusahaan_id = p.id
    WHERE l.id = ?
  `;
  const lowongan = await query(sql, [lowonganId]);
  
  if (lowongan.length === 0) return null;
  
  // Ambil skill yang dibutuhkan
  const skillSql = `
    SELECT s.nama_skill
    FROM lowongan_skill ls
    JOIN skill s ON ls.skill_id = s.id
    WHERE ls.lowongan_id = ?
  `;
  const skills = await query(skillSql, [lowonganId]);
  
  return {
    ...lowongan[0],
    skills: skills.map(s => s.nama_skill)
  };
}

// Filter lowongan by skill
async function filterLowonganBySkill(skillName) {
  const sql = `
    SELECT DISTINCT l.*, p.nama_perusahaan
    FROM lowongan l
    JOIN perusahaan p ON l.perusahaan_id = p.id
    JOIN lowongan_skill ls ON l.id = ls.lowongan_id
    JOIN skill s ON ls.skill_id = s.id
    WHERE l.status = 'aktif' 
    AND s.nama_skill LIKE ?
    ORDER BY l.created_at DESC
  `;
  return await query(sql, [`%${skillName}%`]);
}

// Format list lowongan untuk ditampilkan
function formatLowonganList(lowonganList) {
  if (lowonganList.length === 0) {
    return 'Belum ada lowongan yang tersedia saat ini.\n\nCoba lagi nanti ya!';
  }
  
  let text = 'Nih ada beberapa lowongan yang bisa kamu coba:\n\n';
  
  lowonganList.forEach((loker, index) => {
    const gaji = loker.gaji_min && loker.gaji_max 
      ? `${formatCurrency(loker.gaji_min)} - ${formatCurrency(loker.gaji_max)}`
      : 'Nego';
    
    text += `${index + 1}. *${loker.posisi}*\n`;
    text += `   ${loker.nama_perusahaan}`;
    if (loker.lokasi) text += ` • ${loker.lokasi}`;
    text += `\n   💰 ${gaji}\n`;
    text += `   ID: ${loker.id}\n\n`;
  });
  
  text += 'Ketik nomor atau ID lowongan untuk lihat detail!\n';
  text += 'Atau ketik "filter [skill]" untuk cari yang spesifik.';
  
  return text;
}

// Format detail lowongan
function formatLowonganDetail(lowongan) {
  let text = `📋 *${lowongan.posisi}*\n\n`;
  text += `🏢 Perusahaan: ${lowongan.nama_perusahaan}\n`;
  
  if (lowongan.lokasi) {
    text += `📍 Lokasi: ${lowongan.lokasi}\n`;
  }
  
  if (lowongan.tipe_pekerjaan) {
    const tipe = lowongan.tipe_pekerjaan.replace('_', ' ');
    text += `⏰ Tipe: ${tipe.charAt(0).toUpperCase() + tipe.slice(1)}\n`;
  }
  
  if (lowongan.gaji_min && lowongan.gaji_max) {
    text += `💰 Gaji: ${formatCurrency(lowongan.gaji_min)} - ${formatCurrency(lowongan.gaji_max)}\n`;
  }
  
  text += `\n📝 Deskripsi:\n${lowongan.deskripsi || 'Tidak ada deskripsi'}\n`;
  
  if (lowongan.skills && lowongan.skills.length > 0) {
    text += `\n🔧 Skill yang dibutuhkan:\n`;
    lowongan.skills.forEach(skill => {
      text += `• ${skill}\n`;
    });
  }
  
  text += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  text += `Mau lamar posisi ini?\n\n`;
  text += `Ketik: *lamar ${lowongan.id}*`;
  
  return text;
}

export {
  getActiveLowongan,
  getLowonganDetail,
  filterLowonganBySkill,
  formatLowonganList,
  formatLowonganDetail
};