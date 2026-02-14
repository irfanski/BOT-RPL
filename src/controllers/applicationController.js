import { query } from '../config/database.js';
import { generateId, formatDate } from '../utils/helpers.js';
import fs from 'fs';
import path from 'path';

// Cek apakah user sudah pernah lamar lowongan ini
async function checkExistingApplication(pencariKerjaId, lowonganId) {
  const sql = `
    SELECT * FROM lamaran 
    WHERE pencari_kerja_id = ? AND lowongan_id = ?
  `;
  const results = await query(sql, [pencariKerjaId, lowonganId]);
  return results.length > 0;
}

// Simpan CV ke database
async function saveCV(pencariKerjaId, fileName, originalName) {
  try {
    // Cek apakah sudah ada CV
    const existingCV = await query(
      'SELECT id FROM cv WHERE pencari_kerja_id = ?',
      [pencariKerjaId]
    );
    
    if (existingCV.length > 0) {
      // Update CV yang sudah ada
      await query(
        'UPDATE cv SET file_cv = ?, original_filename = ?, updated_at = NOW() WHERE id = ?',
        [fileName, originalName, existingCV[0].id]
      );
      return existingCV[0].id;
    } else {
      // Buat CV baru
      const lastCV = await query('SELECT id FROM cv ORDER BY id DESC LIMIT 1');
      const cvId = generateId('CV', lastCV[0]?.id);
      
      await query(
        'INSERT INTO cv (id, pencari_kerja_id, file_cv, original_filename) VALUES (?, ?, ?, ?)',
        [cvId, pencariKerjaId, fileName, originalName]
      );
      return cvId;
    }
  } catch (err) {
    console.error('Error saving CV:', err);
    throw err;
  }
}

// Simpan lamaran
async function saveLamaran(lowonganId, pencariKerjaId, cvId) {
  try {
    const lastLamaran = await query('SELECT id FROM lamaran ORDER BY id DESC LIMIT 1');
    const lamaranId = generateId('LMR', lastLamaran[0]?.id);
    
    await query(
      `INSERT INTO lamaran 
       (id, lowongan_id, pencari_kerja_id, cv_id, status, tanggal_melamar) 
       VALUES (?, ?, ?, ?, 'dikirim', ?)`,
      [lamaranId, lowonganId, pencariKerjaId, cvId, formatDate()]
    );
    
    return lamaranId;
  } catch (err) {
    console.error('Error saving lamaran:', err);
    throw err;
  }
}

// Ambil status lamaran user
async function getUserApplications(pencariKerjaId) {
  const sql = `
    SELECT 
      lm.id, lm.status, lm.tanggal_melamar,
      l.posisi, p.nama_perusahaan
    FROM lamaran lm
    JOIN lowongan l ON lm.lowongan_id = l.id
    JOIN perusahaan pr ON l.perusahaan_id = pr.id
    JOIN users p ON pr.user_id = p.id
    WHERE lm.pencari_kerja_id = ?
    ORDER BY lm.created_at DESC
  `;
  return await query(sql, [pencariKerjaId]);
}

// Format status lamaran
function formatApplicationStatus(applications) {
  if (applications.length === 0) {
    return 'Kamu belum pernah lamar pekerjaan.\n\nYuk mulai cari lowongan! Ketik "1" atau "cari".';
  }
  
  let text = '📊 *Status Lamaran Kamu*\n\n';
  
  applications.forEach((app, index) => {
    const statusEmoji = {
      'dikirim': '📨',
      'diproses': '⏳',
      'diterima': '✅',
      'ditolak': '❌'
    };
    
    text += `${index + 1}. *${app.posisi}*\n`;
    text += `   ${app.nama_perusahaan}\n`;
    text += `   Status: ${statusEmoji[app.status]} ${app.status.charAt(0).toUpperCase() + app.status.slice(1)}\n`;
    text += `   Tanggal: ${app.tanggal_melamar}\n\n`;
  });
  
  return text;
}

// Ambil ID pencari_kerja dari user_id
async function getPencariKerjaId(userId) {
  const sql = 'SELECT id FROM pencari_kerja WHERE user_id = ?';
  const results = await query(sql, [userId]);
  return results[0]?.id || null;
}

export {
  checkExistingApplication,
  saveCV,
  saveLamaran,
  getUserApplications,
  formatApplicationStatus,
  getPencariKerjaId
};