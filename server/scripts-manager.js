const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const SCRIPTS_FILE = path.join(DATA_DIR, 'scripts.json');

const PRESET_SCRIPTS = [
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
  {
    id: 'sys_docker_prune',
    name: 'Dọn dẹp Toàn diện Docker (Prune Containers & Images)',
    description: 'Giải phóng dung lượng Docker bằng cách xóa container đã dừng, volume mồ côi và image không sử dụng.',
    platform: 'all',
    category: 'maintenance',
    isPreset: true,
    scriptContent: `docker system prune -af --volumes`
  },
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

    const newScript = {
      id: `custom_${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim(),
      description: description ? description.trim() : '',
      platform: ['windows', 'linux', 'all'].includes(platform) ? platform : 'windows',
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

    const updated = {
      ...this.customScripts[index],
      name: name !== undefined ? name.trim() : this.customScripts[index].name,
      description: description !== undefined ? description.trim() : this.customScripts[index].description,
      platform: platform !== undefined ? platform : this.customScripts[index].platform,
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
