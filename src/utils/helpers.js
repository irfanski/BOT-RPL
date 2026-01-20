// Ekstrak nomor WA dari JID
function extractPhoneNumber(jid) {
  return jid.split('@')[0];
}

// Format nomor WA (hapus karakter non-digit)
function formatPhoneNumber(phone) {
  return phone.replace(/\D/g, '');
}

// Generate ID unik untuk database
function generateId(prefix, lastId) {
  if (!lastId) {
    return `${prefix}001`;
  }
  const num = parseInt(lastId.replace(prefix, '')) + 1;
  return `${prefix}${num.toString().padStart(3, '0')}`;
}

// Format tanggal untuk database (YYYY-MM-DD)
function formatDate(date = new Date()) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format currency IDR
function formatCurrency(amount) {
  if (!amount) return 'Nego';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

// Delay helper (untuk simulasi typing)
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Validasi file type
function isValidFileType(mimetype) {
  const validTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  return validTypes.includes(mimetype);
}

// Validasi ukuran file
function isValidFileSize(size, maxSize = 5242880) {
  return size <= maxSize;
}

// Generate nama file unik
function generateFileName(originalName, userId) {
  const ext = originalName.split('.').pop();
  const timestamp = Date.now();
  return `${userId}_${timestamp}.${ext}`;
}

export {
  extractPhoneNumber,
  formatPhoneNumber,
  generateId,
  formatDate,
  formatCurrency,
  delay,
  isValidFileType,
  isValidFileSize,
  generateFileName
};