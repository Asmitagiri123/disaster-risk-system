const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.twilioClient = null;
  }

  _getEmailTransporter() {
    if (!this.emailTransporter && process.env.EMAIL_HOST && process.env.EMAIL_USER) {
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    }

    return this.emailTransporter;
  }

  _getTwilioClient() {
    if (!this.twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }

    return this.twilioClient;
  }

  async sendEmail(to, subject, htmlBody) {
    try {
      const transporter = this._getEmailTransporter();
      if (!transporter) {
        return { success: false, error: 'Email credentials not configured' };
      }
      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to,
        subject,
        html: htmlBody,
      });
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      logger.error(`Email send failed to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async sendSMS(to, message) {
    try {
      const client = this._getTwilioClient();
      if (!client) {
        return { success: false, error: 'Twilio credentials not configured' };
      }

      const msg = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });
      logger.info(`SMS sent to ${to}: ${msg.sid}`);
      return { success: true, sid: msg.sid };
    } catch (err) {
      logger.error(`SMS send failed to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  buildAlertEmail(alert) {
    const riskColors = {
      low: '#28a745',
      moderate: '#ffc107',
      high: '#fd7e14',
      critical: '#dc3545',
    };
    const color = riskColors[alert.riskLevel] || '#dc3545';
    const probability = Math.round(alert.probability * 100);

    return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
      <div style="background:${color};color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:24px;">⚠️ DISASTER ALERT</h1>
        <p style="margin:5px 0 0;font-size:18px;text-transform:uppercase;">${alert.riskLevel} RISK</p>
      </div>
      <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6;">
        <h2 style="color:#333;text-transform:capitalize;">${alert.disasterType} Warning</h2>
        <p style="font-size:16px;color:#555;">${alert.message}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr style="background:#e9ecef;">
            <td style="padding:10px;font-weight:bold;border:1px solid #dee2e6;">Disaster Type</td>
            <td style="padding:10px;border:1px solid #dee2e6;text-transform:capitalize;">${alert.disasterType}</td>
          </tr>
          <tr>
            <td style="padding:10px;font-weight:bold;border:1px solid #dee2e6;">Risk Level</td>
            <td style="padding:10px;border:1px solid #dee2e6;color:${color};font-weight:bold;text-transform:uppercase;">${alert.riskLevel}</td>
          </tr>
          <tr style="background:#e9ecef;">
            <td style="padding:10px;font-weight:bold;border:1px solid #dee2e6;">Probability</td>
            <td style="padding:10px;border:1px solid #dee2e6;">${probability}%</td>
          </tr>
          <tr>
            <td style="padding:10px;font-weight:bold;border:1px solid #dee2e6;">Location</td>
            <td style="padding:10px;border:1px solid #dee2e6;">${alert.location?.city || 'N/A'}, ${alert.location?.country || 'N/A'}</td>
          </tr>
          <tr style="background:#e9ecef;">
            <td style="padding:10px;font-weight:bold;border:1px solid #dee2e6;">Affected Radius</td>
            <td style="padding:10px;border:1px solid #dee2e6;">${alert.affectedRadius} km</td>
          </tr>
          <tr>
            <td style="padding:10px;font-weight:bold;border:1px solid #dee2e6;">Alert Time</td>
            <td style="padding:10px;border:1px solid #dee2e6;">${new Date().toUTCString()}</td>
          </tr>
        </table>
        <div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:4px;">
          <strong>Safety Instructions:</strong>
          <ul style="margin:8px 0;padding-left:20px;">
            ${this._getSafetyTips(alert.disasterType).map(t => `<li>${t}</li>`).join('')}
          </ul>
        </div>
      </div>
      <div style="background:#6c757d;color:white;padding:10px;text-align:center;border-radius:0 0 8px 8px;font-size:12px;">
        Disaster Prediction & Early Warning System — Stay Safe
      </div>
    </body>
    </html>`;
  }

  buildWelcomeEmail(user) {
    return `
    <!DOCTYPE html>
    <html>
    <body style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;">
      <div style="background:#4CAF50;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="margin:0;font-size:24px;">Welcome to NepAlert!</h1>
      </div>
      <div style="background:#f8f9fa;padding:20px;border:1px solid #dee2e6;">
        <p style="font-size:16px;color:#555;">Dear ${user.name || 'User'},</p>
        <p style="font-size:16px;color:#555;">Thank you for registering with NepAlert, your Flood & Landslide Detection System.</p>
        <p style="font-size:16px;color:#555;">You can now log in to your dashboard to monitor real-time alerts, predictions, and sensor data.</p>
        <p style="font-size:16px;color:#555;">Your account details:</p>
        <ul style="font-size:16px;color:#555;">
          <li><strong>Email:</strong> ${user.email}</li>
          <li><strong>Role:</strong> ${user.role}</li>
        </ul>
        <p style="font-size:16px;color:#555;">We are committed to providing you with timely and accurate disaster information to help keep you safe.</p>
        <p style="font-size:16px;color:#555;">Best regards,</p>
        <p style="font-size:16px;color:#555;">The NepAlert Team</p>
      </div>
      <div style="background:#6c757d;color:white;padding:10px;text-align:center;border-radius:0 0 8px 8px;font-size:12px;">
        Disaster Prediction & Early Warning System — Stay Safe
      </div>
    </body>
    </html>`;
  }

  buildAlertSMS(alert) {
    const probability = Math.round(alert.probability * 100);
    return `⚠️ DISASTER ALERT: ${alert.riskLevel.toUpperCase()} ${alert.disasterType.toUpperCase()} risk detected near ${alert.location?.city || 'your area'} (${probability}% probability). ${this._getSafetyTips(alert.disasterType)[0]} Stay safe!`;
  }

  _getSafetyTips(disasterType) {
    const tips = {
      earthquake: [
        'Drop, Cover, and Hold On — get under a sturdy table',
        'Stay away from windows and exterior walls',
        'Move to an open area away from buildings after shaking stops',
        'Do not use elevators',
      ],
      flood: [
        'Move immediately to higher ground',
        'Do not walk or drive through flood waters',
        'Disconnect electrical appliances',
        'Follow evacuation orders from local authorities',
      ],
      landslide: [
        'Evacuate immediately if you hear rumbling sounds',
        'Move away from the path of a landslide quickly',
        'Avoid river valleys and low-lying areas',
        'Alert neighbors and local emergency services',
      ],
    };
    return tips[disasterType] || ['Follow local emergency instructions', 'Stay calm and contact authorities'];
  }
}

module.exports = new NotificationService();
