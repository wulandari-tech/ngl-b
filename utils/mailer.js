const nodemailer = require('nodemailer');
require('dotenv').config(); // Pastikan dotenv di-load

// Validasi apakah kredensial email ada di .env
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("Kesalahan: Variabel EMAIL_USER atau EMAIL_PASS tidak ditemukan di .env.");
    // Anda bisa memilih untuk menghentikan aplikasi jika email wajib
    // process.exit(1);
}

const transporter = nodemailer.createTransport({
    service: 'gmail', // Menggunakan konfigurasi standar Gmail dari Nodemailer
    auth: {
        user: process.env.EMAIL_USER, // Ambil dari .env
        pass: process.env.EMAIL_PASS  // Ambil Sandi Aplikasi dari .env
    }
});

const sendPasswordResetEmail = async (to, token) => {
    // Pastikan EMAIL_FROM ada, jika tidak, gunakan default
    const mailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;

    const mailOptions = {
        from: mailFrom,
        to: to,
        subject: 'Reset Password Akun Anda',
        text: `Anda (atau orang lain) meminta reset password untuk akun Anda.\n\n` +
              `Silakan klik link berikut untuk menyelesaikan proses:\n\n` +
              `${resetUrl}\n\n` +
              `Jika Anda tidak meminta ini, abaikan saja email ini.\n` +
              `Link ini akan kedaluwarsa dalam 1 jam.\n`,
        html: `<p>Anda menerima email ini karena Anda (atau orang lain) meminta reset password untuk akun Anda.</p>` +
              `<p>Silakan klik link berikut untuk menyelesaikan proses:</p>` +
              `<p><a href="${resetUrl}" target="_blank" rel="noopener noreferrer">${resetUrl}</a></p>` +
              `<p>Jika Anda tidak meminta ini, abaikan saja email ini dan password Anda akan tetap sama.</p>` +
              `<p>Link ini akan kedaluwarsa dalam 1 jam.</p>`
    };

    try {
        // Verifikasi koneksi transporter (opsional tapi bagus untuk debug)
        // await transporter.verify();
        // console.log("Koneksi ke server Gmail berhasil.");

        let info = await transporter.sendMail(mailOptions);
        console.log('Email reset password terkirim: %s', info.messageId);
        return true; // Mengindikasikan email berhasil dikirim
    } catch (error) {
        console.error('Gagal mengirim email reset password:', error);
        if (error.code === 'EAUTH' || error.responseCode === 535) {
            console.error("Autentikasi Gagal. Periksa EMAIL_USER dan EMAIL_PASS (Sandi Aplikasi) di .env.");
        } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
            console.error("Gagal terhubung ke server Gmail. Periksa koneksi internet atau firewall.");
        }
        return false; // Mengindikasikan email gagal dikirim
    }
};

module.exports = { sendPasswordResetEmail };