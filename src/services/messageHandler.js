import { extractPhoneNumber } from '../utils/helpers.js';
import { getState, isInFlow, setState, clearState } from './sessionManager.js';
import {
  checkUserExists,
  getUserData,
  startRegistration,
  handleRoleChoice,
  handlePKNama,
  handlePKAlamat,
  handlePRSHNama,
  handlePRSHAlamat
} from '../controllers/authController.js';
import {
  getActiveLowongan,
  getLowonganDetail,
  filterLowonganBySkill,
  formatLowonganList,
  formatLowonganDetail
} from '../controllers/jobController.js';
import {
  checkExistingApplication,
  saveCV,
  saveLamaran,
  getUserApplications,
  formatApplicationStatus,
  getPencariKerjaId
} from '../controllers/applicationController.js';
import {
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
} from '../controllers/companyController.js';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import { isValidFileType, isValidFileSize, generateFileName } from '../utils/helpers.js';

async function handleMessage(sock, msg) {
  const from = msg.key.remoteJid;
  
  // Skip status updates dan broadcast
  if (from === 'status@broadcast' || !from.endsWith('@s.whatsapp.net')) {
    return;
  }
  
  const phoneNumber = extractPhoneNumber(from);
  
  // Ekstrak pesan text
  const messageType = Object.keys(msg.message)[0];
  let text = '';
  
  if (messageType === 'conversation') {
    text = msg.message.conversation;
  } else if (messageType === 'extendedTextMessage') {
    text = msg.message.extendedTextMessage.text;
  } else if (messageType === 'buttonsResponseMessage') {
    text = msg.message.buttonsResponseMessage.selectedButtonId;
  } else if (messageType === 'listResponseMessage') {
    text = msg.message.listResponseMessage.singleSelectReply.selectedRowId;
  } else if (messageType === 'documentMessage' || messageType === 'imageMessage') {
    // Handle file upload untuk CV
    await handleFileUpload(sock, from, phoneNumber, msg, messageType);
    return;
  }

  text = text.trim();
  console.log(`📨 [${phoneNumber}] Pesan: "${text}"`);

  try {
    // Cek apakah user sudah terdaftar
    const user = await checkUserExists(phoneNumber);
    console.log(`👤 [${phoneNumber}] User exists:`, user ? 'YES' : 'NO');

    // FITUR BARU: Cek apakah user ketik "menu" - langsung ke menu utama
    if (text.toLowerCase() === 'menu' && user) {
      console.log(`🏠 [${phoneNumber}] User requested main menu`);
      clearState(phoneNumber); // Clear semua session yang sedang berjalan
      const userData = await getUserData(user.id, user.role);
      await showMainMenu(sock, from, userData);
      return;
    }

    // Jika belum terdaftar, mulai registrasi
    if (!user) {
      console.log(`🆕 [${phoneNumber}] Starting registration flow`);
      await handleRegistrationFlow(sock, from, phoneNumber, text);
      return;
    }

    // User sudah terdaftar, ambil data user
    const userData = await getUserData(user.id, user.role);
    console.log(`✅ [${phoneNumber}] User role: ${userData.role}`);

    // Cek apakah user sedang dalam flow
    const currentSession = getState(phoneNumber);
    console.log(`🔄 [${phoneNumber}] Current session:`, currentSession ? currentSession.state : 'NONE');

    // Jika ada session, route ke flow yang sesuai
    if (currentSession) {
      // Cek apakah ini flow registrasi
      if (currentSession.state.startsWith('reg_')) {
        console.log(`📝 [${phoneNumber}] In registration flow`);
        await handleRegistrationFlow(sock, from, phoneNumber, text);
      } else {
        // Flow lainnya (posting lowongan, aplikasi, dll)
        console.log(`🔀 [${phoneNumber}] In other flow: ${currentSession.state}`);
        await handleFlowState(sock, from, phoneNumber, text, userData, currentSession);
      }
      return;
    }

    // Tidak ada session, handle menu command biasa
    await handleMenuCommand(sock, from, phoneNumber, text, userData);

  } catch (err) {
    console.error(`❌ [${phoneNumber}] ERROR in handleMessage:`);
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    await sock.sendMessage(from, {
      text: `Maaf, ada error nih. Coba lagi ya!\n\n[Debug: ${err.message}]`
    });
  }
}

// Handle flow registrasi
async function handleRegistrationFlow(sock, from, phoneNumber, text) {
  const session = getState(phoneNumber);

  // Belum ada session, mulai registrasi
  if (!session) {
    const response = startRegistration(phoneNumber);
    await sock.sendMessage(from, {
      text: response.text
    });
    return;
  }

  // Handle berdasarkan state
  let responseText = '';

  switch (session.state) {
    case 'reg_choose_role':
      responseText = handleRoleChoice(phoneNumber, text);
      await sock.sendMessage(from, { text: responseText });
      break;

    case 'reg_pk_nama':
      responseText = handlePKNama(phoneNumber, text);
      await sock.sendMessage(from, { text: responseText });
      break;

    case 'reg_pk_alamat':
      const pkResult = await handlePKAlamat(phoneNumber, text);
      await sock.sendMessage(from, { text: pkResult.message });
      
      if (pkResult.success) {
        const userData = await getUserData(pkResult.userId, pkResult.role);
        await showMainMenu(sock, from, userData);
      }
      break;

    case 'reg_prsh_nama':
      responseText = handlePRSHNama(phoneNumber, text);
      await sock.sendMessage(from, { text: responseText });
      break;

    case 'reg_prsh_alamat':
      const prshResult = await handlePRSHAlamat(phoneNumber, text);
      await sock.sendMessage(from, { text: prshResult.message });
      
      if (prshResult.success) {
        const userData = await getUserData(prshResult.userId, prshResult.role);
        await showMainMenu(sock, from, userData);
      }
      break;

    default:
      await sock.sendMessage(from, {
        text: 'Maaf, ada yang error. Coba ketik "menu" ya!'
      });
  }
}

// Tampilkan menu utama berdasarkan role
async function showMainMenu(sock, from, userData) {
  if (userData.role === 'pencari_kerja') {
    const menuText = `Halo ${userData.nama}! Mau ngapain hari ini?

1️⃣ Cari Lowongan
2️⃣ Cek Status Lamaran
3️⃣ Update Profil

Ketik angka atau keyword untuk memilih menu.

💡 _Ketik "menu" kapanpun untuk kembali ke sini_`;
    
    await sock.sendMessage(from, { text: menuText });
  } else {
    const menuText = `Halo ${userData.nama_perusahaan}! Ada yang bisa dibantu?

1️⃣ Posting Lowongan Baru
2️⃣ Lihat Pelamar
3️⃣ Kelola Lowongan

Ketik angka atau keyword untuk memilih menu.

💡 _Ketik "menu" kapanpun untuk kembali ke sini_`;
    
    await sock.sendMessage(from, { text: menuText });
  }
}

// Handle menu command
async function handleMenuCommand(sock, from, phoneNumber, text, userData) {
  const session = getState(phoneNumber);
  const lowerText = text.toLowerCase();
  
  console.log(`🎯 [${phoneNumber}] handleMenuCommand - session:`, session ? session.state : 'NONE');
  console.log(`🎯 [${phoneNumber}] handleMenuCommand - role:`, userData.role);
  console.log(`🎯 [${phoneNumber}] handleMenuCommand - text:`, text);
  
  // Jika sedang dalam flow tertentu
  if (session) {
    console.log(`🔀 [${phoneNumber}] Routing to handleFlowState with state: ${session.state}`);
    await handleFlowState(sock, from, phoneNumber, text, userData, session);
    return;
  }
  
  // Menu pencari kerja
  if (userData.role === 'pencari_kerja') {
    if (lowerText === '1' || lowerText.includes('cari') || lowerText.includes('loker') || lowerText.includes('lowongan')) {
      // Tampilkan lowongan
      const lowongan = await getActiveLowongan();
      const listText = formatLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      
      // Set state untuk menunggu pilihan lowongan
      setState(phoneNumber, 'choose_lowongan', { lowongan });
      
    } else if (lowerText === '2' || lowerText.includes('status') || lowerText.includes('lamaran')) {
      // Tampilkan status lamaran
      const pencariKerjaId = await getPencariKerjaId(userData.id);
      const applications = await getUserApplications(pencariKerjaId);
      const statusText = formatApplicationStatus(applications);
      await sock.sendMessage(from, { text: statusText });
      
    } else if (lowerText === '3' || lowerText.includes('profil') || lowerText.includes('update')) {
      await sock.sendMessage(from, { text: 'Fitur update profil coming soon! 🚧' });
      
    } else if (lowerText.startsWith('filter')) {
      // Filter lowongan by skill
      const skillName = text.substring(6).trim();
      if (!skillName) {
        await sock.sendMessage(from, { text: 'Format: filter [nama skill]\n\nContoh: filter JavaScript' });
        return;
      }
      
      const lowongan = await filterLowonganBySkill(skillName);
      const listText = formatLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      
      setState(phoneNumber, 'choose_lowongan', { lowongan });
      
    } else if (lowerText.startsWith('lamar ')) {
      // Lamar lowongan
      const lowonganId = text.substring(6).trim().toUpperCase();
      
      // Ambil detail lowongan
      const lowonganDetail = await getLowonganDetail(lowonganId);
      if (!lowonganDetail) {
        await sock.sendMessage(from, { text: 'Lowongan tidak ditemukan!' });
        return;
      }
      
      // Cek apakah sudah pernah lamar
      const pencariKerjaId = await getPencariKerjaId(userData.id);
      const alreadyApplied = await checkExistingApplication(pencariKerjaId, lowonganId);
      
      if (alreadyApplied) {
        await sock.sendMessage(from, { text: 'Kamu sudah pernah lamar lowongan ini sebelumnya!' });
        return;
      }
      
      // Minta CV
      await sock.sendMessage(from, { 
        text: `Oke, kamu mau lamar posisi *${lowonganDetail.posisi}*!\n\nKirim CV kamu dalam format PDF/DOC ya.\n\n(Max 5MB)` 
      });
      
      setState(phoneNumber, 'upload_cv', { 
        lowonganId,
        pencariKerjaId,
        posisi: lowonganDetail.posisi
      });
      
    } else if (lowerText === 'menu' || lowerText === 'help') {
      await showMainMenu(sock, from, userData);
      
    } else {
      await sock.sendMessage(from, { text: 'Perintah tidak dikenali. Ketik "menu" untuk lihat pilihan.' });
    }
    
  } else {
    // Menu perusahaan
    console.log(`🏢 [${phoneNumber}] Company menu - checking command: "${lowerText}"`);
    
    if (lowerText === '1' || lowerText.includes('posting') || lowerText.includes('buat')) {
      console.log(`📝 [${phoneNumber}] Starting posting lowongan flow`);
      
      // Mulai flow posting lowongan
      setState(phoneNumber, 'post_loker_posisi', {});
      console.log(`✅ [${phoneNumber}] State set to: post_loker_posisi`);
      
      await sock.sendMessage(from, { 
        text: 'Oke, yuk bikin lowongan baru!\n\nPosisi apa yang mau dibuka?\n(contoh: Web Developer, Marketing Manager)' 
      });
      
      console.log(`✅ [${phoneNumber}] Welcome message sent`);
      
    } else if (lowerText === '2' || lowerText.includes('pelamar')) {
      // Lihat pelamar
      const perusahaanId = await getPerusahaanId(userData.id);
      const lowongan = await getCompanyLowongan(perusahaanId);
      const listText = formatCompanyLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      
      setState(phoneNumber, 'choose_lowongan_pelamar', { lowongan });
      
    } else if (lowerText === '3' || lowerText.includes('kelola')) {
      // Kelola lowongan
      const perusahaanId = await getPerusahaanId(userData.id);
      const lowongan = await getCompanyLowongan(perusahaanId);
      const listText = formatCompanyLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      
      setState(phoneNumber, 'choose_lowongan_kelola', { lowongan });
      
    } else if (lowerText === 'menu' || lowerText === 'help') {
      await showMainMenu(sock, from, userData);
      
    } else {
      await sock.sendMessage(from, { text: 'Perintah tidak dikenali. Ketik "menu" untuk lihat pilihan.' });
    }
  }
}

// Handle state flow
async function handleFlowState(sock, from, phoneNumber, text, userData, session) {
  console.log(`🔀 [${phoneNumber}] handleFlowState called - state: ${session.state}, role: ${userData.role}`);
  
  if (userData.role === 'pencari_kerja') {
    await handleJobSeekerFlowState(sock, from, phoneNumber, text, userData, session);
  } else {
    await handleCompanyFlowState(sock, from, phoneNumber, text, userData, session);
  }
}

// Handle flow state untuk pencari kerja
async function handleJobSeekerFlowState(sock, from, phoneNumber, text, userData, session) {
  try {
    if (session.state === 'choose_lowongan') {
      // User pilih lowongan untuk lihat detail
      const selectedIndex = parseInt(text) - 1;
      const lowonganId = text.toUpperCase();
      
      let selectedLowongan;
      
      if (!isNaN(selectedIndex) && session.data.lowongan[selectedIndex]) {
        selectedLowongan = session.data.lowongan[selectedIndex];
      } else if (lowonganId.startsWith('LWG')) {
        selectedLowongan = session.data.lowongan.find(l => l.id === lowonganId);
      }
      
      if (!selectedLowongan) {
        await sock.sendMessage(from, { text: 'Lowongan tidak ditemukan!' });
        return;
      }
      
      // Ambil detail lengkap
      const lowonganDetail = await getLowonganDetail(selectedLowongan.id);
      const detailText = formatLowonganDetail(lowonganDetail);
      await sock.sendMessage(from, { text: detailText });
      
      clearState(phoneNumber);
      
    } else if (session.state === 'upload_cv') {
      await sock.sendMessage(from, { 
        text: 'Silakan kirim file CV kamu (PDF/DOC/DOCX, max 5MB)' 
      });
    }
    
  } catch (err) {
    console.error(`❌ [${phoneNumber}] Error di handleJobSeekerFlowState:`, err.message);
    console.error('Stack:', err.stack);
    await sock.sendMessage(from, { text: `Maaf, ada error. Coba lagi ya!\n\n[Debug: ${err.message}]` });
    clearState(phoneNumber);
  }
}

// Handle file upload
async function handleFileUpload(sock, from, phoneNumber, msg, messageType) {
  const session = getState(phoneNumber);
  
  if (!session || session.state !== 'upload_cv') {
    await sock.sendMessage(from, { text: 'File ini untuk apa ya? Kalau mau kirim CV, ketik "lamar [ID lowongan]" dulu.' });
    return;
  }
  
  try {
    let buffer, mimetype, fileName;
    
    if (messageType === 'documentMessage') {
      buffer = await downloadMediaMessage(msg, 'buffer', {});
      mimetype = msg.message.documentMessage.mimetype;
      fileName = msg.message.documentMessage.fileName;
    } else {
      await sock.sendMessage(from, { text: 'CV harus dalam format dokumen (PDF/DOC/DOCX)' });
      return;
    }
    
    // Validasi file type
    if (!isValidFileType(mimetype)) {
      await sock.sendMessage(from, { text: 'Format file tidak valid! Kirim PDF atau DOC/DOCX ya.' });
      return;
    }
    
    // Validasi file size
    if (!isValidFileSize(buffer.length)) {
      await sock.sendMessage(from, { text: 'File terlalu besar! Max 5MB ya.' });
      return;
    }
    
    // Simpan CV
    const uploadDir = process.env.UPLOAD_DIR || './uploads/cv';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const user = await checkUserExists(phoneNumber);
    const savedFileName = generateFileName(fileName, user.id);
    const filePath = path.join(uploadDir, savedFileName);
    
    fs.writeFileSync(filePath, buffer);
    
    // Simpan ke database (TANPA file_size)
    const cvId = await saveCV(session.data.pencariKerjaId, savedFileName, fileName);
    
    // Simpan lamaran
    const lamaranId = await saveLamaran(session.data.lowonganId, session.data.pencariKerjaId, cvId);
    
    clearState(phoneNumber);
    
    await sock.sendMessage(from, { 
      text: `✅ Lamaran berhasil dikirim!\n\nPosisi: ${session.data.posisi}\nCV: ${fileName}\n\nTunggu kabar dari HRD ya! Good luck! 🍀` 
    });
    
  } catch (err) {
    console.error(`❌ [${phoneNumber}] Error upload CV:`, err.message);
    console.error('Stack:', err.stack);
    await sock.sendMessage(from, { text: `Gagal upload CV. Coba lagi ya!\n\n[Debug: ${err.message}]` });
  }
}

// Handle flow state untuk perusahaan
async function handleCompanyFlowState(sock, from, phoneNumber, text, userData, session) {
  console.log(`🏢 [${phoneNumber}] handleCompanyFlowState - state: ${session.state}`);
  console.log(`📊 [${phoneNumber}] Session data:`, JSON.stringify(session.data, null, 2));
  
  try {
    if (session.state === 'post_loker_posisi') {
      console.log(`📝 [${phoneNumber}] Processing posisi: "${text}"`);
      
      // Simpan posisi, tanya deskripsi
      session.data.posisi = text;
      setState(phoneNumber, 'post_loker_deskripsi', session.data);
      
      console.log(`✅ [${phoneNumber}] Posisi saved, state updated to: post_loker_deskripsi`);
      console.log(`📊 [${phoneNumber}] Updated session data:`, JSON.stringify(session.data, null, 2));
      
      await sock.sendMessage(from, { 
        text: `Posisi: *${text}*\n\nSekarang, kasih deskripsi pekerjaan dong!\n(tulis detail job desc, tanggung jawab, dll)` 
      });
      
      console.log(`✅ [${phoneNumber}] Deskripsi prompt sent`);
      
    } else if (session.state === 'post_loker_deskripsi') {
      console.log(`📝 [${phoneNumber}] Processing deskripsi: "${text.substring(0, 50)}..."`);
      
      // Simpan deskripsi, tanya lokasi
      session.data.deskripsi = text;
      setState(phoneNumber, 'post_loker_lokasi', session.data);
      
      console.log(`✅ [${phoneNumber}] Deskripsi saved, state updated to: post_loker_lokasi`);
      
      await sock.sendMessage(from, { 
        text: 'Deskripsi tersimpan!\n\nLokasi kerjanya di mana?\n(ketik nama kota/daerah, atau ketik "remote" kalau work from home)' 
      });
      
    } else if (session.state === 'post_loker_lokasi') {
      console.log(`📝 [${phoneNumber}] Processing lokasi: "${text}"`);
      
      // Simpan lokasi, tanya skill
      session.data.lokasi = text;
      setState(phoneNumber, 'post_loker_skill', session.data);
      
      console.log(`✅ [${phoneNumber}] Lokasi saved, state updated to: post_loker_skill`);
      
      await sock.sendMessage(from, { 
        text: 'Noted!\n\nSkill apa aja yang dibutuhkan?\n\n(pisahkan pakai koma, contoh: JavaScript, PHP, MySQL)' 
      });
      
    } else if (session.state === 'post_loker_skill') {
      console.log(`📝 [${phoneNumber}] Processing skill: "${text}"`);
      
      const input = text.trim();
      
      if (!input) {
        await sock.sendMessage(from, { text: 'Skill tidak boleh kosong! Tulis minimal 1 skill.' });
        return;
      }
      
      // Parse skill (pisah pakai koma, titik koma, atau enter)
      const skillInput = input
        .split(/[,;\n]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      console.log(`📝 [${phoneNumber}] Parsed skills:`, skillInput);
      
      if (skillInput.length === 0) {
        await sock.sendMessage(from, { text: 'Format skill tidak valid! Pisahkan dengan koma ya.' });
        return;
      }
      
      // Cari atau buat skill
      const skillIds = [];
      for (const skillName of skillInput) {
        try {
          console.log(`🔍 [${phoneNumber}] Finding/creating skill: ${skillName}`);
          const skillId = await findOrCreateSkill(skillName);
          skillIds.push(skillId);
          console.log(`✅ [${phoneNumber}] Skill ${skillName} -> ${skillId}`);
        } catch (err) {
          console.error(`❌ [${phoneNumber}] Error creating skill ${skillName}:`, err.message);
          throw err;
        }
      }
      
      session.data.skillIds = skillIds;
      setState(phoneNumber, 'post_loker_confirm', session.data);
      
      console.log(`✅ [${phoneNumber}] Skills saved, state updated to: post_loker_confirm`);
      console.log(`📊 [${phoneNumber}] Final session data before confirm:`, JSON.stringify(session.data, null, 2));
      
      // Konfirmasi
      let confirmText = '📋 *Konfirmasi Lowongan*\n\n';
      confirmText += `Posisi: ${session.data.posisi}\n`;
      confirmText += `Deskripsi: ${session.data.deskripsi.substring(0, 100)}${session.data.deskripsi.length > 100 ? '...' : ''}\n`;
      confirmText += `Lokasi: ${session.data.lokasi}\n`;
      confirmText += `Skill: ${skillInput.join(', ')}\n\n`;
      confirmText += 'Posting lowongan ini?\n\nKetik "ya" untuk posting atau "batal" untuk cancel.';
      
      await sock.sendMessage(from, { text: confirmText });
      
    } else if (session.state === 'post_loker_confirm') {
      console.log(`📝 [${phoneNumber}] Processing confirmation: "${text}"`);
      
      if (text.toLowerCase() === 'ya' || text.toLowerCase() === 'yes') {
        console.log(`💾 [${phoneNumber}] User confirmed, saving lowongan...`);
        console.log(`📊 [${phoneNumber}] Data to save:`, JSON.stringify(session.data, null, 2));
        
        const perusahaanId = await getPerusahaanId(userData.id);
        console.log(`🏢 [${phoneNumber}] Perusahaan ID: ${perusahaanId}`);
        
        const lowonganId = await saveLowongan(perusahaanId, session.data);
        console.log(`✅ [${phoneNumber}] Lowongan saved with ID: ${lowonganId}`);
        
        await saveLowonganSkills(lowonganId, session.data.skillIds);
        console.log(`✅ [${phoneNumber}] Skills linked to lowongan`);
        
        clearState(phoneNumber);
        console.log(`✅ [${phoneNumber}] Session cleared`);
        
        await sock.sendMessage(from, { 
          text: `✅ Lowongan berhasil diposting!\n\nID: ${lowonganId}\nPosisi: ${session.data.posisi}\n\nSekarang kamu bisa tunggu pelamar masuk! 🎉` 
        });
        
        console.log(`✅ [${phoneNumber}] Success message sent`);
      } else {
        clearState(phoneNumber);
        await sock.sendMessage(from, { text: 'Posting lowongan dibatalkan.' });
      }
      
    } else {
      console.log(`⚠️ [${phoneNumber}] Unknown state: ${session.state}`);
    }
    
  } catch (err) {
    console.error(`❌ [${phoneNumber}] Error di handleCompanyFlowState:`);
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    await sock.sendMessage(from, { text: `Maaf, ada error. Coba lagi ya!\n\n[Debug: ${err.message}]` });
    clearState(phoneNumber);
  }
}

export default handleMessage;