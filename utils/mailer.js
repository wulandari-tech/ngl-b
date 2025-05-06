const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    // Uncomment jika ada masalah sertifikat (bukan untuk production)
    // tls: {
    //     rejectUnauthorized: false
    // }
});

const sendPasswordResetEmail = async (to, token) => {
    const resetUrl = `${process.env.BASE_URL}/reset-password?token=${token}`;

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: to,
        subject: 'Reset Password Akun Anda',
        text: `Anda (atau orang lain) meminta reset password.\n\n` +
              `Klik link ini untuk reset password: ${resetUrl}\n\n` +
              `Jika Anda tidak meminta ini, abaikan email ini.\n` +
              `Link ini kedaluwarsa dalam 1 jam.\n`,
        html: `<p>Anda (atau orang lain) meminta reset password.</p>` +
              `<p>Klik link ini untuk reset password: <a href="${resetUrl}">${resetUrl}</a></p>` +
              `<p>Jika Anda tidak meminta ini, abaikan email ini.</p>` +
              `<p>Link ini kedaluwarsa dalam 1 jam.</p>`
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return false;
    }
};

module.exports = { sendPasswordResetEmail };