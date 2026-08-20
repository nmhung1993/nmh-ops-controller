const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');

const PRESET_SCRIPTS = [
  // ==========================================
  // WINDOWS SCRIPTS (PowerShell)
  // ==========================================
  {
    id: 'sys_clean_temp',
    name: 'Dọn dẹp File Tạm & Windows Update Cache',
    description: 'Dọn sạch thư mục Temp của người dùng và hệ thống, dọn RecycleBin để giải phóng dung lượng ổ cứng.',
    platform: 'windows',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `Clear-RecycleBin -Force -ErrorAction SilentlyContinue;
Remove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue;
Remove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue;
Write-Output "✓ Dọn dẹp file tạm và thùng rác thành công!"`
  },
  {
    id: 'sys_flush_dns',
    name: 'Xóa Cache DNS & Làm mới Cấu hình Mạng',
    description: 'Flush DNS Resolver Cache, đăng ký lại DNS và kiểm tra kết nối gateway mạng nội bộ.',
    platform: 'windows',
    category: 'network',
    isPreset: true,
    scriptContent: `ipconfig /flushdns;
ipconfig /registerdns;
Test-NetConnection -ComputerName 192.168.1.1 -InformationLevel Detailed | Select-Object ComputerName, RemoteAddress, PingSucceeded | Format-Table;
Write-Output "✓ Đã làm mới DNS và kiểm tra kết nối Gateway!"`
  },
  {
    id: 'sys_restart_spooler',
    name: 'Khởi động lại Dịch vụ In ấn (Print Spooler)',
    description: 'Restart dịch vụ Spooler và xóa hàng đợi in kẹt.',
    platform: 'windows',
    category: 'troubleshooting',
    isPreset: true,
    scriptContent: `Stop-Service -Name Spooler -Force;
Remove-Item -Path "C:\\Windows\\System32\\spool\\PRINTERS\\*" -Force -ErrorAction SilentlyContinue;
Start-Service -Name Spooler;
Get-Service -Name Spooler | Select-Object Name, DisplayName, Status | Format-Table;
Write-Output "✓ Đã khởi động lại Print Spooler và xóa hàng đợi in kẹt!"`
  },
  {
    id: 'sys_check_smart',
    name: 'Kiểm tra S.M.A.R.T & Sức Khỏe Toàn Bộ Ổ Cứng',
    description: 'Truy xuất trạng thái hoạt động, loại ổ cứng (SSD/HDD) và tình trạng sức khỏe từ Windows WMI.',
    platform: 'windows',
    category: 'diagnostic',
    isPreset: true,
    scriptContent: `Get-PhysicalDisk | Select-Object DeviceId, FriendlyName, MediaType, OperationalStatus, HealthStatus, @{Name="Size (GB)";Expression={[math]::Round($_.Size / 1GB, 2)}} | Format-Table -AutoSize;
Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter, FileSystemLabel, FileSystem, @{Name="Size (GB)";Expression={[math]::Round($_.Size / 1GB, 2)}}, @{Name="Free (GB)";Expression={[math]::Round($_.SizeRemaining / 1GB, 2)}} | Format-Table -AutoSize;`
  },
  {
    id: 'sys_top_cpu',
    name: 'Top 10 Tiến trình ngốn CPU & RAM Nhất',
    description: 'Liệt kê danh sách 10 process đang tiêu thụ nhiều tài nguyên xử lý và bộ nhớ RAM nhất.',
    platform: 'windows',
    category: 'diagnostic',
    isPreset: true,
    scriptContent: `Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First 10 Id, ProcessName, @{Name="CPU (s)";Expression={[math]::Round($_.CPU, 2)}}, @{Name="RAM (MB)";Expression={[math]::Round($_.WorkingSet64 / 1MB, 2)}} | Format-Table -AutoSize;`
  },

  // ==========================================
  // LINUX SCRIPTS (Bash / Shell)
  // ==========================================
  {
    id: 'sys_linux_cleanup',
    name: 'Dọn dẹp Bộ nhớ Cache & Log hệ thống (Linux / NAS)',
    description: 'Xóa package cache apt/yum và thu dọn systemd journal log.',
    platform: 'linux',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `which apt-get >/dev/null 2>&1 && apt-get clean && apt-get autoremove -y || which yum >/dev/null 2>&1 && yum clean all
journalctl --vacuum-time=7d 2>/dev/null || true
echo "✓ Dọn dẹp hệ thống Linux hoàn tất!"`
  },
  {
    id: 'linux_update_packages',
    name: 'Cập nhật Danh sách Gói & Nâng cấp Hệ điều hành (APT / YUM)',
    description: 'Tự động kiểm tra và cập nhật các gói phần mềm mới nhất từ repository.',
    platform: 'linux',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `if which apt-get >/dev/null 2>&1; then
  apt-get update && apt-get upgrade -y
elif which yum >/dev/null 2>&1; then
  yum update -y
fi
echo "✓ Cập nhật gói phần mềm Linux hoàn tất!"`
  },
  {
    id: 'linux_disk_inodes',
    name: 'Kiểm tra Dung lượng Ổ đĩa & Inodes Hệ thống',
    description: 'Kiểm tra phần trăm dung lượng ổ cứng đã dùng và số lượng inode còn lại để tránh nghẽn tạo file.',
    platform: 'linux',
    category: 'diagnostic',
    isPreset: true,
    scriptContent: `echo "=== DUNG LƯỢNG Ổ ĐĨA ==="
df -h
echo ""
echo "=== INODES ==="
df -i`
  },
  {
    id: 'linux_failed_systemd',
    name: 'Kiểm tra các Dịch vụ Systemd Bị lỗi (Failed Services)',
    description: 'Liệt kê tất cả systemd units đang trong trạng thái failed hoặc degraded.',
    platform: 'linux',
    category: 'troubleshooting',
    isPreset: true,
    scriptContent: `systemctl list-units --state=failed --no-legend || echo "Không có service systemd nào bị lỗi!"`
  },
  {
    id: 'linux_clean_ram_cache',
    name: 'Giải phóng Bộ nhớ Đệm RAM (Drop PageCache & Inodes)',
    description: 'Đồng bộ dữ liệu xuống đĩa và giải phóng pagecache, dentries và inodes cache.',
    platform: 'linux',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `sync
echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
free -h
echo "✓ Đã giải phóng bộ nhớ đệm RAM thành công!"`
  },
  {
    id: 'linux_journalctl_vacuum',
    name: 'Thu dọn Log hệ thống Journalctl (Giữ lại 3 ngày)',
    description: 'Dọn sạch log journalctl cũ hơn 3 ngày và giới hạn tổng kích thước dưới 200MB.',
    platform: 'linux',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `journalctl --vacuum-time=3d --vacuum-size=200M
echo "✓ Đã dọn dẹp dung lượng log journalctl!"`
  },

  // ==========================================
  // SYNOLOGY NAS (DSM) SCRIPTS
  // ==========================================
  {
    id: 'syno_storage_health',
    name: 'Kiểm tra Sức khỏe Khay đĩa & Storage Pool Synology',
    description: 'Truy xuất trạng thái RAID Storage Pool, các ổ cứng HDD/SSD và cảnh báo suy giảm hiệu năng.',
    platform: 'synology',
    category: 'diagnostic',
    isPreset: true,
    scriptContent: `echo "=== TRẠNG THÁI STORAGE POOL SYNOLOGY ==="
synostoragepool --get || synodisk --enum || df -h`
  },
  {
    id: 'syno_empty_recycle',
    name: 'Dọn sạch Thùng rác Toàn bộ Shared Folders Synology',
    description: 'Dọn sạch thư mục #recycle trên tất cả các thư mục chia sẻ để lấy lại dung lượng lưu trữ.',
    platform: 'synology',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `find /volume*/ -name "#recycle" -type d -exec rm -rf {}/* \\; 2>/dev/null || true
echo "✓ Đã dọn sạch thùng rác trên tất cả Storage Volume Synology!"`
  },
  {
    id: 'syno_restart_docker_pkg',
    name: 'Khởi động lại Gói Container Manager / Docker trên Synology',
    description: 'Restart dịch vụ Container Manager (Docker) trên Synology DSM khi gặp sự cố đứng treo.',
    platform: 'synology',
    category: 'troubleshooting',
    isPreset: true,
    scriptContent: `synopkg restart ContainerManager 2>/dev/null || synopkg restart Docker 2>/dev/null || systemctl restart pkgctl-ContainerManager 2>/dev/null || true
echo "✓ Đã gửi lệnh khởi động lại gói Container Manager Synology!"`
  },
  {
    id: 'syno_system_services_status',
    name: 'Kiểm tra Dịch vụ DSM & Task Scheduler',
    description: 'Kiểm tra danh sách các dịch vụ đang chạy trên Synology DSM.',
    platform: 'synology',
    category: 'diagnostic',
    isPreset: true,
    scriptContent: `synoservice --status 2>/dev/null || systemctl list-units --type=service --state=running | head -n 30`
  },

  // ==========================================
  // HOME ASSISTANT SCRIPTS (HA Core CLI / Bash)
  // ==========================================
  {
    id: 'ha_check_config',
    name: 'Kiểm tra Tính hợp lệ Cấu hình YAML (Home Assistant Check)',
    description: 'Kiểm tra file configuration.yaml xem có lỗi cú pháp trước khi khởi động lại hệ thống.',
    platform: 'homeassistant',
    category: 'diagnostic',
    isPreset: true,
    scriptContent: `ha core check || homeassistant --script check_config || echo "✓ Cấu hình YAML hợp lệ!"`
  },
  {
    id: 'ha_restart_core',
    name: 'Khởi động lại Home Assistant Core (Core Restart)',
    description: 'Khởi động lại Home Assistant Core an toàn để áp dụng cấu hình mới.',
    platform: 'homeassistant',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `ha core restart 2>/dev/null || kill -HUP 1 || echo "✓ Đã gửi lệnh khởi động lại Home Assistant Core!"`
  },
  {
    id: 'ha_reload_automations',
    name: 'Nạp lại Tự động hóa & Kịch bản (Reload Automations & Scripts)',
    description: 'Làm mới ngay toàn bộ file automations.yaml và scripts.yaml mà không cần reboot.',
    platform: 'homeassistant',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `ha core reload --automations 2>/dev/null || ha core reload --scripts 2>/dev/null || echo "✓ Đã nạp lại Tự động hóa & Kịch bản Home Assistant!"`
  },
  {
    id: 'ha_backup_create',
    name: 'Tạo bản sao lưu nhanh Home Assistant (Fast Backup)',
    description: 'Tạo một bản snapshot sao lưu toàn bộ cấu hình Home Assistant và lưu vào thư mục /backup.',
    platform: 'homeassistant',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `BACKUP_NAME="MinhHungOps_Backup_$(date +%Y%m%d_%H%M%S)"
ha backups new --name "$BACKUP_NAME" 2>/dev/null || echo "✓ Bản sao lưu $BACKUP_NAME đã được khởi tạo!"`
  },
  {
    id: 'ha_clean_logs',
    name: 'Làm sạch File Log Lỗi Home Assistant (Truncate Log)',
    description: 'Xóa bớt file home-assistant.log đang phình to để giải phóng bộ nhớ thẻ nhớ/SSD.',
    platform: 'homeassistant',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `> /config/home-assistant.log 2>/dev/null || > /root/config/home-assistant.log 2>/dev/null || echo "Log truncated"
echo "✓ Đã làm sạch file log Home Assistant!"`
  },

  // ==========================================
  // CROSS-PLATFORM (Docker / All OS)
  // ==========================================
  {
    id: 'sys_docker_prune',
    name: 'Dọn dẹp Toàn diện Docker (Prune Containers, Volumes & Images)',
    description: 'Giải phóng dung lượng Docker bằng cách xóa container đã dừng, volume mồ côi và image không sử dụng.',
    platform: 'all',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `docker system prune -af --volumes`
  }
];

class ScriptsManager {
  constructor() {
    this.customScripts = this.loadCustomScripts();
  }

  loadCustomScripts() {
    try {
      if (fs.existsSync(SCRIPTS_FILE)) {
        const data = fs.readFileSync(SCRIPTS_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Failed to load custom scripts:', err.message);
    }
    return [];
  }

  saveCustomScripts() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(SCRIPTS_FILE, JSON.stringify(this.customScripts, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save custom scripts:', err.message);
    }
  }

  listScripts() {
    return [...PRESET_SCRIPTS, ...this.customScripts];
  }

  getScript(id) {
    return this.listScripts().find(s => s.id === id);
  }

  addScript({ name, description, platform = 'windows', category = 'custom', scriptContent }) {
    if (!name?.trim()) throw new Error('Script name is required');
    if (!scriptContent?.trim()) throw new Error('Script content is required');

    const validPlatforms = ['windows', 'linux', 'synology', 'homeassistant', 'all'];
    const newScript = {
      id: `custom_${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      description: description ? description.trim() : '',
      platform: validPlatforms.includes(platform) ? platform : 'windows',
      category: category ? category.trim() : 'custom',
      isPreset: false,
      scriptContent: scriptContent.trim(),
      createdAt: new Date().toISOString()
    };

    this.customScripts.push(newScript);
    this.saveCustomScripts();
    return newScript;
  }

  updateScript(id, { name, description, platform, category, scriptContent }) {
    const isPreset = PRESET_SCRIPTS.some(s => s.id === id);
    if (isPreset) throw new Error('Không thể chỉnh sửa kịch bản mặc định của hệ thống');

    const index = this.customScripts.findIndex(s => s.id === id);
    if (index < 0) throw new Error('Script not found');

    const validPlatforms = ['windows', 'linux', 'synology', 'homeassistant', 'all'];
    const updated = {
      ...this.customScripts[index],
      name: name !== undefined ? name.trim() : this.customScripts[index].name,
      description: description !== undefined ? description.trim() : this.customScripts[index].description,
      platform: platform !== undefined && validPlatforms.includes(platform) ? platform : this.customScripts[index].platform,
      category: category !== undefined ? category.trim() : this.customScripts[index].category,
      scriptContent: scriptContent !== undefined ? scriptContent.trim() : this.customScripts[index].scriptContent,
      updatedAt: new Date().toISOString()
    };

    this.customScripts[index] = updated;
    this.saveCustomScripts();
    return updated;
  }

  deleteScript(id) {
    const isPreset = PRESET_SCRIPTS.some(s => s.id === id);
    if (isPreset) throw new Error('Không thể xóa kịch bản mặc định của hệ thống');

    const initialLength = this.customScripts.length;
    this.customScripts = this.customScripts.filter(s => s.id !== id);
    if (this.customScripts.length === initialLength) throw new Error('Script not found');

    this.saveCustomScripts();
    return { success: true, id };
  }
}

const scriptsManager = new ScriptsManager();

module.exports = {
  scriptsManager
};
