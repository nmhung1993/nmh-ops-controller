const path = require('path');
const fs = require('fs');

/**
 * Calculates overall infrastructure health score (0 - 100)
 * Evaluates:
 * 1. Fleet Availability & Resource Utilization (CPU, RAM, Disk, Temp)
 * 2. Network Stability & Latency (Ping Monitor targets, Packet Loss)
 * 3. MikroTik Gateway & PPPoE Connectivity
 */
function getCleanHostName(agent) {
  if (agent.display_name && !agent.display_name.startsWith('DESKTOP-')) return agent.display_name;
  if (agent.hostname && !agent.hostname.startsWith('DESKTOP-')) return agent.hostname;
  return `Máy trạm (${agent.id?.slice(0, 8) || 'Agent'})`;
}

function calculateHealthScore(db, mikrotikStatus = null, networkTargets = []) {
  let fleetScore = 100;
  let networkScore = 100;
  let gatewayScore = 100;

  const issues = [];
  const recommendations = [];

  // --- 1. EVALUATE AGENT FLEET ---
  const agents = db ? db.prepare("SELECT * FROM agents WHERE status = 'approved'").all() : [];
  let onlineAgentsCount = 0;
  let offlineAgentsCount = 0;

  if (agents.length === 0) {
    fleetScore = 100;
  } else {
    for (const agent of agents) {
      // Exclude personal / transient devices if configured
      if (agent.include_health === 0) continue;

      const hostName = getCleanHostName(agent);
      const isOnline = agent.connected && (Date.now() - new Date(agent.last_seen_at).getTime() < 30000);
      if (isOnline) {
        onlineAgentsCount += 1;
        // Fetch latest telemetry for this agent
        const latestTelemetry = db.prepare(`
          SELECT * FROM telemetry WHERE agent_id = ? ORDER BY ts DESC LIMIT 1
        `).get(agent.id);

        if (latestTelemetry) {
          const cpuPercent = Number(latestTelemetry.cpu_percent) || 0;
          const memoryPercent = Number(latestTelemetry.memory_percent) || 0;
          const diskPercent = Number(latestTelemetry.disk_percent) || 0;
          const tempCelsius = Number(latestTelemetry.temp_celsius) || 0;

          if (cpuPercent > 90) {
            fleetScore -= 8;
            issues.push({
              id: `cpu_${agent.id}`,
              type: 'warning',
              category: 'fleet',
              title: `CPU tải cao: ${hostName}`,
              message: `Mức tải CPU đạt ${cpuPercent}% trên máy ${hostName}.`
            });
            recommendations.push({
              title: `Kiểm tra tiến trình ngốn CPU trên ${hostName}`,
              actionType: 'script',
              scriptId: 'sys_top_cpu',
              agentId: agent.id
            });
          }

          if (memoryPercent > 90) {
            fleetScore -= 8;
            issues.push({
              id: `ram_${agent.id}`,
              type: 'warning',
              category: 'fleet',
              title: `RAM gần đầy: ${hostName}`,
              message: `Bộ nhớ RAM sử dụng ${memoryPercent}% trên máy ${hostName}.`
            });
            recommendations.push({
              title: `Dọn dẹp file tạm & giải phóng bộ nhớ trên ${hostName}`,
              actionType: 'script',
              scriptId: 'sys_clean_temp',
              agentId: agent.id
            });
          }

          if (diskPercent > 90) {
            fleetScore -= 12;
            issues.push({
              id: `disk_${agent.id}`,
              type: 'error',
              category: 'fleet',
              title: `Ổ đĩa sắp hết dung lượng: ${hostName}`,
              message: `Dung lượng ổ đĩa đã sử dụng ${diskPercent}% trên máy ${hostName}.`
            });
            recommendations.push({
              title: `Chạy dọn dẹp dung lượng ổ đĩa trên ${hostName}`,
              actionType: 'script',
              scriptId: 'sys_clean_temp',
              agentId: agent.id
            });
          }

          if (tempCelsius > 80) {
            fleetScore -= 10;
            issues.push({
              id: `temp_${agent.id}`,
              type: 'warning',
              category: 'fleet',
              title: `Nhiệt độ phần cứng cao: ${hostName}`,
              message: `Nhiệt độ cảm biến ghi nhận ${tempCelsius}°C.`
            });
          }
        }
      } else {
        offlineAgentsCount += 1;
        fleetScore -= 15;
        issues.push({
          id: `offline_${agent.id}`,
          type: 'error',
          category: 'fleet',
          title: `Máy trạm ngoại tuyến: ${hostName}`,
          message: `Máy trạm ${hostName} (${agent.ip_address || 'N/A'}) đã mất kết nối.`
        });
        recommendations.push({
          title: `Kiểm tra nguồn hoặc dịch vụ agent trên ${hostName}`,
          actionType: 'link',
          href: `/#hosts`
        });
      }
    }
  }

  // --- 2. EVALUATE NETWORK TARGETS ---
  const enabledTargets = (networkTargets || []).filter(t => t.enabled);
  if (enabledTargets.length > 0) {
    let highLatencyCount = 0;
    let offlineTargetCount = 0;

    for (const target of enabledTargets) {
      if (target.status === 'offline') {
        offlineTargetCount += 1;
        networkScore -= 15;
        issues.push({
          id: `net_offline_${target.id}`,
          type: 'error',
          category: 'network',
          title: `Mục tiêu mạng mất kết nối: ${target.name || target.host}`,
          message: `Địa chỉ IP ${target.host} không phản hồi gói tin ping.`
        });
      } else if (target.status === 'degraded' || (target.packetLoss && target.packetLoss > 10)) {
        highLatencyCount += 1;
        networkScore -= 8;
        issues.push({
          id: `net_degraded_${target.id}`,
          type: 'warning',
          category: 'network',
          title: `Độ trễ hoặc rớt gói cao: ${target.name || target.host}`,
          message: `Mục tiêu ${target.name} (${target.host}) có độ trễ ${target.latency || '--'}ms hoặc mất gói ${target.packetLoss || 0}%.`
        });
      }
    }

    if (highLatencyCount > 0 || offlineTargetCount > 0) {
      recommendations.push({
        title: `Kiểm tra hạ tầng mạng trong tab Mạng nội bộ`,
        actionType: 'link',
        href: `/#network`
      });
    }
  }

  // --- 3. EVALUATE MIKROTIK GATEWAY ---
  if (mikrotikStatus) {
    if (!mikrotikStatus.online) {
      gatewayScore -= 30;
      issues.push({
        id: 'mikrotik_offline',
        type: 'error',
        category: 'gateway',
        title: 'MikroTik Gateway Ngoại Tuyến',
        message: 'Không thể kết nối đến RouterOS MikroTik Gateway (192.168.1.1).'
      });
    } else {
      if (mikrotikStatus.wan?.pppoeStatus !== 'online') {
        gatewayScore -= 25;
        issues.push({
          id: 'pppoe_disconnected',
          type: 'error',
          category: 'gateway',
          title: 'PPPoE Internet Mất Kết Nối',
          message: 'Giao diện PPPoE WAN đang ở trạng thái ngắt kết nối.'
        });
        recommendations.push({
          title: 'Quay số lại phiên PPPoE trên MikroTik Gateway',
          actionType: 'link',
          href: `/#network`
        });
      }

      if (mikrotikStatus.cpu > 85) {
        gatewayScore -= 10;
        issues.push({
          id: 'mikrotik_high_cpu',
          type: 'warning',
          category: 'gateway',
          title: 'CPU MikroTik Router Cao',
          message: `CPU RouterOS đang tải ${mikrotikStatus.cpu}%.`
        });
      }

      if (mikrotikStatus.memory > 90) {
        gatewayScore -= 10;
        issues.push({
          id: 'mikrotik_high_ram',
          type: 'warning',
          category: 'gateway',
          title: 'RAM MikroTik Router Sắp Hết',
          message: `Bộ nhớ RAM RouterOS sử dụng ${mikrotikStatus.memory}%.`
        });
      }
    }
  }

  // Clamp category scores between 0 and 100
  fleetScore = Math.max(0, Math.min(100, fleetScore));
  networkScore = Math.max(0, Math.min(100, networkScore));
  gatewayScore = Math.max(0, Math.min(100, gatewayScore));

  // Weighted overall score: Fleet 40%, Network 30%, Gateway 30%
  const overallScore = Math.round(fleetScore * 0.4 + networkScore * 0.3 + gatewayScore * 0.3);

  let status = 'excellent';
  let grade = 'A+';
  if (overallScore >= 95) {
    status = 'excellent';
    grade = 'A+';
  } else if (overallScore >= 85) {
    status = 'good';
    grade = 'A';
  } else if (overallScore >= 70) {
    status = 'good';
    grade = 'B';
  } else if (overallScore >= 50) {
    status = 'warning';
    grade = 'C';
  } else {
    status = 'critical';
    grade = 'F';
  }

  // Add default positive recommendation if no issues
  if (issues.length === 0) {
    recommendations.push({
      title: 'Hệ thống đang hoạt động tối ưu. Toàn bộ máy trạm, kết nối mạng và RouterOS ổn định.',
      actionType: 'info'
    });
  }

  return {
    score: overallScore,
    status,
    grade,
    categoryScores: {
      fleet: fleetScore,
      network: networkScore,
      gateway: gatewayScore
    },
    metrics: {
      totalAgents: agents.length,
      onlineAgents: onlineAgentsCount,
      offlineAgents: offlineAgentsCount,
      networkTargetsCount: enabledTargets.length,
      gatewayOnline: mikrotikStatus ? Boolean(mikrotikStatus.online) : null,
      pppoeOnline: mikrotikStatus ? mikrotikStatus.wan?.pppoeStatus === 'online' : null
    },
    issues,
    recommendations,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  calculateHealthScore
};
