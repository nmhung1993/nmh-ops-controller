const crypto = require('crypto');

/**
 * System & Fleet Audit Logger
 */
function logAuditEvent(db, { agentId = 'system', type = 'audit.system', severity = 'info', user = 'system', action = '', details = {} } = {}) {
  if (!db) return;
  const messageId = `audit-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const occurredAt = new Date().toISOString();
  const payload = {
    eventType: type,
    action,
    user,
    details,
    severity,
    occurredAt
  };

  try {
    // If agentId is not 'system', verify or default to system if agent doesn't exist
    let targetAgentId = agentId;
    if (agentId !== 'system') {
      const exists = db.prepare('SELECT 1 FROM agents WHERE id = ?').get(agentId);
      if (!exists) targetAgentId = 'system';
    }

    db.prepare(`
      INSERT INTO events(message_id, agent_id, type, severity, payload_json, occurred_at, received_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(messageId, targetAgentId, type, severity, JSON.stringify(payload), occurredAt, occurredAt);
  } catch (err) {
    console.error('[AuditLogger] Failed to log event:', err.message);
  }
}

/**
 * Query audit events across the fleet with search and filters
 */
function queryAuditLogs(db, { agentId, severity, category, search, limit = 200, from, to } = {}) {
  if (!db) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 10), 1000);

  let whereClauses = [];
  let params = [];

  if (agentId && agentId !== 'all') {
    whereClauses.push('e.agent_id = ?');
    params.push(agentId);
  }

  if (severity && severity !== 'all') {
    whereClauses.push('e.severity = ?');
    params.push(severity);
  }

  if (category && category !== 'all') {
    if (category === 'auth') {
      whereClauses.push("(e.type LIKE 'audit.auth%' OR e.type LIKE 'auth.%')");
    } else if (category === 'scripts') {
      whereClauses.push("(e.type LIKE 'audit.script%' OR e.type LIKE 'script.%')");
    } else if (category === 'watchdog') {
      whereClauses.push("(e.type LIKE 'watchdog.%' OR e.type LIKE 'audit.watchdog%')");
    } else if (category === 'network') {
      whereClauses.push("(e.type LIKE 'audit.network%' OR e.type LIKE 'network.%' OR e.type LIKE 'audit.mikrotik%')");
    } else if (category === 'docker') {
      whereClauses.push("(e.type LIKE 'docker.%' OR e.type LIKE 'audit.docker%')");
    } else if (category === 'process') {
      whereClauses.push("(e.type LIKE 'process.%' OR e.type LIKE 'audit.process%')");
    }
  }

  if (from) {
    whereClauses.push('e.occurred_at >= ?');
    params.push(from);
  }

  if (to) {
    whereClauses.push('e.occurred_at <= ?');
    params.push(to);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const query = `
    SELECT e.id, e.message_id, e.agent_id, e.type, e.severity, e.payload_json, e.occurred_at, e.received_at,
           a.hostname, a.display_name
    FROM events e
    LEFT JOIN agents a ON a.id = e.agent_id
    ${whereSql}
    ORDER BY e.occurred_at DESC
    LIMIT ?
  `;

  params.push(safeLimit);

  try {
    const rows = db.prepare(query).all(...params);
    let results = rows.map(row => {
      let payload = {};
      try { payload = JSON.parse(row.payload_json); } catch { }
      return {
        id: row.id,
        messageId: row.message_id,
        agentId: row.agent_id,
        hostName: row.display_name || row.hostname || (row.agent_id === 'system' ? 'Trung tâm Điều khiển' : row.agent_id),
        type: row.type,
        severity: row.severity,
        payload,
        occurredAt: row.occurred_at
      };
    });

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      results = results.filter(item => {
        const text = `${item.hostName} ${item.type} ${item.severity} ${JSON.stringify(item.payload)}`.toLowerCase();
        return text.includes(q);
      });
    }

    return results;
  } catch (err) {
    console.error('[AuditLogger] Query error:', err.message);
    return [];
  }
}

/**
 * Format audit logs as CSV
 */
function exportAuditLogsToCsv(logs) {
  const headers = ['ID', 'Thời gian (UTC)', 'Máy trạm', 'Loại sự kiện', 'Mức độ', 'Người thực hiện / Tác vụ', 'Chi tiết'];
  const rows = logs.map(l => {
    const user = l.payload?.user || 'N/A';
    const action = l.payload?.action || l.payload?.message || l.type;
    const details = JSON.stringify(l.payload?.details || {}).replace(/"/g, '""');
    return [
      l.id,
      `"${l.occurredAt}"`,
      `"${l.hostName}"`,
      `"${l.type}"`,
      `"${l.severity}"`,
      `"${user} - ${action}"`,
      `"${details}"`
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

module.exports = {
  logAuditEvent,
  queryAuditLogs,
  exportAuditLogsToCsv
};
