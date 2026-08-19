const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ALERT_RULES_FILE = path.join(__dirname, '..', 'data', 'alert-rules.json');

const DEFAULT_ALERT_CONFIG = {
  enabled: true,
  cooldownMinutes: 10,
  channels: {
    discord: {
      enabled: false,
      webhookUrl: ''
    },
    telegram: {
      enabled: false,
      botToken: '',
      chatId: ''
    },
    webhook: {
      enabled: false,
      url: ''
    }
  },
  thresholds: {
    cpuPercent: 90,
    cpuDurationMinutes: 3,
    memoryPercent: 90,
    diskPercent: 90,
    tempCelsius: 80,
    hostOfflineSeconds: 120,
    pingLossPercent: 20
  }
};

class AlertEngine {
  constructor() {
    this.config = this.loadConfig();
    this.hostViolationTimers = new Map(); // key: `${hostId}_${metric}` -> timestamp
    this.lastAlertTimes = new Map(); // key: `${hostId}_${metric}` -> timestamp
  }

  loadConfig() {
    try {
      if (fs.existsSync(ALERT_RULES_FILE)) {
        const data = JSON.parse(fs.readFileSync(ALERT_RULES_FILE, 'utf8'));
        return { ...DEFAULT_ALERT_CONFIG, ...data };
      }
    } catch (e) {
      console.error('[AlertEngine] Failed to read alert rules:', e.message);
    }
    return { ...DEFAULT_ALERT_CONFIG };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      const dir = path.dirname(ALERT_RULES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(ALERT_RULES_FILE, JSON.stringify(this.config, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[AlertEngine] Failed to save alert rules:', e.message);
      return false;
    }
  }

  canSendAlert(key) {
    const lastSent = this.lastAlertTimes.get(key) || 0;
    const cooldownMs = (this.config.cooldownMinutes || 10) * 60 * 1000;
    return Date.now() - lastSent >= cooldownMs;
  }

  markAlertSent(key) {
    this.lastAlertTimes.set(key, Date.now());
  }

  async sendTelegram(message, options = {}) {
    const channelConfig = options.channelConfig || this.config.channels.telegram || {};
    const { botToken, chatId, topicId, enabled } = channelConfig;
    if (options.bypassEnabledCheck ? (!botToken || !chatId) : (!enabled || !botToken || !chatId)) return false;

    return new Promise((resolve) => {
      const bodyObj = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML'
      };
      const finalTopicId = options.topicId !== undefined ? options.topicId : topicId;
      if (finalTopicId && !isNaN(Number(finalTopicId))) {
        bodyObj.message_thread_id = Number(finalTopicId);
      }
      const payload = JSON.stringify(bodyObj);

      const req = https.request({
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 5000
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
      });

      req.on('error', (err) => {
        console.error('[AlertEngine] Telegram send error:', err.message);
        resolve(false);
      });
      req.write(payload);
      req.end();
    });
  }

  async sendDiscord(title, description, severity = 'warning', fields = [], customWebhookUrl = null) {
    const webhookUrl = customWebhookUrl || this.config.channels.discord?.webhookUrl;
    const enabled = customWebhookUrl ? true : this.config.channels.discord?.enabled;
    if (!enabled || !webhookUrl) return false;

    const colors = {
      info: 3447003,      // Blue
      warning: 16744448,  // Orange / Yellow
      critical: 15158332, // Red
      success: 3066993    // Green
    };

    return new Promise((resolve) => {
      const payload = JSON.stringify({
        embeds: [{
          title: `🚨 NMH Ops Controller Alert: ${title}`,
          description: description,
          color: colors[severity] || colors.warning,
          fields: fields,
          footer: { text: 'NMH Ops Controller • Unified Fleet & LAN Controller' },
          timestamp: new Date().toISOString()
        }]
      });

      try {
        const parsedUrl = new URL(webhookUrl);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.request(parsedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 5000
        }, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });

        req.on('error', () => resolve(false));
        req.write(payload);
        req.end();
      } catch (err) {
        resolve(false);
      }
    });
  }

  // Dedicated Watchdog Self-Healing & Process Alerting (strictly isolated per host)
  async sendWatchdogAlert(event, host, watchdogConfig) {
    const notifyConfig = watchdogConfig?.notifications;
    if (!notifyConfig || !notifyConfig.enabled) {
      return false;
    }

    const { eventType, message, data = {} } = event;
    const isCrash = eventType.includes('crash') || eventType.includes('failed') || eventType.includes('killed');
    const isRestart = eventType.includes('launch') || eventType.includes('restarted');

    if (isCrash && notifyConfig.notifyOnCrash === false) return false;
    if (isRestart && notifyConfig.notifyOnRestart === false) return false;
    if (eventType.includes('fail') && notifyConfig.notifyOnFailure === false) return false;

    const hostName = host?.displayName || host?.display_name || host?.hostname || 'Máy trạm';
    const processName = data.processName || data.ruleName || 'Tiến trình';
    const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

    let title = '🛡️ [WATCHDOG TỰ PHỤC HỒI TIẾN TRÌNH]';
    let severity = 'info';
    if (isCrash) {
      title = '🚨 [WATCHDOG TIẾN TRÌNH GẶP SỰ CỐ]';
      severity = 'critical';
    } else if (isRestart) {
      title = '✅ [WATCHDOG ĐÃ KHỞI CHẠY LẠI TIẾN TRÌNH]';
      severity = 'success';
    }

    const text = `
<b>${title}</b>
<b>Máy trạm:</b> <code>${hostName}</code>
<b>Tiến trình:</b> <code>${processName}</code>
<b>Sự kiện:</b> <code>${eventType}</code>
<b>Chi tiết:</b> ${message || 'Tự động kích hoạt quy trình phục hồi'}
<b>Thời gian:</b> <i>${timestamp}</i>
    `.trim();

    let sent = false;

    // 1. Send strictly to this host's Watchdog-specific Telegram
    const tg = notifyConfig.telegram;
    if (tg?.enabled && tg.botToken && tg.chatId) {
      const ok = await this.sendTelegram(text, { channelConfig: tg, bypassEnabledCheck: true });
      if (ok) sent = true;
    }

    // 2. Send strictly to this host's Watchdog-specific Discord
    const dc = notifyConfig.discord;
    if (dc?.enabled && dc.webhookUrl) {
      const ok = await this.sendDiscord(title, `Máy trạm **${hostName}** kích hoạt sự kiện Watchdog: ${message || ''}`, severity, [
        { name: 'Tiến trình', value: `\`${processName}\``, inline: true },
        { name: 'Sự kiện', value: `\`${eventType}\``, inline: true },
        { name: 'Thời gian', value: timestamp, inline: false }
      ], dc.webhookUrl);
      if (ok) sent = true;
    }

    return sent;
  }

  async sendCustomWebhook(payloadData) {
    const { url, enabled } = this.config.channels.webhook || {};
    if (!enabled || !url) return false;

    return new Promise((resolve) => {
      const payload = JSON.stringify(payloadData);
      try {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const client = isHttps ? https : http;

        const req = client.request(parsedUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 5000
        }, (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 300);
        });

        req.on('error', () => resolve(false));
        req.write(payload);
        req.end();
      } catch (err) {
        resolve(false);
      }
    });
  }

  async dispatchAlert({ hostName, title, message, severity = 'warning', details = [] }) {
    if (!this.config.enabled) return;

    // Telegram format
    const tgIcon = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : 'ℹ️';
    const tgMessage = `<b>${tgIcon} NMH Ops Controller Cảnh báo: ${title}</b>\n\n` +
      `🖥 <b>Máy trạm:</b> ${hostName || 'Hệ thống'}\n` +
      `📝 <b>Chi tiết:</b> ${message}\n` +
      details.map(d => `• <b>${d.name}:</b> ${d.value}`).join('\n') +
      `\n\n⏰ <i>${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</i>`;

    const discordFields = [
      { name: 'Máy trạm', value: hostName || 'Hệ thống', inline: true },
      ...details.map(d => ({ name: d.name, value: String(d.value), inline: true }))
    ];

    await Promise.allSettled([
      this.sendTelegram(tgMessage),
      this.sendDiscord(title, message, severity, discordFields),
      this.sendCustomWebhook({ hostName, title, message, severity, details, timestamp: new Date().toISOString() })
    ]);
  }

  // Evaluates telemetry from an approved agent
  evaluateTelemetry(host, telemetry) {
    if (!this.config.enabled || !host) return;

    const hostId = host.id;
    const hostName = host.displayName || host.hostname || hostId;
    const thresholds = this.config.thresholds || DEFAULT_ALERT_CONFIG.thresholds;

    // 1. CPU Load
    const cpuUsage = Number(telemetry.cpu?.usage || 0);
    if (cpuUsage >= thresholds.cpuPercent) {
      const key = `${hostId}_cpu`;
      if (this.canSendAlert(key)) {
        this.dispatchAlert({
          hostName,
          title: 'Quá tải CPU',
          message: `Mức sử dụng CPU đạt ${cpuUsage.toFixed(1)}% (Ngưỡng cảnh báo: ${thresholds.cpuPercent}%)`,
          severity: 'warning',
          details: [{ name: 'CPU Usage', value: `${cpuUsage.toFixed(1)}%` }]
        });
        this.markAlertSent(key);
      }
    }

    // 2. RAM Load
    const memTotal = telemetry.memory?.total || telemetry.memory?.totalBytes || 0;
    const memUsed = telemetry.memory?.used || telemetry.memory?.usedBytes || 0;
    const memPercent = Number(telemetry.memory?.percent || (memTotal > 0 ? ((memUsed / memTotal) * 100).toFixed(1) : 0));
    if (memPercent >= thresholds.diskPercent) {
      const key = `${hostId}_mem`;
      if (this.canSendAlert(key)) {
        this.dispatchAlert({
          hostName,
          title: 'Cạn kiệt Bộ nhớ RAM',
          message: `Mức sử dụng RAM đạt ${memPercent}% (Ngưỡng cảnh báo: ${thresholds.memoryPercent}%)`,
          severity: 'warning',
          details: [{ name: 'RAM Usage', value: `${memPercent}%` }]
        });
        this.markAlertSent(key);
      }
    }

    // 3. CPU Temperature
    const temps = Array.isArray(telemetry.hardware?.temperatures)
      ? telemetry.hardware.temperatures
      : Array.isArray(telemetry.hardware?.sensors)
        ? telemetry.hardware.sensors.filter(s => Number.isFinite(s.celsius))
        : [];
    const maxTemp = temps.reduce((max, s) => Math.max(max, Number(s.celsius || 0)), 0);
    if (maxTemp >= thresholds.tempCelsius) {
      const key = `${hostId}_temp`;
      if (this.canSendAlert(key)) {
        this.dispatchAlert({
          hostName,
          title: 'Nhiệt độ CPU Quá cao',
          message: `Cảm biến ghi nhận nhiệt độ ${maxTemp.toFixed(1)}°C (Ngưỡng an toàn: ${thresholds.tempCelsius}°C)`,
          severity: 'critical',
          details: [{ name: 'Nhiệt độ cao nhất', value: `${maxTemp.toFixed(1)}°C` }]
        });
        this.markAlertSent(key);
      }
    }
  }

  // Evaluates network ping target metrics
  evaluatePingTarget(target, res) {
    if (!this.config.enabled || !target) return;
    const thresholds = this.config.thresholds || DEFAULT_ALERT_CONFIG.thresholds;

    if (!res.alive || (target.packetLoss && target.packetLoss >= thresholds.pingLossPercent)) {
      const key = `ping_${target.id}`;
      if (this.canSendAlert(key)) {
        this.dispatchAlert({
          hostName: target.name || target.host,
          title: 'Mất kết nối hoặc Rớt gói Ping',
          message: `Target ${target.name} (${target.host}) không phản hồi hoặc tỷ lệ rớt gói đạt ${target.packetLoss || 100}%`,
          severity: 'warning',
          details: [
            { name: 'Target IP', value: target.host },
            { name: 'Packet Loss', value: `${target.packetLoss || 100}%` }
          ]
        });
        this.markAlertSent(key);
      }
    }
  }
}

const alertEngine = new AlertEngine();

module.exports = {
  alertEngine
};
