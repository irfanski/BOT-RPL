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
  console.log(`📨 Pesan dari ${phoneNumber}: ${text}`);

  try {
    // Cek apakah user sudah terdaftar
    const user = await checkUserExists(phoneNumber);

    // Jika belum terdaftar, mulai registrasi
    if (!user) {
      await handleRegistrationFlow(sock, from, phoneNumber, text);
      return;
    }

    // Jika user sedang dalam flow registrasi (edge case)
    if (isInFlow(phoneNumber)) {
      await handleRegistrationFlow(sock, from, phoneNumber, text);
      return;
    }

    // User sudah terdaftar, handle menu
    const userData = await getUserData(user.id, user.role);
    await handleMenuCommand(sock, from, phoneNumber, text, userData);

  } catch (err) {
    console.error('Error handling message:', err);
    await sock.sendMessage(from, {
      text: 'Maaf, ada error nih. Coba lagi ya!'
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

Ketik angka atau keyword untuk memilih menu.`;
    
    await sock.sendMessage(from, { text: menuText });
  } else {
    const menuText = `Halo ${userData.nama_perusahaan}! Ada yang bisa dibantu?

1️⃣ Posting Lowongan Baru
2️⃣ Lihat Pelamar
3️⃣ Kelola Lowongan

Ketik angka atau keyword untuk memilih menu.`;
    
    await sock.sendMessage(from, { text: menuText });
  }
}

// Handle menu command
async function handleMenuCommand(sock, from, phoneNumber, text, userData) {
  const session = getState(phoneNumber);
  const lowerText = text.toLowerCase();
  
  // Jika sedang dalam flow tertentu
  if (session) {
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
        await sock.sendMessage(from, { text: 'Ketik: filter [nama skill]\nContoh: filter javascript' });
        return;
      }
      
      const lowongan = await filterLowonganBySkill(skillName);
      const listText = formatLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      setState(phoneNumber, 'choose_lowongan', { lowongan });
      
    } else if (lowerText.startsWith('lamar')) {
      // Lamar lowongan
      const lowonganId = text.split(' ')[1];
      if (!lowonganId) {
        await sock.sendMessage(from, { text: 'Ketik: lamar [ID lowongan]\nContoh: lamar LWG001' });
        return;
      }
      
      await startApplicationProcess(sock, from, phoneNumber, lowonganId, userData);
      
    } else if (lowerText === 'menu' || lowerText === 'back' || lowerText === 'kembali') {
      await showMainMenu(sock, from, userData);
      
    } else {
      await sock.sendMessage(from, { 
        text: 'Maaf, aku nggak ngerti 😅\n\nKetik "menu" untuk lihat pilihan yang ada ya!' 
      });
    }
  } else {
    // Menu perusahaan
    await handleCompanyMenu(sock, from, phoneNumber, text, userData);
  }
}

// Handle flow state (untuk pilih lowongan, upload CV, dll)
async function handleFlowState(sock, from, phoneNumber, text, userData, session) {
  if (session.state === 'choose_lowongan') {
    // User pilih lowongan dari list
    const selectedIndex = parseInt(text) - 1;
    const lowonganId = text.toUpperCase();
    
    let lowongan;
    
    if (!isNaN(selectedIndex) && session.data.lowongan[selectedIndex]) {
      // Pilih by nomor
      lowongan = await getLowonganDetail(session.data.lowongan[selectedIndex].id);
    } else if (lowonganId.startsWith('LWG')) {
      // Pilih by ID
      lowongan = await getLowonganDetail(lowonganId);
    } else {
      await sock.sendMessage(from, { text: 'Pilih nomor atau ID lowongan yang valid ya!' });
      return;
    }
    
    if (!lowongan) {
      await sock.sendMessage(from, { text: 'Lowongan tidak ditemukan!' });
      clearState(phoneNumber);
      return;
    }
    
    const detailText = formatLowonganDetail(lowongan);
    await sock.sendMessage(from, { text: detailText });
    clearState(phoneNumber);
    
  } else if (session.state === 'upload_cv') {
    // Menunggu user upload file CV
    await sock.sendMessage(from, { 
      text: 'Upload file CV kamu dong (PDF/DOC/DOCX).\n\nPastiin ukurannya nggak lebih dari 5MB ya!' 
    });
  }
}

// Start application process
async function startApplicationProcess(sock, from, phoneNumber, lowonganId, userData) {
  try {
    // Validasi lowongan exists
    const lowongan = await getLowonganDetail(lowonganId);
    if (!lowongan) {
      await sock.sendMessage(from, { text: 'Lowongan tidak ditemukan!' });
      return;
    }
    
    // Cek apakah sudah pernah lamar
    const pencariKerjaId = await getPencariKerjaId(userData.id);
    const alreadyApplied = await checkExistingApplication(pencariKerjaId, lowonganId);
    
    if (alreadyApplied) {
      await sock.sendMessage(from, { 
        text: 'Kamu udah pernah lamar posisi ini!\n\nCek status lamaranmu dengan ketik "2" atau "status".' 
      });
      return;
    }
    
    // Minta upload CV
    await sock.sendMessage(from, { 
      text: `Oke gas! Kamu mau lamar posisi *${lowongan.posisi}* di ${lowongan.nama_perusahaan}.\n\nUpload CV kamu dong (PDF/DOC/DOCX max 5MB).\nPastiin CV-nya udah update ya biar HRD-nya tertarik!` 
    });
    
    setState(phoneNumber, 'upload_cv', { lowonganId, pencariKerjaId });
    
  } catch (err) {
    console.error('Error starting application:', err);
    await sock.sendMessage(from, { text: 'Maaf, ada error. Coba lagi ya!' });
  }
}

// Handle file upload
async function handleFileUpload(sock, from, phoneNumber, msg, messageType) {
  try {
    const session = getState(phoneNumber);
    
    if (!session || session.state !== 'upload_cv') {
      return;
    }
    
    // Download media
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const mediaMsg = msg.message[messageType];
    
    // Validasi file type
    const mimetype = mediaMsg.mimetype;
    if (!isValidFileType(mimetype)) {
      await sock.sendMessage(from, { 
        text: 'Format file tidak didukung!\n\nKirim file PDF atau DOC/DOCX ya.' 
      });
      return;
    }
    
    // Validasi file size
    const fileSize = buffer.length;
    if (!isValidFileSize(fileSize)) {
      await sock.sendMessage(from, { 
        text: 'Ukuran file terlalu besar!\n\nMaksimal 5MB ya.' 
      });
      return;
    }
    
    // Generate filename & save
    const ext = mime.extension(mimetype);
    const fileName = generateFileName(`cv_${Date.now()}.${ext}`, session.data.pencariKerjaId);
    const uploadDir = process.env.UPLOAD_DIR || './uploads/cv';
    const filePath = path.join(uploadDir, fileName);
    
    fs.writeFileSync(filePath, buffer);
    
    // Save to database
    const originalName = mediaMsg.fileName || `cv.${ext}`;
    const cvId = await saveCV(session.data.pencariKerjaId, fileName, originalName, fileSize);
    
    // Save lamaran
    await saveLamaran(session.data.lowonganId, session.data.pencariKerjaId, cvId);
    
    clearState(phoneNumber);
    
    await sock.sendMessage(from, { 
      text: '✅ Lamaran kamu udah dikirim!\n\nStatus: Sedang diproses 📨\n\nTenang, nanti kami kabarin kalau ada update.\nGood luck ya! 🍀' 
    });
    
  } catch (err) {
    console.error('Error handling file upload:', err);
    await sock.sendMessage(from, { 
      text: 'Maaf, gagal upload CV. Coba lagi ya!' 
    });
    clearState(phoneNumber);
  }
}

// Handle menu perusahaan
async function handleCompanyMenu(sock, from, phoneNumber, text, userData) {
  const session = getState(phoneNumber);
  const lowerText = text.toLowerCase();
  
  // Jika sedang dalam flow tertentu
  if (session) {
    await handleCompanyFlowState(sock, from, phoneNumber, text, userData, session);
    return;
  }
  
  try {
    if (lowerText === '1' || lowerText.includes('posting') || lowerText.includes('post')) {
      // Mulai proses posting lowongan
      await sock.sendMessage(from, { 
        text: 'Oke, yuk bikin lowongan baru!\n\nPosisi apa yang mau dibuka?\n(contoh: Web Developer, Marketing Manager)' 
      });
      setState(phoneNumber, 'post_loker_posisi', {});
      
    } else if (lowerText === '2' || lowerText.includes('pelamar') || lowerText.includes('lamaran')) {
      // Lihat pelamar
      const perusahaanId = await getPerusahaanId(userData.id);
      const lowongan = await getCompanyLowongan(perusahaanId);
      
      if (lowongan.length === 0) {
        await sock.sendMessage(from, { 
          text: 'Kamu belum punya lowongan.\n\nYuk posting lowongan dulu! Ketik "1" atau "posting".' 
        });
        return;
      }
      
      const listText = formatCompanyLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      setState(phoneNumber, 'choose_lowongan_pelamar', { lowongan });
      
    } else if (lowerText === '3' || lowerText.includes('kelola')) {
      // Kelola lowongan
      const perusahaanId = await getPerusahaanId(userData.id);
      const lowongan = await getCompanyLowongan(perusahaanId);
      
      if (lowongan.length === 0) {
        await sock.sendMessage(from, { 
          text: 'Kamu belum punya lowongan.\n\nYuk posting lowongan dulu! Ketik "1" atau "posting".' 
        });
        return;
      }
      
      const listText = formatCompanyLowonganList(lowongan);
      await sock.sendMessage(from, { text: listText });
      setState(phoneNumber, 'choose_lowongan_kelola', { lowongan });
      
    } else if (lowerText === 'menu' || lowerText === 'back' || lowerText === 'kembali') {
      await showMainMenu(sock, from, userData);
      
    } else {
      await sock.sendMessage(from, { 
        text: 'Maaf, aku nggak ngerti 😅\n\nKetik "menu" untuk lihat pilihan yang ada ya!' 
      });
    }
  } catch (err) {
    console.error('Error di handleCompanyMenu:', err);
    await sock.sendMessage(from, { text: 'Maaf, ada error. Coba lagi ya!' });
  }
}

// Handle flow state perusahaan
async function handleCompanyFlowState(sock, from, phoneNumber, text, userData, session) {
  try {
    // Flow posting lowongan
    if (session.state === 'post_loker_posisi') {
      session.data.posisi = text;
      setState(phoneNumber, 'post_loker_deskripsi', session.data);
      await sock.sendMessage(from, { 
        text: 'Sip! Sekarang kasih deskripsi pekerjaannya dong.\n(jelasin tugas & tanggung jawabnya)' 
      });
      
    } else if (session.state === 'post_loker_deskripsi') {
      session.data.deskripsi = text;
      setState(phoneNumber, 'post_loker_lokasi', session.data);
      await sock.sendMessage(from, { 
        text: 'Mantap! Lokasinya di mana?\n(contoh: Jakarta, Bandung, Remote)\n\nAtau ketik "skip" kalau mau dilewat.' 
      });
      
    } else if (session.state === 'post_loker_lokasi') {
      if (text.toLowerCase() !== 'skip') {
        session.data.lokasi = text;
      }
      setState(phoneNumber, 'post_loker_skill', session.data);
      
      // Tampilkan list skill
      const skills = await getAllSkills();
      let skillText = 'Skill apa aja yang dibutuhin?\n\n';
      skillText += 'Pilih dari list atau ketik manual (pisahin pake koma):\n\n';
      skills.slice(0, 10).forEach((skill, index) => {
        skillText += `${index + 1}. ${skill.nama_skill}\n`;
      });
      skillText += '\nContoh ketik: 1,2,3 atau JavaScript, PHP';
      
      await sock.sendMessage(from, { text: skillText });
      
    } else if (session.state === 'post_loker_skill') {
      // Parse skill input
      const skillIds = [];
      const skillInput = text.split(',').map(s => s.trim());
      
      for (const input of skillInput) {
        const num = parseInt(input);
        if (!isNaN(num)) {
          // User ketik nomor, ambil dari list skill
          const skills = await getAllSkills();
          if (skills[num - 1]) {
            skillIds.push(skills[num - 1].id);
          }
        } else {
          // User ketik nama skill, cari atau buat baru
          const skillId = await findOrCreateSkill(input);
          skillIds.push(skillId);
        }
      }
      
      session.data.skillIds = skillIds;
      setState(phoneNumber, 'post_loker_confirm', session.data);
      
      // Konfirmasi
      let confirmText = '📋 *Konfirmasi Lowongan*\n\n';
      confirmText += `Posisi: ${session.data.posisi}\n`;
      confirmText += `Lokasi: ${session.data.lokasi || 'Tidak disebutkan'}\n`;
      confirmText += `Skill: ${skillInput.join(', ')}\n\n`;
      confirmText += 'Posting lowongan ini?\n\nKetik "ya" untuk posting atau "batal" untuk cancel.';
      
      await sock.sendMessage(from, { text: confirmText });
      
    } else if (session.state === 'post_loker_confirm') {
      if (text.toLowerCase() === 'ya' || text.toLowerCase() === 'yes') {
        // Simpan lowongan
        const perusahaanId = await getPerusahaanId(userData.id);
        const lowonganId = await saveLowongan(perusahaanId, session.data);
        await saveLowonganSkills(lowonganId, session.data.skillIds);
        
        clearState(phoneNumber);
        
        await sock.sendMessage(from, { 
          text: `✅ Lowongan berhasil diposting!\n\nID: ${lowonganId}\nPosisi: ${session.data.posisi}\n\nSekarang kamu bisa tunggu pelamar masuk! 🎉` 
        });
      } else {
        clearState(phoneNumber);
        await sock.sendMessage(from, { text: 'Posting lowongan dibatalkan.' });
      }
      
    } else if (session.state === 'choose_lowongan_pelamar') {
      // User pilih lowongan untuk lihat pelamar
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
      
      // Ambil pelamar
      const applicants = await getLowonganApplicants(selectedLowongan.id);
      const listText = formatApplicantsList(applicants, selectedLowongan.posisi);
      await sock.sendMessage(from, { text: listText });
      
      setState(phoneNumber, 'choose_pelamar', { 
        lowonganId: selectedLowongan.id,
        applicants 
      });
      
    } else if (session.state === 'choose_pelamar') {
      // User pilih pelamar untuk lihat detail
      const selectedIndex = parseInt(text) - 1;
      const lamaranId = text.toUpperCase();
      
      let selectedApp;
      
      if (!isNaN(selectedIndex) && session.data.applicants[selectedIndex]) {
        selectedApp = session.data.applicants[selectedIndex];
      } else if (lamaranId.startsWith('LMR')) {
        selectedApp = session.data.applicants.find(a => a.lamaran_id === lamaranId);
      }
      
      if (!selectedApp) {
        await sock.sendMessage(from, { text: 'Pelamar tidak ditemukan!' });
        return;
      }
      
      // Tampilkan detail pelamar
      let detailText = `👤 *Detail Pelamar*\n\n`;
      detailText += `Nama: ${selectedApp.nama_pelamar}\n`;
      detailText += `Alamat: ${selectedApp.alamat}\n`;
      detailText += `No HP: ${selectedApp.no_hp}\n`;
      detailText += `Status: ${selectedApp.status}\n`;
      detailText += `Tanggal Melamar: ${selectedApp.tanggal_melamar}\n\n`;
      
      if (selectedApp.file_cv) {
        detailText += `📄 CV: ${selectedApp.original_filename}\n\n`;
      }
      
      detailText += `━━━━━━━━━━━━━━━━━━━━\n`;
      detailText += `Update status lamaran:\n\n`;
      detailText += `Ketik:\n`;
      detailText += `• *terima ${selectedApp.lamaran_id}* - Terima pelamar\n`;
      detailText += `• *tolak ${selectedApp.lamaran_id}* - Tolak pelamar\n`;
      detailText += `• *proses ${selectedApp.lamaran_id}* - Sedang diproses`;
      
      await sock.sendMessage(from, { text: detailText });
      
      // Kirim file CV kalau ada
      if (selectedApp.file_cv) {
        try {
          const uploadDir = process.env.UPLOAD_DIR || './uploads/cv';
          const filePath = path.join(uploadDir, selectedApp.file_cv);
          
          if (fs.existsSync(filePath)) {
            await sock.sendMessage(from, {
              document: fs.readFileSync(filePath),
              fileName: selectedApp.original_filename,
              mimetype: 'application/pdf'
            });
          }
        } catch (err) {
          console.error('Error sending CV:', err);
        }
      }
      
      clearState(phoneNumber);
      
    } else if (session.state === 'choose_lowongan_kelola') {
      // User pilih lowongan untuk kelola
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
      
      // Tampilkan opsi kelola
      const statusIcon = selectedLowongan.status === 'aktif' ? '🟢' : '🔴';
      let text = `${statusIcon} *${selectedLowongan.posisi}*\n\n`;
      text += `Status: ${selectedLowongan.status}\n`;
      text += `Jumlah Pelamar: ${selectedLowongan.jumlah_pelamar}\n\n`;
      text += `━━━━━━━━━━━━━━━━━━━━\n`;
      text += `Kelola lowongan:\n\n`;
      
      if (selectedLowongan.status === 'aktif') {
        text += `Ketik: *tutup ${selectedLowongan.id}* - Tutup lowongan`;
      } else {
        text += `Ketik: *aktifkan ${selectedLowongan.id}* - Aktifkan lowongan`;
      }
      
      await sock.sendMessage(from, { text });
      clearState(phoneNumber);
    }
    
    // Handle update status lamaran
    if (text.toLowerCase().startsWith('terima ') || 
        text.toLowerCase().startsWith('tolak ') || 
        text.toLowerCase().startsWith('proses ')) {
      
      const parts = text.split(' ');
      const action = parts[0].toLowerCase();
      const lamaranId = parts[1];
      
      let newStatus;
      if (action === 'terima') newStatus = 'diterima';
      else if (action === 'tolak') newStatus = 'ditolak';
      else if (action === 'proses') newStatus = 'diproses';
      
      await updateLamaranStatus(lamaranId, newStatus);
      
      // Kirim notifikasi ke pelamar
      const applicantInfo = await getApplicantInfo(lamaranId);
      if (applicantInfo) {
        const statusEmoji = {
          'diterima': '✅',
          'ditolak': '❌',
          'diproses': '⏳'
        };
        
        const notifText = `🔔 *Update Status Lamaran*\n\nLowongan: ${applicantInfo.posisi}\nPerusahaan: ${applicantInfo.nama_perusahaan}\n\nStatus: ${statusEmoji[newStatus]} ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}\n\n${newStatus === 'diterima' ? 'Selamat! Kamu lolos seleksi.\nHRD akan menghubungi kamu segera untuk tahap selanjutnya.\n\nGood luck! 🎉' : newStatus === 'ditolak' ? 'Mohon maaf, kamu belum lolos seleksi kali ini.\nJangan menyerah, coba lamar lowongan lainnya ya! 💪' : 'Lamaran kamu sedang diproses.\nTunggu kabar selanjutnya ya!'}`;
        
        try {
          await sock.sendMessage(`${applicantInfo.no_wa}@s.whatsapp.net`, {
            text: notifText
          });
        } catch (err) {
          console.error('Error sending notification:', err);
        }
      }
      
      await sock.sendMessage(from, { 
        text: `✅ Status lamaran berhasil diupdate jadi "${newStatus}"!\n\nNotifikasi sudah dikirim ke pelamar.` 
      });
    }
    
    // Handle tutup/aktifkan lowongan
    if (text.toLowerCase().startsWith('tutup ') || text.toLowerCase().startsWith('aktifkan ')) {
      const parts = text.split(' ');
      const action = parts[0].toLowerCase();
      const lowonganId = parts[1];
      
      const newStatus = action === 'tutup' ? 'tutup' : 'aktif';
      await updateLowonganStatus(lowonganId, newStatus);
      
      await sock.sendMessage(from, { 
        text: `✅ Lowongan berhasil di${action}!` 
      });
    }
    
  } catch (err) {
    console.error('Error di handleCompanyFlowState:', err);
    await sock.sendMessage(from, { text: 'Maaf, ada error. Coba lagi ya!' });
    clearState(phoneNumber);
  }
}

export default handleMessage;