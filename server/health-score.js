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

function calculateHealthScore(db, mikrotikStatus = null, networkTargets = [], resolvedIssueIds = []) {
  let fleetScore = 100;
  let networkScore = 100;
  let gatewayScore = 100;

  const rawIssues = [];
  const recommendations = [];
  const resolvedSet = new Set(Array.isArray(resolvedIssueIds) ? resolvedIssueIds : []);

  // --- 1. EVALUATE AGENT FLEET ---
  const agents = db ? db.prepare("SELECT * FROM agents WHERE status = 'approved'").all() : [];
  let onlineAgentsCount = 0;
  let offlineAgentsCount = 0;

  if (agents.length === 0) {
    fleetScore = 100;
  } else {
    for (const agent of agents) {
      if (agent.include_health === 0) continue;

      const hostName = getCleanHostName(agent);
      const isOnline = agent.connected && (Date.now() - new Date(agent.last_seen_at).getTime() < 30000);
      if (isOnline) {
        onlineAgentsCount += 1;
        const latestTelemetry = db.prepare(`
          SELECT * FROM telemetry WHERE agent_id = ? ORDER BY ts DESC LIMIT 1
        `).get(agent.id);

        if (latestTelemetry) {
          const cpuPercent = Number(latestTelemetry.cpu_percent) || 0;
          const memoryPercent = Number(latestTelemetry.memory_percent) || 0;
          const diskPercent = Number(latestTelemetry.disk_percent) || 0;
          const tempCelsius = Number(latestTelemetry.temp_celsius) || 0;

          if (cpuPercent > 90) {
            const issId = `cpu_${agent.id}`;
            const isResolved = resolvedSet.has(issId);
            if (!isResolved) fleetScore -= 8;
            rawIssues.push({
              id: issId,
              agentId: agent.id,
              type: 'warning',
              category: 'fleet',
              title: `CPU tải cao: ${hostName}`,
              message: `Mức tải CPU đạt ${cpuPercent}% trên máy ${hostName}.`,
              resolved: isResolved
            });
            if (!isResolved) {
              recommendations.push({
                title: `Kiểm tra tiến trình ngốn CPU trên ${hostName}`,
                actionType: 'script',
                scriptId: 'sys_top_cpu',
                agentId: agent.id
              });
            }
          }

          if (memoryPercent > 90) {
            const issId = `ram_${agent.id}`;
            const isResolved = resolvedSet.has(issId);
            if (!isResolved) fleetScore -= 8;
            rawIssues.push({
              id: issId,
              agentId: agent.id,
              type: 'warning',
              category: 'fleet',
              title: `RAM gần đầy: ${hostName}`,
              message: `Bộ nhớ RAM sử dụng ${memoryPercent}% trên máy ${hostName}.`,
              resolved: isResolved
            });
            if (!isResolved) {
              recommendations.push({
                title: `Dọn dẹp file tạm & giải phóng bộ nhớ trên ${hostName}`,
                actionType: 'script',
                scriptId: 'sys_clean_temp',
                agentId: agent.id
              });
            }
          }

          if (diskPercent > 90) {
            const issId = `disk_${agent.id}`;
            const isResolved = resolvedSet.has(issId);
            if (!isResolved) fleetScore -= 12;
            rawIssues.push({
              id: issId,
              agentId: agent.id,
              type: 'error',
              category: 'fleet',
              title: `Ổ đĩa sắp hết dung lượng: ${hostName}`,
              message: `Dung lượng ổ đĩa đã sử dụng ${diskPercent}% trên máy ${hostName}.`,
              resolved: isResolved
            });
            if (!isResolved) {
              recommendations.push({
                title: `Chạy dọn dẹp dung lượng ổ đĩa trên ${hostName}`,
                actionType: 'script',
                scriptId: 'sys_clean_temp',
                agentId: agent.id
              });
            }
          }

          if (tempCelsius > 80) {
            const issId = `temp_${agent.id}`;
            const isResolved = resolvedSet.has(issId);
            if (!isResolved) fleetScore -= 10;
            rawIssues.push({
              id: issId,
              agentId: agent.id,
              type: 'warning',
              category: 'fleet',
              title: `Nhiệt độ phần cứng cao: ${hostName}`,
              message: `Nhiệt độ cảm biến ghi nhận ${tempCelsius}°C.`,
              resolved: isResolved
            });
          }
        }
      } else {
        offlineAgentsCount += 1;
        const issId = `offline_${agent.id}`;
        const isResolved = resolvedSet.has(issId);
        if (!isResolved) fleetScore -= 15;
        rawIssues.push({
          id: issId,
          agentId: agent.id,
          type: 'error',
          category: 'fleet',
          title: `Máy trạm ngoại tuyến: ${hostName}`,
          message: `Máy trạm ${hostName} (${agent.ip_address || 'N/A'}) đã mất kết nối.`,
          resolved: isResolved
        });
        if (!isResolved) {
          recommendations.push({
            title: `Kiểm tra nguồn hoặc dịch vụ agent trên ${hostName}`,
            actionType: 'link',
            href: `/#hosts`
          });
        }
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
        const issId = `net_offline_${target.id}`;
        const isResolved = resolvedSet.has(issId);
        if (!isResolved) {
          offlineTargetCount += 1;
          networkScore -= 15;
        }
        rawIssues.push({
          id: issId,
          type: 'error',
          category: 'network',
          title: `Mục tiêu mạng mất kết nối: ${target.name || target.host}`,
          message: `Địa chỉ IP ${target.host} không phản hồi gói tin ping.`,
          resolved: isResolved
        });
      } else if (target.status === 'degraded' || (target.packetLoss && target.packetLoss > 10)) {
        const issId = `net_degraded_${target.id}`;
        const isResolved = resolvedSet.has(issId);
        if (!isResolved) {
          highLatencyCount += 1;
          networkScore -= 8;
        }
        rawIssues.push({
          id: issId,
          type: 'warning',
          category: 'network',
          title: `Độ trễ hoặc rớt gói cao: ${target.name || target.host}`,
          message: `Mục tiêu ${target.name} (${target.host}) có độ trễ ${target.latency || '--'}ms hoặc mất gói ${target.packetLoss || 0}%.`,
          resolved: isResolved
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

  // --- 3. EVALUATE GATEWAY ---
  if (mikrotikStatus) {
    if (!mikrotikStatus.online) {
      const issId = 'gateway_offline';
      const isResolved = resolvedSet.has(issId) || resolvedSet.has('mikrotik_offline');
      if (!isResolved) gatewayScore -= 30;
      rawIssues.push({
        id: issId,
        type: 'error',
        category: 'gateway',
        title: 'Gateway Ngoại Tuyến',
        message: 'Không thể kết nối đến Router Gateway (192.168.1.1).',
        resolved: isResolved
      });
    } else {
      if (mikrotikStatus.wan?.pppoeStatus !== 'online') {
        const issId = 'pppoe_disconnected';
        const isResolved = resolvedSet.has(issId);
        if (!isResolved) gatewayScore -= 25;
        rawIssues.push({
          id: issId,
          type: 'error',
          category: 'gateway',
          title: 'PPPoE Internet Mất Kết Nối',
          message: 'Giao diện PPPoE WAN đang ở trạng thái ngắt kết nối.',
          resolved: isResolved
        });
        if (!isResolved) {
          recommendations.push({
            title: 'Quay số lại phiên PPPoE trên Gateway',
            actionType: 'link',
            href: `/#network`
          });
        }
      }

      if (mikrotikStatus.cpu > 85) {
        const issId = 'gateway_high_cpu';
        const isResolved = resolvedSet.has(issId) || resolvedSet.has('mikrotik_high_cpu');
        if (!isResolved) gatewayScore -= 10;
        rawIssues.push({
          id: issId,
          type: 'warning',
          category: 'gateway',
          title: 'CPU Router Gateway Cao',
          message: `CPU Gateway đang tải ${mikrotikStatus.cpu}%.`,
          resolved: isResolved
        });
      }

      if (mikrotikStatus.memory > 90) {
        const issId = 'gateway_high_ram';
        const isResolved = resolvedSet.has(issId) || resolvedSet.has('mikrotik_high_ram');
        if (!isResolved) gatewayScore -= 10;
        rawIssues.push({
          id: issId,
          type: 'warning',
          category: 'gateway',
          title: 'RAM Router Gateway Sắp Hết',
          message: `Bộ nhớ RAM Gateway sử dụng ${mikrotikStatus.memory}%.`,
          resolved: isResolved
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

  const activeIssues = rawIssues.filter(i => !i.resolved);
  const resolvedIssues = rawIssues.filter(i => i.resolved);

  // Add default positive recommendation if no active issues
  if (activeIssues.length === 0) {
    recommendations.push({
      key: 'health.allOptimal',
      title: 'Hệ thống đang hoạt động tối ưu. Toàn bộ máy trạm, kết nối mạng và Gateway ổn định.',
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
    issues: activeIssues,
    resolvedIssues,
    allIssues: rawIssues,
    recommendations,
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  calculateHealthScore
};

