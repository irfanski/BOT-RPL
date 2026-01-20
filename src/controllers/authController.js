import { query } from '../config/database.js';
import { generateId } from '../utils/helpers.js';
import { setState, getState, clearState } from '../services/sessionManager.js';

// Cek apakah user sudah terdaftar
async function checkUserExists(phoneNumber) {
  const sql = 'SELECT * FROM users WHERE no_wa = ?';
  const results = await query(sql, [phoneNumber]);
  return results.length > 0 ? results[0] : null;
}

// Ambil data lengkap user berdasarkan role
async function getUserData(userId, role) {
  let sql, tableName;
  
  if (role === 'pencari_kerja') {
    sql = `
      SELECT u.*, pk.alamat, pk.no_hp 
      FROM users u
      LEFT JOIN pencari_kerja pk ON u.id = pk.user_id
      WHERE u.id = ?
    `;
  } else {
    sql = `
      SELECT u.*, p.nama_perusahaan, p.alamat, p.deskripsi, p.website
      FROM users u
      LEFT JOIN perusahaan p ON u.id = p.user_id
      WHERE u.id = ?
    `;
  }
  
  const results = await query(sql, [userId]);
  return results[0] || null;
}

// Mulai proses registrasi
function startRegistration(phoneNumber) {
  setState(phoneNumber, 'reg_choose_role');
  return {
    text: `Halo! Kayaknya kamu baru pertama kali nih di sini.

Kamu mau gabung sebagai apa?

1️⃣ Nyari Kerja
2️⃣ Nyari Karyawan

Ketik angka 1 atau 2 untuk memilih.`
  };
}

// Handle pilihan role
function handleRoleChoice(phoneNumber, choice) {
  const normalizedChoice = choice.trim().toLowerCase();
  
  if (normalizedChoice === '1' || normalizedChoice.includes('kerja')) {
    setState(phoneNumber, 'reg_pk_nama', { role: 'pencari_kerja' });
    return 'Oke sip! Biar kenal lebih deket, kasih tau dong:\n\nNama kamu siapa?\n(ketik aja langsung ya)';
  } else if (normalizedChoice === '2' || normalizedChoice.includes('karyawan') || normalizedChoice.includes('perusahaan')) {
    setState(phoneNumber, 'reg_prsh_nama', { role: 'perusahaan' });
    return 'Mantap! Mau rekrut talent terbaik ya?\n\nNama perusahaan kamu apa?\n(tulis lengkap biar profesional)';
  } else {
    return 'Pilih 1 atau 2 ya! 😊\n\n1️⃣ Nyari Kerja\n2️⃣ Nyari Karyawan';
  }
}

// Handle input nama (pencari kerja)
function handlePKNama(phoneNumber, nama) {
  const session = getState(phoneNumber);
  session.data.nama = nama;
  setState(phoneNumber, 'reg_pk_alamat', session.data);
  return `Hai ${nama}!\n\nDomisili kamu di mana?\n(biar bisa kasih rekomendasi loker yang deket)`;
}

// Handle input alamat & simpan pencari kerja
async function handlePKAlamat(phoneNumber, alamat) {
  const session = getState(phoneNumber);
  const { nama, role } = session.data;

  try {
    // Generate IDs
    const lastUser = await query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
    const userId = generateId('USR', lastUser[0]?.id);
    
    const lastPK = await query('SELECT id FROM pencari_kerja ORDER BY id DESC LIMIT 1');
    const pkId = generateId('PCK', lastPK[0]?.id);

    // Insert ke users
    await query(
      'INSERT INTO users (id, nama, email, password, role, no_wa) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, nama, `${phoneNumber}@temp.com`, 'no_password', role, phoneNumber]
    );

    // Insert ke pencari_kerja
    await query(
      'INSERT INTO pencari_kerja (id, user_id, alamat, no_hp) VALUES (?, ?, ?, ?)',
      [pkId, userId, alamat, phoneNumber]
    );

    clearState(phoneNumber);

    return {
      success: true,
      message: `Perfect! Akun kamu udah jadi nih.\n\nSekarang kamu bisa:\n• Cari lowongan kerja\n• Lamar pekerjaan\n• Cek status lamaran\n\nLangsung coba yuk!`,
      userId,
      role
    };
  } catch (err) {
    console.error('Error saat registrasi pencari kerja:', err);
    return {
      success: false,
      message: 'Maaf, ada error saat registrasi. Coba lagi ya!'
    };
  }
}

// Handle input nama perusahaan
function handlePRSHNama(phoneNumber, namaPerusahaan) {
  const session = getState(phoneNumber);
  session.data.nama_perusahaan = namaPerusahaan;
  setState(phoneNumber, 'reg_prsh_alamat', session.data);
  return 'Noted!\n\nKantor kalian di mana?\n(alamat lengkap ya biar kandidat tahu lokasinya)';
}

// Handle input alamat & simpan perusahaan
async function handlePRSHAlamat(phoneNumber, alamat) {
  const session = getState(phoneNumber);
  const { nama_perusahaan, role } = session.data;

  try {
    // Generate IDs
    const lastUser = await query('SELECT id FROM users ORDER BY id DESC LIMIT 1');
    const userId = generateId('USR', lastUser[0]?.id);
    
    const lastPRSH = await query('SELECT id FROM perusahaan ORDER BY id DESC LIMIT 1');
    const prshId = generateId('PRSH', lastPRSH[0]?.id);

    // Insert ke users
    await query(
      'INSERT INTO users (id, nama, email, password, role, no_wa) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, nama_perusahaan, `${phoneNumber}@temp.com`, 'no_password', role, phoneNumber]
    );

    // Insert ke perusahaan
    await query(
      'INSERT INTO perusahaan (id, user_id, nama_perusahaan, alamat) VALUES (?, ?, ?, ?)',
      [prshId, userId, nama_perusahaan, alamat]
    );

    clearState(phoneNumber);

    return {
      success: true,
      message: `Siap! Akun perusahaan udah aktif.\n\nSekarang kamu bisa:\n• Posting lowongan kerja\n• Lihat pelamar yang masuk\n• Atur status lamaran\n\nYuk mulai!`,
      userId,
      role
    };
  } catch (err) {
    console.error('Error saat registrasi perusahaan:', err);
    return {
      success: false,
      message: 'Maaf, ada error saat registrasi. Coba lagi ya!'
    };
  }
}

export {
  checkUserExists,
  getUserData,
  startRegistration,
  handleRoleChoice,
  handlePKNama,
  handlePKAlamat,
  handlePRSHNama,
  handlePRSHAlamat
};