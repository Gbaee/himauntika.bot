// index.js (FINAL) - Bot HIMAUNTIKA dengan Data Kas Lengkap + Fitur Tag All
// Dependencies: @whiskeysockets/baileys, qrcode-terminal, node-cron, pino
// Install: npm i @whiskeysockets/baileys qrcode-terminal node-cron pino

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import { Boom } from "@hapi/boom";
import qrcode from "qrcode-terminal";
import cron from "node-cron";

// --------------------
// CONFIG / DEFAULTS
// --------------------
const ADMIN_DEFAULT = ["6285600829369", "62895623170103", "6289603217569"]; // digits only

const FILE_CONFIG = "hima_config.json";
const FILE_AGENDA = "agenda.json";
const FILE_PIKET_WEEK = "piket_week.json";
const FILE_PIKET_PHOTOS = "piket_photos.json";
const FILE_DAFTAR_HADIR = "daftar_hadir.txt";
const FILE_TIDAK_HADIR = "daftar_tidak_hadir.txt";
const FILE_PENGUMUMAN = "pengumuman.txt";
const FILE_KAS_DATA = "kas_data.json"; // File untuk data kas interaktif

// ensure files exist
if (!fs.existsSync(FILE_CONFIG))
  fs.writeFileSync(FILE_CONFIG, JSON.stringify({}, null, 2));
if (!fs.existsSync(FILE_AGENDA))
  fs.writeFileSync(FILE_AGENDA, JSON.stringify([], null, 2));
if (!fs.existsSync(FILE_PIKET_WEEK))
  fs.writeFileSync(FILE_PIKET_WEEK, JSON.stringify({}, null, 2));
if (!fs.existsSync(FILE_PIKET_PHOTOS))
  fs.writeFileSync(FILE_PIKET_PHOTOS, JSON.stringify({}, null, 2));
if (!fs.existsSync(FILE_DAFTAR_HADIR)) fs.writeFileSync(FILE_DAFTAR_HADIR, "");
if (!fs.existsSync(FILE_TIDAK_HADIR)) fs.writeFileSync(FILE_TIDAK_HADIR, "");
if (!fs.existsSync(FILE_PENGUMUMAN)) fs.writeFileSync(FILE_PENGUMUMAN, "");
if (!fs.existsSync(FILE_KAS_DATA)) {
  // DATA KAS LENGKAP SUDAH DIMASUKKAN - TARGET Rp 5.000
  const initialKasData = {
    targetPerMinggu: 5000, // DIUBAH MENJADI 5000
    anggota: {
      "Agus Nugrohojati": { totalBayar: 50000, status: "lunas" },
      "Bisri Sulhi": { totalBayar: 30000, status: "lunas" },
      "Chantika Haerul Putri": { totalBayar: 70000, status: "lunas" },
      "Esai Septiana": { totalBayar: 80000, status: "lunas" },
      "Felix Ando Tokysia": { totalBayar: 130000, status: "lunas" },
      "Layyinatus Syifa": { totalBayar: 90000, status: "lunas" },
      "Lutfi Azami Kusuma": { totalBayar: 110000, status: "lunas" },
      "Muhamad Eko Maulana": { totalBayar: 30000, status: "lunas" },
      "Muhammad Ikbaar Agassy": { totalBayar: 65000, status: "lunas" },
      "Nabihi Ramadhani": { totalBayar: 110000, status: "lunas" },
      "Nabila Vidia Putri": { totalBayar: 120000, status: "lunas" },
      "Naza Salsabila": { totalBayar: 50000, status: "lunas" },
      "Nazwa Amelia": { totalBayar: 90000, status: "lunas" },
      "Raja Akbar Sanjaini": { totalBayar: 55000, status: "lunas" },
      "Rifky Apriansyah": { totalBayar: 50000, status: "lunas" },
      "Rizki Adnan Halim": { totalBayar: 20000, status: "kurang" },
      "Rulie Pernanda Kesuma": { totalBayar: 65000, status: "lunas" },
      "Wanda Sofiah": { totalBayar: 90000, status: "lunas" },
      "Zamar Balfas Abdullah": { totalBayar: 130000, status: "lunas" }
    },
    history: [],
    settings: {
      rekening: "123-456-7890 (BRI) - AN. BENDHARA HIMAUNTIKA",
      batasWaktu: "Setiap Sabtu minggu ini",
      adminKas: ["6285600829369"]
    }
  };
  fs.writeFileSync(FILE_KAS_DATA, JSON.stringify(initialKasData, null, 2));
}

// helpers
const readJSON = (path, def) => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8") || JSON.stringify(def));
  } catch {
    return def;
  }
};
const saveJSON = (path, obj) =>
  fs.writeFileSync(path, JSON.stringify(obj, null, 2));
const digitsOnly = (s) => (s || "").toString().replace(/[^0-9]/g, "");
const nowDate = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const weekDayName = (date = new Date()) =>
  date.toLocaleDateString("en-US", { weekday: "long" }); // Monday, Tuesday, ...

// helper untuk membaca daftar dari file
const readDaftar = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .filter((name, index, self) => self.indexOf(name) === index); // remove duplicates
};

// helper untuk menulis daftar ke file
const writeDaftar = (filePath, daftar) => {
  fs.writeFileSync(filePath, daftar.join("\n"));
};

// --------------------
// KAS SYSTEM - INTERAKTIF & MENARIK
// --------------------
class KasSystem {
  constructor() {
    this.targetPerMinggu = 5000; // DIUBAH MENJADI 5000
  }

  getMingguKe() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    return Math.ceil(diff / oneWeek);
  }

  generateProgressBar(percentage, length = 10) {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '🟩'.repeat(filled) + '⬜'.repeat(empty);
  }

  getStatusEmoji(status) {
    const statusMap = {
      'lunas': '✅',
      'kurang': '⚠️',
      'belum': '❌',
      'pending': '🕒'
    };
    return statusMap[status] || '❓';
  }

  // Format currency Indonesia
  formatRupiah(angka) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(angka);
  }

  // Hitung statistik kas
  calculateStats(kasData) {
    const anggota = kasData.anggota || {};
    const totalAnggota = Object.keys(anggota).length;
    let sudahLunas = 0;
    let belumBayar = 0;
    let kurangBayar = 0;
    let totalTerkumpul = 0;

    Object.values(anggota).forEach(anggota => {
      totalTerkumpul += anggota.totalBayar || 0;
      if (anggota.status === 'lunas') sudahLunas++;
      else if (anggota.status === 'belum') belumBayar++;
      else if (anggota.status === 'kurang') kurangBayar++;
    });

    const progress = totalAnggota > 0 ? Math.round((sudahLunas / totalAnggota) * 100) : 0;

    return {
      totalAnggota,
      sudahLunas,
      belumBayar,
      kurangBayar,
      totalTerkumpul,
      progress
    };
  }

  // Generate laporan kas yang menarik
  generateLaporanKas(kasData) {
    const stats = this.calculateStats(kasData);
    const mingguKe = this.getMingguKe();
    const settings = kasData.settings || {};

    let message = `💰 *LAPORAN KAS HIMAUNTIKA - MINGGU ${mingguKe}*\n\n`;
    
    // HEADER DENGAN EMOJI MENARIK
    message += `🎯 *TARGET:* ${this.formatRupiah(this.targetPerMinggu)} / orang\n`;
    message += `📅 *BATAS WAKTU:* ${settings.batasWaktu || "Setiap Sabtu"}\n\n`;
    
    // STATISTIK DENGAN PROGRESS BAR
    message += `📊 *STATISTIK KAS:*\n`;
    message += `${this.generateProgressBar(stats.progress)} ${stats.progress}%\n\n`;
    
    message += `✅ Lunas: ${stats.sudahLunas} orang\n`;
    message += `⚠️ Kurang: ${stats.kurangBayar} orang\n`;
    message += `❌ Belum: ${stats.belumBayar} orang\n`;
    message += `👥 Total: ${stats.totalAnggota} orang\n`;
    message += `💵 Total Tabungan: ${this.formatRupiah(stats.totalTerkumpul)}\n\n`;

    // YANG BELUM LUNAS (jika ada)
    const belumLunas = Object.entries(kasData.anggota || {})
      .filter(([nama, data]) => data.status !== 'lunas')
      .slice(0, 10); // Batasi 10 orang saja

    if (belumLunas.length > 0) {
      message += `📋 *YANG BELUM LUNAS:*\n`;
      belumLunas.forEach(([nama, data], index) => {
        const emoji = this.getStatusEmoji(data.status);
        message += `${emoji} ${nama}: ${this.formatRupiah(data.totalBayar || 0)}`;
        if (data.status === 'kurang') {
          const kurang = this.targetPerMinggu - (data.totalBayar || 0);
          message += ` (Kurang ${this.formatRupiah(kurang)})`;
        }
        message += `\n`;
      });
      
      if (belumLunas.length > 10) {
        message += `... dan ${belumLunas.length - 10} orang lainnya\n`;
      }
      message += `\n`;
    }

    // TOP 5 KONTRIBUTOR
    const topContributors = Object.entries(kasData.anggota || {})
      .sort(([,a], [,b]) => (b.totalBayar || 0) - (a.totalBayar || 0))
      .slice(0, 5);

    if (topContributors.length > 0) {
      message += `🏆 *TOP 5 KONTRIBUTOR:*\n`;
      topContributors.forEach(([nama, data], index) => {
        const trophy = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "⭐";
        message += `${trophy} ${nama}: ${this.formatRupiah(data.totalBayar || 0)}\n`;
      });
      message += `\n`;
    }

    // INSTRUKSI PEMBAYARAN
    message += `💳 *CARA BAYAR:*\n`;
    message += `1. Transfer ke: ${settings.rekening || "Bendahara HIMAUNTIKA"}\n`;
    message += `2. Konfirmasi dengan: !bayarkas <jumlah>\n`;
    message += `3. Admin akan verifikasi pembayaran\n\n`;

    // QUICK ACTIONS
    message += `⚡ *QUICK ACTIONS:*\n`;
    message += `• !statuskas - Cek status pembayaranmu\n`;
    message += `• !bayarkas <jumlah> - Konfirmasi pembayaran\n`;
    message += `• !leaderboard - Ranking pembayaran kas\n`;

    return message;
  }

  // Update status anggota berdasarkan pembayaran
  updateStatusAnggota(anggota, jumlahBayar) {
    const totalBayar = (anggota.totalBayar || 0) + jumlahBayar;
    
    if (totalBayar >= this.targetPerMinggu) {
      return { ...anggota, totalBayar, status: 'lunas' };
    } else if (totalBayar > 0) {
      return { ...anggota, totalBayar, status: 'kurang' };
    } else {
      return { ...anggota, totalBayar, status: 'belum' };
    }
  }

  // Tambah history transaksi
  addHistory(kasData, nama, jumlah, status) {
    const history = kasData.history || [];
    history.unshift({
      nama,
      jumlah,
      status,
      tanggal: new Date().toLocaleString('id-ID'),
      minggu: this.getMingguKe()
    });
    
    // Simpan max 50 transaksi terakhir
    kasData.history = history.slice(0, 50);
    return kasData;
  }

  // Generate leaderboard
  generateLeaderboard(kasData) {
    const anggota = kasData.anggota || {};
    
    // Urutkan berdasarkan total bayar (descending)
    const ranking = Object.entries(anggota)
      .sort(([,a], [,b]) => (b.totalBayar || 0) - (a.totalBayar || 0));
    
    let message = `🏆 *LEADERBOARD KAS HIMAUNTIKA*\n\n`;
    
    if (ranking.length > 0) {
      ranking.forEach(([nama, data], index) => {
        const trophy = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🔸";
        const emoji = this.getStatusEmoji(data.status);
        message += `${trophy} *${nama}* - ${this.formatRupiah(data.totalBayar || 0)} ${emoji}\n`;
      });
    } else {
      message += `📝 Belum ada data pembayaran kas.\n`;
      message += `Jadilah yang pertama bayar kas! 💪`;
    }
    
    message += `\n💰 *Total Tabungan Organisasi:* ${this.formatRupiah(this.calculateStats(kasData).totalTerkumpul)}`;
    message += `\n💪 *Ayo bayar kas dan naikkan rankingmu!*`;
    
    return message;
  }

  // Generate status individu
  generateStatusIndividu(kasData, nama) {
    const anggota = kasData.anggota || {};
    const dataSaya = anggota[nama];
    
    let message = `👤 *STATUS KAS - ${nama}*\n\n`;
    
    if (dataSaya) {
      const emoji = this.getStatusEmoji(dataSaya.status);
      message += `${emoji} *Status:* ${dataSaya.status.toUpperCase()}\n`;
      message += `💵 *Total Bayar:* ${this.formatRupiah(dataSaya.totalBayar || 0)}\n`;
      message += `🎯 *Target per Minggu:* ${this.formatRupiah(this.targetPerMinggu)}\n`;
      
      if (dataSaya.status === 'kurang') {
        const kurang = this.targetPerMinggu - (dataSaya.totalBayar || 0);
        message += `⚠️ *Kurang:* ${this.formatRupiah(kurang)}\n`;
      }
      
      // Hitung sudah berapa minggu
      const mingguSudahBayar = Math.floor((dataSaya.totalBayar || 0) / this.targetPerMinggu);
      message += `📅 *Minggu Sudah Bayar:* ${mingguSudahBayar} minggu\n\n`;
      
      message += `💡 *Info:*\n`;
      message += `• Target mingguan: ${this.formatRupiah(this.targetPerMinggu)}\n`;
      message += `• Gunakan !bayarkas <jumlah> untuk konfirmasi\n`;
      message += `• Batas waktu: Setiap Sabtu\n`;
    } else {
      message += `❌ *Belum terdaftar dalam sistem kas*\n\n`;
      message += `💡 *Cara daftar:*\n`;
      message += `Lakukan pembayaran pertama dengan:\n`;
      message += `!bayarkas <jumlah>\n\n`;
      message += `Contoh: !bayarkas 5000`;
    }
    
    return message;
  }

  // Generate pesan pengingat personal
  generatePengingatPersonal(kasData) {
    const anggota = kasData.anggota || {};
    const pengingat = [];
    
    Object.entries(anggota).forEach(([nama, data]) => {
      if (data.status !== 'lunas') {
        const firstName = nama.split(' ')[0];
        let pesan = `Halo *${firstName}* 👋\n\n`;
        
        if (data.status === 'belum') {
          pesan += `Kamu *belum membayar uang kas* untuk minggu ini. `;
          pesan += `Total yang sudah kamu bayar: *${this.formatRupiah(data.totalBayar || 0)}*\n\n`;
          pesan += `💡 *Info:*\n`;
          pesan += `• Target per minggu: ${this.formatRupiah(this.targetPerMinggu)}\n`;
          pesan += `• Batas waktu: Setiap Sabtu\n`;
          pesan += `• Gunakan !bayarkas <jumlah> untuk konfirmasi\n\n`;
          pesan += `Ayo segera bayar kas untuk mendukung kegiatan HIMAUNTIKA! 🎉`;
        } else if (data.status === 'kurang') {
          const kurang = this.targetPerMinggu - (data.totalBayar || 0);
          pesan += `Kamu *masih memiliki tunggakan* sebesar *${this.formatRupiah(kurang)}*. `;
          pesan += `Total yang sudah kamu bayar: *${this.formatRupiah(data.totalBayar || 0)}*\n\n`;
          pesan += `💡 *Info:*\n`;
          pesan += `• Kurang: ${this.formatRupiah(kurang)} untuk mencapai target\n`;
          pesan += `• Target per minggu: ${this.formatRupiah(this.targetPerMinggu)}\n`;
          pesan += `• Gunakan !bayarkas <jumlah> untuk melunasi\n\n`;
          pesan += `Yuk segera lunasi agar tidak menumpuk! 💪`;
        }
        
        pengingat.push({
          nama: nama,
          pesan: pesan
        });
      }
    });
    
    return pengingat;
  }
}

const kasSystem = new KasSystem();

// --------------------
// LOG TIMEZONE INFO
// --------------------
console.log("🤖 Bot HIMAUNTIKA starting...");
console.log("📍 Server Time:", new Date().toString());
console.log("📍 Jakarta Time:", new Date().toLocaleString("id-ID", {timeZone: "Asia/Jakarta"}));

// --------------------
// START BOT
// --------------------
async function startBot() {
  // auth state
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  // connection updates + show QR
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log(
        "📲 Scan QR code berikut untuk login (pakai WhatsApp > Perangkat Tertaut > Scan):"
      );
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect =
        !(lastDisconnect?.error instanceof Boom) ||
        lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;
      console.log("❌ Koneksi terputus. reconnect:", shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("✅ Bot WhatsApp berhasil terhubung!");
      console.log("⏰ Cron jobs scheduled for WIB timezone:");
      console.log("   - Kas: Senin, Rabu, Jumat 12:00 & 20:00 WIB");
      console.log("   - Agenda: Senin 10:00 WIB");
      console.log("   - Piket: Setiap hari kerja 08:00 & 18:00 WIB");
      console.log("   - Piket Pagi: 12:00 WIB");
      console.log("   - Piket Malam: 19:30 WIB");
      console.log("   - Piket Check: 22:00 WIB");
    }
  });

  // --------------------
  // NEW KAS REMINDER SYSTEM - INTERAKTIF
  // --------------------
  
  async function sendKasReminder() {
    try {
      console.log("💰 Kas reminder triggered at", new Date().toLocaleString("id-ID"));
      
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      
      if (!target) {
        console.log("❌ Kas reminder: Group JID not set");
        return;
      }

      const kasData = readJSON(FILE_KAS_DATA, {});
      const message = kasSystem.generateLaporanKas(kasData);

      await sock.sendMessage(target, { text: message });
      console.log("✅ Kas reminder sent to", target);
      
    } catch (e) {
      console.error("❌ Error kas reminder:", e.message);
      
      // Fallback ke pesan sederhana jika error
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      if (target) {
        await sock.sendMessage(target, {
          text: `💰 *PENGINGAT KAS HIMAUNTIKA*\n\nJangan lupa setor kas minggu ini sebesar Rp 5.000\n\nGunakan !kas untuk melihat laporan detail\n\n⚠️ *Note:* Sedang ada gangguan sistem laporan.`
        });
      }
    }
  }

  // Fungsi untuk mengirim pengingat personal ke anggota yang belum bayar
  async function sendPersonalReminders() {
    try {
      console.log("🔔 Personal kas reminders triggered at", new Date().toLocaleString("id-ID"));
      
      const kasData = readJSON(FILE_KAS_DATA, {});
      const pengingatPersonal = kasSystem.generatePengingatPersonal(kasData);
      
      if (pengingatPersonal.length === 0) {
        console.log("✅ Semua anggota sudah lunas, tidak ada pengingat personal");
        return;
      }
      
      // Untuk pengingat personal, kita akan kirim ke group saja
      // Dalam implementasi real, bisa dikirim ke nomor pribadi masing-masing
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      
      if (!target) {
        console.log("❌ Personal reminders: Group JID not set");
        return;
      }
      
      let summaryMessage = `🔔 *PENGINGAT KAS PERSONAL*\n\n`;
      summaryMessage += `Berikut anggota yang belum melunasi kas:\n\n`;
      
      pengingatPersonal.forEach((reminder, index) => {
        summaryMessage += `${index + 1}. *${reminder.nama}* - `;
        const data = kasData.anggota[reminder.nama];
        if (data.status === 'belum') {
          summaryMessage += `Belum bayar minggu ini\n`;
        } else {
          const kurang = kasSystem.targetPerMinggu - (data.totalBayar || 0);
          summaryMessage += `Kurang ${kasSystem.formatRupiah(kurang)}\n`;
        }
      });
      
      summaryMessage += `\n💡 *Info untuk yang belum bayar:*\n`;
      summaryMessage += `• Gunakan !statuskas untuk cek status detail\n`;
      summaryMessage += `• Gunakan !bayarkas <jumlah> untuk konfirmasi pembayaran\n`;
      summaryMessage += `• Transfer ke: ${kasData.settings?.rekening || "Bendahara HIMAUNTIKA"}\n\n`;
      summaryMessage += `Ayo segera lunasi kewajiban kasmu! 💪`;
      
      await sock.sendMessage(target, { text: summaryMessage });
      console.log(`✅ Personal reminders sent for ${pengingatPersonal.length} members`);
      
    } catch (e) {
      console.error("❌ Error personal reminders:", e.message);
    }
  }

  // Kas Reminder: Senin, Rabu, Jumat jam 12:00 WIB
  cron.schedule("0 12 * * 1,3,5", sendKasReminder, { timezone: "Asia/Jakarta" });

  // Kas Reminder: Senin, Rabu, Jumat jam 20:00 WIB  
  cron.schedule("0 20 * * 1,3,5", sendKasReminder, { timezone: "Asia/Jakarta" });

  // Pengingat Personal: Selasa & Kamis jam 10:00 WIB
  cron.schedule("0 10 * * 2,4", sendPersonalReminders, { timezone: "Asia/Jakarta" });

  // Reset kas mingguan setiap Senin pagi
  cron.schedule("0 8 * * 1", () => {
    try {
      const kasData = readJSON(FILE_KAS_DATA, {});
      // Reset status semua anggota ke "belum" tapi keep total bayar (tabungan)
      Object.keys(kasData.anggota || {}).forEach(nama => {
        // Hanya reset status, total bayar tetap (tabungan)
        const currentTotal = kasData.anggota[nama].totalBayar || 0;
        kasData.anggota[nama] = {
          ...kasData.anggota[nama],
          totalBayar: currentTotal, // Tetap simpan tabungan
          status: currentTotal >= kasSystem.targetPerMinggu ? 'lunas' : 'belum'
        };
      });
      
      saveJSON(FILE_KAS_DATA, kasData);
      console.log("🔄 Status kas direset untuk minggu baru (tabungan tetap)");
    } catch (error) {
      console.error("❌ Error reset kas:", error.message);
    }
  }, { timezone: "Asia/Jakarta" });

  // --------------------
  // JADWAL LAINNYA (TETAP SAMA)
  // --------------------

  // Pengingat Agenda: Senin 10:00 WIB
  cron.schedule("0 10 * * 1", async () => {
    try {
      console.log("🕙 Agenda reminder triggered at", new Date().toLocaleString("id-ID"));
      
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      
      if (!target) {
        console.log("❌ Agenda reminder: Group JID not set");
        return;
      }

      const agendaLink = cfg.agendaLink || "https://docs.google.com/spreadsheets/d/1vdx7c-PFmcayAG8IAd4__2jwMJr7A_B4UBrl3vX6pTc/edit?usp=sharing";
      const text = `📌 *Pengingat Agenda Mingguan*\nKoordinator: mohon update agenda minimal 3 hari sebelum acara.\nLink agenda: ${agendaLink}\nUntuk menambah cepat: *!addagenda Judul | YYYY-MM-DD | Catatan*`;
      
      await sock.sendMessage(target, { text });
      console.log("✅ Agenda reminder sent to", target);
      
    } catch (e) {
      console.error("❌ Error agenda reminder:", e.message);
    }
  }, { timezone: "Asia/Jakarta" });

  // Piket announce daily 08:00 WIB for Mon-Fri
  cron.schedule("0 8 * * 1-5", async () => {
    try {
      console.log("🧹 Piket announce triggered at", new Date().toLocaleString("id-ID"));
      
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      
      if (!target) {
        console.log("❌ Piket announce: Group JID not set");
        return;
      }

      const piketWeek = readJSON(FILE_PIKET_WEEK, {});
      const todayName = weekDayName();
      const list = piketWeek[todayName] || [];
      
      let msg = `🧹 *Jadwal Piket Hari Ini (${todayName})*\n\n`;
      if (list.length) {
        msg += list.map((n, i) => `${i + 1}. ${n}`).join("\n");
        msg += `\n\n📸 Yang piket diminta upload foto hasil piket dengan caption '!foto' di grup.`;
      } else {
        const link = cfg.piketLink || "https://docs.google.com/spreadsheets/d/19gFDW1HIy1stDEP0OrPW8mkZS4y6Ip1QlljiyZ03-B0/edit?usp=sharing";
        msg += `Belum ada jadwal piket mingguan diset. Silakan cek: ${link}\nAdmin bisa set otomatis dengan: !setpiketweek MONDAY | nama1, nama2`;
      }
      
      await sock.sendMessage(target, { text: msg });
      console.log("✅ Piket announce sent to", target);
      
    } catch (e) {
      console.error("❌ Error piket announce:", e.message);
    }
  }, { timezone: "Asia/Jakarta" });

  // Piket verification daily 18:00 WIB (Mon-Fri)
  cron.schedule("0 18 * * 1-5", async () => {
    try {
      console.log("📸 Piket verification triggered at", new Date().toLocaleString("id-ID"));
      
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      
      if (!target) {
        console.log("❌ Piket verification: Group JID not set");
        return;
      }

      const photos = readJSON(FILE_PIKET_PHOTOS, {});
      const piketWeek = readJSON(FILE_PIKET_WEEK, {});
      const todayName = weekDayName();
      const expected = piketWeek[todayName] || [];
      
      if (!expected.length) {
        console.log("ℹ️ No piket scheduled for today");
        return;
      }

      const todayKey = nowDate();
      const uploaded = (photos[todayKey] || []).map((p) => p.name);
      const notSent = expected.filter((n) => !uploaded.includes(n));
      
      if (notSent.length === 0) {
        await sock.sendMessage(target, {
          text: "✅ Semua petugas piket hari ini sudah upload foto. Terima kasih!",
        });
      } else {
        await sock.sendMessage(target, {
          text: `⚠️ Petugas berikut belum upload foto piket:\n\n${notSent
            .map((n, i) => `${i + 1}. ${n}`)
            .join("\n")}\n\nMohon segera upload bukti atau konfirmasi.`,
        });
      }
      
      console.log("✅ Piket verification check done for", todayKey);
      
    } catch (e) {
      console.error("❌ Error piket verification:", e.message);
    }
  }, { timezone: "Asia/Jakarta" });

  // --------------------
  // PIKET PAGI & MALAM - WIB TIMEZONE
  // --------------------

  // helper: send text only to HIMAUNTIKA group
  async function sendToHimauntikaGroup(text) {
    try {
      const cfg = readJSON(FILE_CONFIG, {});
      const target = cfg.groupJid;
      if (!target) {
        console.log("❌ Grup HIMAUNTIKA belum diset. Gunakan !setgroup di grup HIMAUNTIKA.");
        return;
      }
      await sock.sendMessage(target, { text });
      console.log("✅ Pesan piket terkirim ke grup HIMAUNTIKA:", target);
    } catch (err) {
      console.error("❌ Gagal mengirim pesan ke grup HIMAUNTIKA:", err);
    }
  }

  // 12:00 WIB — Pengingat piket kelas pagi (Senin - Jumat)
  cron.schedule("0 12 * * 1-5", async () => {
    try {
      console.log("🌅 Piket pagi reminder triggered at", new Date().toLocaleString("id-ID"));
      
      const piketWeek = readJSON(FILE_PIKET_WEEK, {});
      const todayName = weekDayName();
      const list = piketWeek[todayName] || [];

      let msg = `🧹 *Pengingat Piket Kelas Pagi (${todayName})*\n\n`;
      if (list.length) {
        msg += list.map((n, i) => `${i + 1}. ${n}`).join("\n");
        msg += `\n\n📸 Harap lakukan piket dan kirim bukti foto dengan caption *!foto* di grup pada hari ini.`;
      } else {
        msg += `Belum ada jadwal piket terdata untuk hari ini.`;
      }

      await sendToHimauntikaGroup(msg);
      console.log("✅ Pengingat piket pagi terkirim ke grup HIMAUNTIKA.");
      
    } catch (err) {
      console.error("❌ Error pengingat piket pagi:", err);
    }
  }, { timezone: "Asia/Jakarta" });

  // 19:30 WIB — Pengingat piket kelas malam (Senin - Jumat)
  cron.schedule("30 19 * * 1-5", async () => {
    try {
      console.log("🌙 Piket malam reminder triggered at", new Date().toLocaleString("id-ID"));
      
      const piketWeek = readJSON(FILE_PIKET_WEEK, {});
      const todayName = weekDayName();
      const list = piketWeek[todayName] || [];

      let msg = `🌙 *Pengingat Piket Kelas Malam (${todayName})*\n\n`;
      if (list.length) {
        msg += list.map((n, i) => `${i + 1}. ${n}`).join("\n");
        msg += `\n\n📸 Ingat untuk mengirim foto bukti piket dengan caption *!foto* sebelum jam 22.00 WIB.`;
      } else {
        msg += `Belum ada jadwal piket terdata untuk hari ini.`;
      }

      await sendToHimauntikaGroup(msg);
      console.log("✅ Pengingat piket malam terkirim ke grup HIMAUNTIKA.");
      
    } catch (err) {
      console.error("❌ Error pengingat piket malam:", err);
    }
  }, { timezone: "Asia/Jakarta" });

  // 22:00 WIB — Cek apakah ada foto piket malam
  cron.schedule("0 22 * * 1-5", async () => {
    try {
      console.log("📸 Piket night check triggered at", new Date().toLocaleString("id-ID"));
      
      const piketWeek = readJSON(FILE_PIKET_WEEK, {});
      const photos = readJSON(FILE_PIKET_PHOTOS, {});
      const todayName = weekDayName();
      const todayKey = nowDate();
      const expected = piketWeek[todayName] || [];

      if (!expected.length) {
        console.log("ℹ️ No piket scheduled for today");
        return;
      }

      const uploaded = (photos[todayKey] || []).map((p) => p.name);
      const notSent = expected.filter((n) => !uploaded.includes(n));

      // if none uploaded (everyone missing) -> send "tidak piket"
      if (notSent.length === expected.length) {
        const text = `⚠️ *Tidak ada bukti foto piket malam hari ini (${todayName}).*\n\nPesan otomatis: _\"tidak piket karena tidak ada bukti foto\"_.\n\nDaftar piket hari ini:\n${expected
          .map((n, i) => `${i + 1}. ${n}`)
          .join("\n")}`;
        await sendToHimauntikaGroup(text);
        console.log("⚠️ Pesan otomatis 'tidak piket' terkirim ke grup HIMAUNTIKA.");
      } else {
        console.log("✅ Ada sebagian foto piket terkirim; tidak kirim pesan 'tidak piket'.");
      }
    } catch (err) {
      console.error("❌ Error cek foto piket malam:", err);
    }
  }, { timezone: "Asia/Jakarta" });

  // --------------------
  // MESSAGE HANDLER - DENGAN FITUR KAS BARU & TAG ALL
  // --------------------
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg || !msg.message || msg.key.fromMe) return;

      // message content (various types)
      const pesan =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";

      const groupJid = msg.key.remoteJid; // group JID or individual
      const pengirim = msg.key.participant || msg.key.remoteJid; // sender JID
      const pushName = msg.pushName || "Tanpa Nama";
      const textRaw = (pesan || "").toString();
      const text = textRaw.trim();
      const textLower = text.toLowerCase();

      // determine admin: group admin OR default admin numbers
      let isAdmin = false;
      if (groupJid && groupJid.endsWith("@g.us")) {
        try {
          const meta = await sock.groupMetadata(groupJid);
          const admins = meta.participants
            .filter((p) => p.admin !== null)
            .map((p) => p.id);
          if (admins.includes(pengirim)) isAdmin = true;
        } catch (e) {
          // ignore metadata errors
        }
      }
      if (ADMIN_DEFAULT.includes(digitsOnly(pengirim))) isAdmin = true;

      // --- handle image/video with caption '!foto' for piket verification ---
      if (
        (msg.message.imageMessage || msg.message.videoMessage) &&
        textLower.includes("!foto")
      ) {
        // store record
        const photos = readJSON(FILE_PIKET_PHOTOS, {});
        const today = nowDate();
        if (!photos[today]) photos[today] = [];
        // avoid duplicate by same jid
        const exists = (photos[today] || []).some((p) => p.jid === pengirim);
        if (!exists) {
          photos[today].push({
            jid: pengirim,
            name: pushName,
            time: new Date().toLocaleString("id-ID"),
          });
          saveJSON(FILE_PIKET_PHOTOS, photos);
        }
        await sock.sendMessage(groupJid, {
          text: `✅ Terima kasih ${pushName}, foto piket kamu sudah tercatat.`,
        });
        return;
      }

      // only handle commands starting with "!"
      if (!text.startsWith("!")) return;

      // ---------- CORE COMMANDS ----------
      // !menu
      if (textLower === "!menu") {
        const menuText = `📋 *Menu Bot HIMAUNTIKA*

🔹 !halo — Sapa bot
🔹 !jadwal — Lihat jadwal kegiatan
🔹 !acara — Info acara terbaru
🔹 !divisi — Daftar divisi HIMAUNTIKA
🔹 !absen — Memulai sesi absensi
🔹 !hadir — Tandai kamu hadir
🔹 !tidakhadir — Tandai kamu tidak hadir
🔹 !lihatabsen — Lihat daftar hadir & tidak hadir
🔹 !jumlahabsen — Total kehadiran & ketidakhadiran
🔹 !resetabsen — Reset absen (hanya admin)
🔹 !pengumuman — Lihat pengumuman
🔹 !setpengumuman <teks> — Set pengumuman (hanya admin)

💰 *Fitur Kas Interaktif:*
🔹 !kas — Laporan kas terkini
🔹 !statuskas — Cek status pembayaranmu
🔹 !bayarkas <jumlah> — Konfirmasi pembayaran
🔹 !leaderboard — Ranking pembayaran kas
🔹 !verifikasikas <nama> — Verifikasi pembayaran (admin)
🔹 !settarget <jumlah> — Set target kas (admin)
🔹 !setrekening <info> — Set info rekening (admin)

✨ *Fitur Manajemen & Reminder:*
🔹 !setgroup — Set grup target untuk pengingat (admin)
🔹 !setagendalink <link> — Simpan link agenda (admin)
🔹 !setpiketlink <link> — Simpan link piket (admin)
🔹 !addagenda Judul | YYYY-MM-DD | Catatan — Tambah agenda
🔹 !listagenda — Lihat semua agenda
🔹 !hapusagenda <nomor> — Hapus agenda (admin)
🔹 !setpiketweek WEEKDAY | name1, name2 — Set jadwal piket (admin)
🔹 !listpiketweek — Lihat jadwal piket mingguan
🔹 !piket — Lihat jadwal piket hari ini
🔹 !agendalink — Lihat link agenda

👥 *Fitur Grup:*
🔹 !tagall <pesan> — Tag semua anggota grup (hanya admin)

💡 *Pengingat otomatis (hanya di grup HIMAUNTIKA):*
💰 Kas: Senin, Rabu, Jumat (12:00 & 20:00 WIB)
📅 Agenda: Senin (10:00 WIB)
🧹 Piket: Setiap hari kerja (08:00 & 18:00 WIB)
🕛 Piket Pagi: 12:00 WIB
🕢 Piket Malam: 19:30 WIB
🕙 Piket Check: 22:00 WIB

💡 Hanya pesan diawali "!" yang akan diproses.`;
        await sock.sendMessage(groupJid, { text: menuText });
        return;
      }

      // ---------- FITUR TAG ALL BARU ----------
      // !tagall <pesan> - Tag semua anggota grup
      if (textLower.startsWith("!tagall")) {
        if (!isAdmin) {
          await sock.sendMessage(groupJid, { 
            text: "🚫 Hanya admin yang bisa menggunakan perintah !tagall." 
          });
          return;
        }

        if (!groupJid.endsWith("@g.us")) {
          await sock.sendMessage(groupJid, { 
            text: "❌ Perintah !tagall hanya bisa digunakan di grup." 
          });
          return;
        }

        try {
          const pesanTag = text.slice("!tagall".length).trim();
          const groupMetadata = await sock.groupMetadata(groupJid);
          const participants = groupMetadata.participants;
          
          // Filter untuk menghilangkan bot dari daftar tag
          const filteredParticipants = participants.filter(p => !p.id.includes('status') && !p.id.includes('broadcast'));
          
          if (filteredParticipants.length === 0) {
            await sock.sendMessage(groupJid, { 
              text: "❌ Tidak ada anggota yang bisa di-tag." 
            });
            return;
          }

          // Buat daftar mention
          const mentions = filteredParticipants.map(p => p.id);
          const mentionTexts = filteredParticipants.map(p => `@${p.id.split('@')[0]}`);
          
          let message = `🔔 *PEMBERITAHUAN UNTUK SEMUA ANGGOTA* 🔔\n\n`;
          
          if (pesanTag) {
            message += `${pesanTag}\n\n`;
          } else {
            message += `*Ada pengumuman penting untuk semua anggota HIMAUNTIKA!* 📢\n\n`;
          }
          
          message += `📋 *Daftar Anggota:*\n`;
          message += mentionTexts.join('\n');
          
          message += `\n\n💡 *Total: ${filteredParticipants.length} anggota*`;
          
          await sock.sendMessage(groupJid, { 
            text: message,
            mentions: mentions
          });
          
          console.log(`✅ Tag all berhasil untuk ${filteredParticipants.length} anggota`);
          
        } catch (error) {
          console.error("❌ Error tag all:", error);
          await sock.sendMessage(groupJid, { 
            text: "❌ Gagal melakukan tag all. Pastikan bot adalah admin grup." 
          });
        }
        return;
      }

      // ---------- FITUR KAS INTERAKTIF BARU ----------
      // !kas - Laporan kas interaktif
      if (textLower === "!kas") {
        try {
          const kasData = readJSON(FILE_KAS_DATA, {});
          const message = kasSystem.generateLaporanKas(kasData);
          await sock.sendMessage(groupJid, { text: message });
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal memuat data kas. Coba lagi nanti."
          });
        }
        return;
      }

      // !statuskas - Cek status individu
      if (textLower === "!statuskas") {
        try {
          const kasData = readJSON(FILE_KAS_DATA, {});
          const message = kasSystem.generateStatusIndividu(kasData, pushName);
          await sock.sendMessage(groupJid, { text: message });
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal memuat status kas."
          });
        }
        return;
      }

      // !leaderboard - Ranking kas
      if (textLower === "!leaderboard") {
        try {
          const kasData = readJSON(FILE_KAS_DATA, {});
          const message = kasSystem.generateLeaderboard(kasData);
          await sock.sendMessage(groupJid, { text: message });
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal memuat leaderboard."
          });
        }
        return;
      }

      // !bayarkas <jumlah> - Konfirmasi pembayaran
      if (textLower.startsWith("!bayarkas ")) {
        try {
          const jumlahStr = text.slice("!bayarkas ".length).trim();
          const jumlah = parseInt(jumlahStr.replace(/[^0-9]/g, ''));
          
          if (isNaN(jumlah) || jumlah <= 0) {
            await sock.sendMessage(groupJid, {
              text: `❌ Format salah!\n\nGunakan: !bayarkas <jumlah>\nContoh: !bayarkas 5000\n\n💡 Target kas: ${kasSystem.formatRupiah(kasSystem.targetPerMinggu)}`
            });
            return;
          }

          const kasData = readJSON(FILE_KAS_DATA, {});
          const anggota = kasData.anggota || {};
          
          // Update data anggota
          const dataSekarang = anggota[pushName] || { totalBayar: 0, status: 'belum' };
          const dataBaru = kasSystem.updateStatusAnggota(dataSekarang, jumlah);
          
          anggota[pushName] = dataBaru;
          kasData.anggota = anggota;
          
          // Tambah history
          kasSystem.addHistory(kasData, pushName, jumlah, 'pending');
          
          saveJSON(FILE_KAS_DATA, kasData);
          
          let message = `✅ *KONFIRMASI PEMBAYARAN KAS*\n\n`;
          message += `👤 *Nama:* ${pushName}\n`;
          message += `💵 *Jumlah:* ${kasSystem.formatRupiah(jumlah)}\n`;
          message += `📊 *Status:* DICATAT (Menunggu Verifikasi Admin)\n\n`;
          
          message += `💡 *Info:*\n`;
          message += `• Total bayar kamu: ${kasSystem.formatRupiah(dataBaru.totalBayar)}\n`;
          message += `• Status: ${dataBaru.status.toUpperCase()}\n`;
          message += `• Gunakan !statuskas untuk cek status terbaru`;
          
          await sock.sendMessage(groupJid, { text: message });
          
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal memproses pembayaran. Coba lagi."
          });
        }
        return;
      }

      // !verifikasikas <nama> - Verifikasi oleh admin
      if (textLower.startsWith("!verifikasikas ")) {
        if (!isAdmin) {
          await sock.sendMessage(groupJid, { text: "🚫 Hanya admin yang bisa verifikasi kas." });
          return;
        }
        
        try {
          const nama = text.slice("!verifikasikas ".length).trim();
          const kasData = readJSON(FILE_KAS_DATA, {});
          const anggota = kasData.anggota || {};
          
          if (!anggota[nama]) {
            await sock.sendMessage(groupJid, {
              text: `❌ ${nama} belum terdaftar dalam sistem kas.`
            });
            return;
          }
          
          // Update status ke verified
          anggota[nama] = {
            ...anggota[nama],
            status: 'lunas'
          };
          
          kasData.anggota = anggota;
          saveJSON(FILE_KAS_DATA, kasData);
          
          await sock.sendMessage(groupJid, {
            text: `✅ *VERIFIKASI BERHASIL*\n\n${nama} telah diverifikasi sebagai LUNAS! 🎉`
          });
          
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal memverifikasi kas."
          });
        }
        return;
      }

      // !settarget <jumlah> - Set target kas
      if (textLower.startsWith("!settarget ")) {
        if (!isAdmin) {
          await sock.sendMessage(groupJid, { text: "🚫 Hanya admin yang bisa set target." });
          return;
        }
        
        try {
          const targetStr = text.slice("!settarget ".length).trim();
          const target = parseInt(targetStr.replace(/[^0-9]/g, ''));
          
          if (isNaN(target) || target <= 0) {
            await sock.sendMessage(groupJid, {
              text: "❌ Format: !settarget <jumlah>\nContoh: !settarget 5000"
            });
            return;
          }
          
          kasSystem.targetPerMinggu = target;
          
          const kasData = readJSON(FILE_KAS_DATA, {});
          kasData.targetPerMinggu = target;
          saveJSON(FILE_KAS_DATA, kasData);
          
          await sock.sendMessage(groupJid, {
            text: `✅ *TARGET KAS DIPERBARUI*\n\n🎯 Target baru: ${kasSystem.formatRupiah(target)} per minggu`
          });
          
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal mengubah target kas."
          });
        }
        return;
      }

      // !setrekening <info> - Set info rekening
      if (textLower.startsWith("!setrekening ")) {
        if (!isAdmin) {
          await sock.sendMessage(groupJid, { text: "🚫 Hanya admin yang bisa set rekening." });
          return;
        }
        
        try {
          const rekeningInfo = text.slice("!setrekening ".length).trim();
          
          const kasData = readJSON(FILE_KAS_DATA, {});
          kasData.settings = kasData.settings || {};
          kasData.settings.rekening = rekeningInfo;
          saveJSON(FILE_KAS_DATA, kasData);
          
          await sock.sendMessage(groupJid, {
            text: `✅ *INFO REKENING DIPERBARUI*\n\n💳 ${rekeningInfo}`
          });
          
        } catch (error) {
          await sock.sendMessage(groupJid, {
            text: "❌ Gagal mengubah info rekening."
          });
        }
        return;
      }

      // ---------- FITUR LAMA (TETAP DIJAGA) ----------
      
      // !halo
      if (textLower === "!halo") {
        await sock.sendMessage(groupJid, {
          text: `👋 Hai ${pushName}! Saya bot HIMAUNTIKA. Ketik !menu untuk daftar perintah.`,
        });
        return;
      }

      // !jadwal
      if (textLower === "!jadwal") {
        await sock.sendMessage(groupJid, {
          text: `📅 Jadwal kegiatan HIMAUNTIKA:\n- Rapat Divisi Pendidikan: Jumat, 15.00 WIB\n- Rapat Divisi Media: Senin, 14.00 WIB\n- Pelatihan Dasar Himpunan: Sabtu-Minggu`,
        });
        return;
      }

      // !acara
      if (textLower === "!acara") {
        await sock.sendMessage(groupJid, {
          text: `🎉 Info acara terbaru:\n- Surat Edaran Muslub (18 oktober)\n- LDKP jilid 2 (20 oktober)\n- Musyawarah luar biasa(dikampus) tanggal 21 selasa pagi\n- PDHM MINI (via google meet) — Minggu, 19.30 WIB - Selesai\n- Rabu 22 Oktober Materi etika & budaya di sekretariat, panitia min 2 aja di sekretariat\n- Makrab tanggal 25 Oktober hari sabtu`,
        });
        return;
      }

      // !divisi
      if (textLower === "!divisi") {
        await sock.sendMessage(groupJid, {
          text: `📚 Divisi HIMAUNTIKA:\n1. Pendidikan\n2. Media\n3. Humas\n4. Riset\n5. Kewirausahaan`,
        });
        return;
      }

      // absen / hadir / tidak hadir
      if (textLower === "!absen") {
        await sock.sendMessage(groupJid, {
          text: "📢 Sesi absensi dimulai! Silakan ketik *!hadir* untuk mencatat kehadiran atau *!tidakhadir* untuk mencatat ketidakhadiran.",
        });
        return;
      }

      // !hadir
      if (textLower === "!hadir") {
        const nama = pushName;
        let daftarHadir = readDaftar(FILE_DAFTAR_HADIR);
        let daftarTidakHadir = readDaftar(FILE_TIDAK_HADIR);

        if (daftarHadir.includes(nama)) {
          await sock.sendMessage(groupJid, {
            text: `⚠️ ${nama}, kamu sudah tercatat hadir.`,
          });
        } else {
          if (daftarTidakHadir.includes(nama)) {
            daftarTidakHadir = daftarTidakHadir.filter((n) => n !== nama);
            writeDaftar(FILE_TIDAK_HADIR, daftarTidakHadir);
          }
          
          daftarHadir.push(nama);
          writeDaftar(FILE_DAFTAR_HADIR, daftarHadir);
          
          await sock.sendMessage(groupJid, {
            text: `✅ ${nama} telah hadir!`,
          });
        }
        return;
      }

      // !tidakhadir
      if (textLower === "!tidakhadir") {
        const nama = pushName;
        let daftarHadir = readDaftar(FILE_DAFTAR_HADIR);
        let daftarTidakHadir = readDaftar(FILE_TIDAK_HADIR);

        if (daftarTidakHadir.includes(nama)) {
          await sock.sendMessage(groupJid, {
            text: `⚠️ ${nama}, kamu sudah tercatat tidak hadir.`,
          });
        } else {
          if (daftarHadir.includes(nama)) {
            daftarHadir = daftarHadir.filter((n) => n !== nama);
            writeDaftar(FILE_DAFTAR_HADIR, daftarHadir);
          }
          
          daftarTidakHadir.push(nama);
          writeDaftar(FILE_TIDAK_HADIR, daftarTidakHadir);
          
          await sock.sendMessage(groupJid, {
            text: `❌ ${nama} dicatat tidak hadir.`,
          });
        }
        return;
      }

      // !lihatabsen
      if (textLower === "!lihatabsen") {
        const daftarHadir = readDaftar(FILE_DAFTAR_HADIR);
        const daftarTidakHadir = readDaftar(FILE_TIDAK_HADIR);

        if (!daftarHadir.length && !daftarTidakHadir.length) {
          return await sock.sendMessage(groupJid, {
            text: "📄 Belum ada peserta yang hadir atau tidak hadir.",
          });
        }

        let text = `📋 *Daftar Hadir:*\n\n`;
        
        if (daftarHadir.length) {
          text += `✅ *Hadir:*\n`;
          text += daftarHadir.map((n, i) => `${i + 1}. ${n}`).join("\n");
        } else {
          text += `✅ *Hadir:*\n- Belum ada yang hadir\n`;
        }

        text += `\n\n❌ *Tidak Hadir:*\n`;
        if (daftarTidakHadir.length) {
          text += daftarTidakHadir.map((n, i) => `${i + 1}. ${n}`).join("\n");
        } else {
          text += `- Belum ada yang tidak hadir`;
        }

        return await sock.sendMessage(groupJid, { text });
      }

      // !jumlahabsen
      if (textLower === "!jumlahabsen") {
        const daftarHadir = readDaftar(FILE_DAFTAR_HADIR);
        const daftarTidakHadir = readDaftar(FILE_TIDAK_HADIR);
        
        const jumlahHadir = daftarHadir.length;
        const jumlahTidakHadir = daftarTidakHadir.length;
        const total = jumlahHadir + jumlahTidakHadir;

        return await sock.sendMessage(groupJid, {
          text: `📊 *Statistik Kehadiran:*\n\n✅ Hadir: *${jumlahHadir}* orang\n❌ Tidak Hadir: *${jumlahTidakHadir}* orang\n📈 Total: *${total}* orang`,
        });
      }

      // !resetabsen
      if (textLower === "!resetabsen") {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, {
            text: "🚫 Hanya admin yang bisa mereset daftar hadir!",
          });
        writeDaftar(FILE_DAFTAR_HADIR, []);
        writeDaftar(FILE_TIDAK_HADIR, []);
        return await sock.sendMessage(groupJid, {
          text: "✅ Daftar hadir dan tidak hadir berhasil di-reset oleh admin.",
        });
      }

      // pengumuman
      if (textLower.startsWith("!setpengumuman ")) {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, {
            text: "🚫 Hanya admin yang bisa memperbarui pengumuman!",
          });
        const isiBaru = text.slice("!setpengumuman ".length).trim();
        fs.writeFileSync(FILE_PENGUMUMAN, isiBaru);
        return await sock.sendMessage(groupJid, {
          text: "✅ Pengumuman berhasil diperbarui!",
        });
      }
      if (textLower === "!pengumuman") {
        const isi = fs.existsSync(FILE_PENGUMUMAN)
          ? fs.readFileSync(FILE_PENGUMUMAN, "utf8").trim()
          : "";
        if (!isi)
          return await sock.sendMessage(groupJid, {
            text: "⚠️ Belum ada pengumuman.",
          });
        return await sock.sendMessage(groupJid, {
          text: `📢 *Pengumuman HIMAUNTIKA:*\n\n${isi}`,
        });
      }

      // ---------- MANAGEMENT COMMANDS ----------
      // !setgroup
      if (textLower === "!setgroup") {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, {
            text: "🚫 Hanya admin dapat mengatur group target.",
          });
        const cfg = readJSON(FILE_CONFIG, {});
        cfg.groupJid = groupJid;
        saveJSON(FILE_CONFIG, cfg);
        return await sock.sendMessage(groupJid, {
          text: `✅ Group HIMAUNTIKA diset sebagai target pengingat.\n\nSekarang semua pengingat otomatis (kas, agenda, piket) akan dikirim ke grup ini.`,
        });
      }

      // set links (admin) - MASIH DIPERTAHANKAN UNTUK FITUR LAIN
      if (textLower.startsWith("!setagendalink ")) {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, { text: "🚫 Hanya admin." });
        const link = text.slice("!setagendalink ".length).trim();
        const cfg = readJSON(FILE_CONFIG, {});
        cfg.agendaLink = link;
        saveJSON(FILE_CONFIG, cfg);
        return await sock.sendMessage(groupJid, {
          text: "✅ Link agenda berhasil disimpan.",
        });
      }
      if (textLower.startsWith("!setpiketlink ")) {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, { text: "🚫 Hanya admin." });
        const link = text.slice("!setpiketlink ".length).trim();
        const cfg = readJSON(FILE_CONFIG, {});
        cfg.piketLink = link;
        saveJSON(FILE_CONFIG, cfg);
        return await sock.sendMessage(groupJid, {
          text: "✅ Link jadwal piket berhasil disimpan.",
        });
      }

      // Agenda add / list / delete
      if (textLower.startsWith("!addagenda ")) {
        const body = text.slice("!addagenda ".length).trim();
        const parts = body.split("|").map((p) => p.trim());
        const title = parts[0] || "(Tanpa Judul)";
        const date = parts[1] || null;
        const note = parts[2] || "";
        const agendas = readJSON(FILE_AGENDA, []);
        agendas.push({
          id: Date.now(),
          title,
          date,
          note,
          createdBy: pushName,
          createdAt: new Date().toISOString(),
        });
        saveJSON(FILE_AGENDA, agendas);
        return await sock.sendMessage(groupJid, {
          text: `✅ Agenda ditambahkan: ${title}${date ? " — " + date : ""}`,
        });
      }
      if (textLower === "!listagenda") {
        const agendas = readJSON(FILE_AGENDA, []);
        if (!agendas.length)
          return await sock.sendMessage(groupJid, {
            text: "📋 Belum ada agenda tersimpan.",
          });
        const lines = agendas.map(
          (a, i) =>
            `${i + 1}. ${a.title}${a.date ? " (" + a.date + ")" : ""} — by ${
              a.createdBy
            }`
        );
        return await sock.sendMessage(groupJid, {
          text: `📋 Daftar Agenda:\n\n${lines.join("\n")}`,
        });
      }
      // !hapusagenda <nomor>
      if (textLower.startsWith("!hapusagenda ")) {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, {
            text: "🚫 Hanya admin yang bisa menghapus agenda.",
          });
        const arg = text.slice("!hapusagenda ".length).trim();
        const idx = parseInt(arg, 10);
        if (isNaN(idx) || idx < 1)
          return await sock.sendMessage(groupJid, {
            text: "Format: !hapusagenda <nomor> (contoh: !hapusagenda 2)",
          });
        const agendas = readJSON(FILE_AGENDA, []);
        if (idx > agendas.length)
          return await sock.sendMessage(groupJid, {
            text: "Nomor agenda tidak ditemukan.",
          });
        const removed = agendas.splice(idx - 1, 1)[0];
        saveJSON(FILE_AGENDA, agendas);
        return await sock.sendMessage(groupJid, {
          text: `✅ Agenda dihapus: ${removed.title}`,
        });
      }

      // Piket weekly set
      if (textLower.startsWith("!setpiketweek ")) {
        if (!isAdmin)
          return await sock.sendMessage(groupJid, { text: "🚫 Hanya admin." });
        const body = text.slice("!setpiketweek ".length).trim();
        const parts = body.split("|").map((p) => p.trim());
        const weekdayRaw = (parts[0] || "").trim();
        const weekday =
          weekdayRaw.charAt(0).toUpperCase() +
          weekdayRaw.slice(1).toLowerCase();
        if (!weekday)
          return await sock.sendMessage(groupJid, {
            text: "Format: !setpiketweek WEEKDAY | name1, name2\nContoh: !setpiketweek Monday | Agus, Budi",
          });
        const names = (parts[1] || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (!names.length)
          return await sock.sendMessage(groupJid, {
            text: "Tambahkan daftar nama: !setpiketweek Monday | name1, name2",
          });
        const piketWeek = readJSON(FILE_PIKET_WEEK, {});
        piketWeek[weekday] = names;
        saveJSON(FILE_PIKET_WEEK, piketWeek);
        return await sock.sendMessage(groupJid, {
          text: `✅ Jadwal piket untuk *${weekday}* disimpan: ${names.join(
            ", "
          )}`,
        });
      }
      // view weekly piket
      if (textLower === "!listpiketweek") {
        const piketWeek = readJSON(FILE_PIKET_WEEK, {});
        const days = [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
        const lines = days.map((d) => {
          const arr = piketWeek[d] || [];
          return `${d}: ${arr.length ? arr.join(", ") : "-"}`;
        });
        return await sock.sendMessage(groupJid, {
          text: `📅 Jadwal Piket Mingguan:\n\n${lines.join("\n")}`,
        });
      }

      // !piket - today's piket
      if (textLower === "!piket") {
        const piketWeek = readJSON(FILE_PIKET_WEEK, {});
        const todayName = weekDayName();
        const arr = piketWeek[todayName] || [];
        if (!arr.length) {
          const cfg = readJSON(FILE_CONFIG, {});
          const link =
            cfg.piketLink ||
            "https://docs.google.com/spreadsheets/d/19gFDW1HIy1stDEP0OrPW8mkZS4y6Ip1QlljiyZ03-B0/edit?usp=sharing";
          return await sock.sendMessage(groupJid, {
            text: `📌 Piket hari ini (${todayName}) belum ada di jadwal lokal. Cek: ${link}`,
          });
        }
        return await sock.sendMessage(groupJid, {
          text: `📌 Piket hari ini (${todayName}):\n${arr
            .map((n, i) => `${i + 1}. ${n}`)
            .join("\n")}\n\nIngat upload foto dengan caption '!foto'.`,
        });
      }

      // quick link commands
      if (textLower === "!agendalink") {
        const cfg = readJSON(FILE_CONFIG, {});
        const link =
          cfg.agendaLink ||
          "https://docs.google.com/spreadsheets/d/1vdx7c-PFmcayAG8IAd4__2jwMJr7A_B4UBrl3vX6pTc/edit?usp=sharing";
        return await sock.sendMessage(groupJid, {
          text: `📎 Link agenda: ${link}`,
        });
      }

    } catch (err) {
      console.error("❌ Terjadi error di message handler:", err);
    }
  });

  // end message handler
} // end startBot

startBot().catch((e) => console.error("Fatal start error:", e));