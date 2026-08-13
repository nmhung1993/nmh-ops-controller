# Windows Controller Fleet

Windows Controller Fleet là webapp giám sát và điều khiển tập trung tối đa khoảng 20 máy Windows trong cùng mạng LAN tin cậy. Một máy chạy **Central Server**, còn mỗi máy cần quản lý chạy **Windows Agent**. Máy Central Server cũng nên cài Agent để xuất hiện và được quản lý giống các máy còn lại.

> Bản triển khai mặc định dùng HTTP trong LAN. Không port-forward TCP 3003 và không đưa trực tiếp dịch vụ này ra Internet. Nếu dùng ngoài LAN tin cậy, hãy đặt server sau HTTPS/reverse proxy.

## Kiến trúc

```text
Trình duyệt -- HTTP/WebSocket --> Central Server (Node.js + Express + SQLite)
                                      ^
                                      | WebSocket outbound
                               Windows Agent Service
                                      |
                         Named Pipe có secret và ACL nội bộ
                                      |
                         Desktop Helper khi người dùng login

Windows Agent Service
  |-- Node.js/os + PowerShell/CIM: CPU, RAM, disk, network, process
  |-- nvidia-smi: nhiệt độ/công suất GPU NVIDIA
  |-- ACPI WMI + Windows Energy/Power Meter: sensor chuẩn do Windows cung cấp
  `-- LibreHardwareMonitorLib + PawnIO: CPU Package, mainboard, storage và sensor thấp tầng
```

### Vai trò của từng thành phần

- **Central Server** cung cấp web UI, REST API `/api/v1`, WebSocket cho UI/Agent, xác thực người dùng, phê duyệt Agent, lưu SQLite, backup, cleanup và gửi Discord webhook.
- **Windows Agent Service** chạy bằng `LocalSystem`, tự khởi động cùng Windows, thu thập telemetry, chạy watchdog và chỉ nhận các command đã định nghĩa sẵn.
- **Desktop Helper** chạy trong interactive user session khi đăng nhập, dùng Named Pipe để nhận yêu cầu mở/đưa cửa sổ lên trước và chụp screenshot. Service trong Session 0 không thể tự thao tác cửa sổ desktop.
- **WinSW** chỉ bọc Node.js thành Windows Service và giữ service chạy nền. WinSW không có engine đọc nhiệt độ hay công suất.
- **Hardware Probe** là bridge .NET chạy nền bằng `SYSTEM`, đọc trực tiếp `LibreHardwareMonitorLib` và ghi snapshot JSON mỗi 5 giây.
- **PawnIO** là driver thấp tầng đi kèm LibreHardwareMonitor, cho phép đọc MSR/LPC trên phần cứng được hỗ trợ, đặc biệt hữu ích với CPU Xeon/X99.

## Engine thu thập dữ liệu

| Dữ liệu | Engine/nguồn | Cơ chế |
|---|---|---|
| CPU usage | Node.js `os.cpus()` | Tính delta idle/total giữa hai lần lấy mẫu, không dùng giá trị tích lũy trực tiếp. |
| RAM, uptime, OS | Node.js `os` | Đọc tổng RAM, RAM trống, uptime và phiên bản Windows. |
| Disk | PowerShell/CIM `Win32_LogicalDisk` | Đọc dung lượng tổng, đã dùng và còn trống; cache 30 giây. |
| Network | `Get-NetAdapterStatistics` | Tính tốc độ gửi/nhận từ delta byte theo thời gian. |
| Process | PowerShell `Get-Process` | Danh sách tải theo yêu cầu; CPU process được tính theo delta và số logical core. |
| GPU NVIDIA | `nvidia-smi` | Đọc nhiệt độ GPU, công suất hiện tại và power limit. |
| ACPI temperature | WMI `MSAcpi_ThermalZoneTemperature` | Chỉ có dữ liệu khi BIOS/firmware công bố thermal zone cho Windows. |
| System power meter | Windows `Energy Meter`/`Power Meter` counter | Nếu có, đây là công suất tổng thật. Nếu không có, ứng dụng chỉ cộng các linh kiện đọc được và đánh dấu `partial`. |
| CPU/mainboard/storage | `LibreHardwareMonitorLib` | Bridge .NET đọc CPU Package, core, Super-I/O/LPC, GPU và SMART/NVMe sensor được phần cứng hỗ trợ. |
| Low-level MSR/LPC | PawnIO | Mở quyền truy cập thanh ghi thấp tầng cho LibreHardwareMonitor. Không tự tạo sensor nếu BIOS/chip không hỗ trợ. |

Ứng dụng không ước lượng nhiệt độ hoặc công suất bị thiếu. Sensor không hợp lệ như ngưỡng NVMe, công suất `0 W`, hoặc AUXTIN bị hở trên Nuvoton NCT6779D được loại bỏ thay vì hiển thị như dữ liệu thật.

## Yêu cầu

- Windows 10/11 hoặc Windows Server.
- Node.js `22.5+`; khuyến nghị Node.js 24 LTS.
- Tài khoản Administrator để cài service, Scheduled Task, firewall và PawnIO.
- Windows Firewall cho phép TCP 3003 từ **LocalSubnet**; profile Public/Domain vẫn dùng được nếu LAN được quản trị tin cậy.
- Central Server nên có static IP hoặc DHCP reservation.
- Kết nối Internet trong lần cài đầu để tải npm package, WinSW, LibreHardwareMonitor và .NET runtime. LibreHardwareMonitor có thể dùng ZIP offline, nhưng các dependency khác vẫn phải có sẵn.

Kiểm tra Node.js:

```powershell
node --version
npm --version
```

## Cài Central Server

Mở PowerShell bằng **Run as administrator**, chuyển tới thư mục project rồi chạy đúng một installer server:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\install-server.ps1 -Port 3003
```

Installer server sẽ:

- copy backend, UI và dependency manifest vào `%ProgramData%\WindowsController\server`;
- chạy `npm ci --omit=dev`;
- tải WinSW nếu máy chưa có bản dành cho ứng dụng;
- tạo service tự khởi động `Windows Controller Central Server`;
- bind webapp tại `0.0.0.0:3003`;
- mở inbound TCP 3003 cho LocalSubnet trên mọi Windows network profile (không mở toàn Internet);
- tạo SQLite, JWT secret ngẫu nhiên và thư mục backup;
- import dữ liệu JSON cũ ở lần chạy đầu nếu có.

Cuối quá trình, installer in các URL LAN, ví dụ:

```text
http://192.168.1.10:3003
```

Mở URL từ trình duyệt. Nếu chưa có user, trang đầu tiên yêu cầu tạo tài khoản quản trị đầu tiên. Tài khoản đầu tiên là **Super Admin** và ứng dụng không có mật khẩu mặc định.

### Cài Agent trên chính máy Central Server

Central Server không tự giám sát hệ điều hành của nó. Sau khi cài server, tiếp tục chạy installer Agent trên cùng máy:

```powershell
.\agent\install-agent.ps1 -ServerUrl "http://192.168.1.10:3003"
```

Sau đó approve máy này trong trang Admin giống mọi Agent khác.

## Cài Agent bằng một file duy nhất

Giữ nguyên toàn bộ thư mục `agent` trên máy client, nhưng quản trị viên **chỉ cần chạy một entry point** là `install-agent.ps1`. Không cần chạy riêng `install-hardware-monitor.ps1` trong quy trình thông thường.

Mở PowerShell bằng **Run as administrator**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\agent\install-agent.ps1 -ServerUrl "http://192.168.1.10:3003"
```

Thay `192.168.1.10` bằng IP cố định của Central Server.

Một lần chạy trên sẽ tự động:

1. kiểm tra URL server và Node.js;
2. copy Agent runtime vào `%ProgramData%\WindowsController\agent`;
3. cài production dependency;
4. tạo WinSW service `Windows Controller Agent` chạy bằng `LocalSystem` và ẩn cửa sổ;
5. tạo Desktop Helper Scheduled Task chạy khi user hiện tại đăng nhập;
6. tạo Named Pipe secret và ACL cục bộ;
7. tạo outbound firewall rule cho port của Central Server;
8. gọi hardware installer nội bộ;
9. tải/cài LibreHardwareMonitor và local .NET 10 SDK/Windows Desktop Runtime;
10. build Hardware Probe, cài PawnIO và tạo Scheduled Task `Windows Controller Hardware Monitor`;
11. in hostname và MachineGuid fingerprint để Admin đối chiếu.

### Tùy chọn Agent installer

Bỏ qua hardware monitor trên máy không cần sensor nhiệt/công suất:

```powershell
.\agent\install-agent.ps1 `
  -ServerUrl "http://192.168.1.10:3003" `
  -SkipHardwareMonitor
```

Dùng gói LibreHardwareMonitor ZIP đã tải từ repository chính thức:

```powershell
.\agent\install-agent.ps1 `
  -ServerUrl "http://192.168.1.10:3003" `
  -HardwareMonitorPackagePath "C:\Install\LibreHardwareMonitor.NET.10.zip"
```

`install-hardware-monitor.ps1` vẫn được giữ để sửa chữa hoặc cài lại riêng phần sensor, nhưng không còn là bước bắt buộc sau khi cài Agent.

## Phê duyệt Agent

1. Installer in `Hostname` và `Fingerprint` ở cuối.
2. Đăng nhập web bằng tài khoản Super Admin.
3. Mở **Admin → Pending agents**.
4. So sánh hostname/fingerprint với màn hình installer.
5. Chọn **Approve** và đặt display name.
6. Agent nhận token riêng; token được bảo vệ bằng Windows DPAPI machine scope.

Agent chưa approve hoặc đã revoke không thể gửi telemetry hợp lệ hay nhận command. Chỉ Super Admin có thể approve/revoke Agent và cài lại để enroll lại khi cần.

## Phân quyền user theo máy

Hệ thống có ba role:

- **Super Admin**: thấy và quản lý toàn bộ máy; approve/revoke Agent; tạo, sửa, xóa user; phân danh sách máy; quản lý Discord/settings. Tài khoản được tạo trong First-run Setup là Super Admin mặc định.
- **Admin**: chỉ thấy các máy được Super Admin gán và có quyền quản lý các máy đó, gồm process kill, launch, capture và chỉnh Watchdog. Admin không được quản lý user, pending Agent hoặc settings toàn hệ thống.
- **Viewer**: chỉ xem telemetry, process đã ẩn path, Watchdog và activity của các máy được gán; không được gửi command hay thay đổi cấu hình.

Để phân máy: mở **Admin → Tài khoản người dùng → Chỉnh sửa**, chọn role và đánh dấu danh sách máy. Ví dụ `adminA` được gán máy A sẽ không thể thấy hoặc gọi API của máy B. Việc chặn được thực thi tại REST API, WebSocket và endpoint screenshot, không chỉ ẩn bằng giao diện.

Khi nâng cấp database cũ, tài khoản admin được tạo sớm nhất sẽ thành Super Admin. Các admin/viewer cũ được giữ quyền trên những máy đã tồn tại tại thời điểm migration để tránh mất truy cập; Super Admin có thể chỉnh lại danh sách sau đó.

## Hướng dẫn sử dụng

### Fleet Overview

- Super Admin xem tất cả máy đã approve; Admin/Viewer chỉ thấy các máy được phân quyền, cùng trạng thái online/offline, last seen, CPU, RAM và cảnh báo.
- Agent được xem là offline nếu Central Server không nhận heartbeat trong 20 giây.
- Chọn một host để Dashboard, Processes và Watchdog giữ đúng `hostId` khi reload.

### Dashboard

- Telemetry realtime được Agent gửi mỗi 2 giây.
- Server chỉ ghi telemetry lịch sử tối đa mỗi 10 giây để giảm kích thước database.
- Theo dõi CPU, RAM, uptime, network, disk, nhiệt độ và công suất theo linh kiện.
- `totalWatts` chỉ là công suất tổng thật khi nguồn là Windows Energy/Power Meter; nếu cộng từ một số linh kiện, coverage hiển thị `partial`.

### Processes

- Danh sách process chỉ tải khi mở trang hoặc refresh, không truyền liên tục.
- Viewer chỉ xem và không thấy executable path. Admin được phân máy và Super Admin có thể kill process hoặc yêu cầu capture cửa sổ.
- CPU process được tính từ delta CPU time, tránh nhầm giá trị CPU tích lũy.

### Watchdog

- Mỗi rule có process name, executable path, trạng thái enable, `runMode` và tùy chọn screenshot.
- `runMode: service` chạy executable trong Session 0, phù hợp service/background process.
- `runMode: interactive` yêu cầu user đã login và Desktop Helper đang chạy, phù hợp ứng dụng GUI.
- Agent cache rule/version và kiểm tra mỗi 10 giây, nên watchdog vẫn restart process khi Central Server offline.
- Nút **Launch** sẽ tìm cửa sổ hợp lệ có kích thước lớn hơn `0x0`, restore/bring-to-front nếu process đã chạy, hoặc launch executable nếu chưa chạy.
- Với launch mới, Agent chờ khoảng 30 giây rồi capture; với cửa sổ đã tồn tại, capture bắt đầu sớm hơn và có retry.

### Screenshot và Discord

- Desktop Helper ưu tiên `PrintWindow`, sau đó dùng screen-copy fallback.
- Nếu không có user session, command interactive trả `interactive_session_unavailable`.
- Central Server giữ Discord webhook; webhook không được gửi xuống Agent.
- Event launch/watchdog được gửi bằng nội dung tiếng Việt. Khi capture thành công, Central Server đính kèm screenshot; khi thất bại, gửi một thông báo lỗi thay thế.
- Cấu hình Discord webhook trong trang Admin settings.

### Giao diện

- UI hỗ trợ tiếng Việt và tiếng Anh.
- Theme sáng/tối được lưu trên trình duyệt.
- Viewer chỉ xem máy được gán; Admin quản lý máy được gán; Super Admin quản lý toàn bộ fleet, user, approval và settings.

## Cơ chế realtime và offline

- Agent gửi telemetry mỗi 2 giây và ping mỗi 5 giây.
- Central Server đánh dấu offline trong tối đa 20 giây.
- Khi mất kết nối, Agent giữ tối đa 300 telemetry frame, tương đương khoảng 10 phút, và tối đa 1.000 event.
- WebSocket reconnect dùng exponential backoff từ 1 đến 30 giây. Agent cũng tự retry khi bước tạo kết nối/fingerprint lỗi và chủ động đóng socket nếu không nhận phản hồi từ server trong 20 giây.
- Khi nâng cấp mã Agent, chạy `install-agent.ps1` một lần để cập nhật runtime service. Sau đó các lần Central Server restart hoặc mất mạng không cần cài lại Agent.
- Frame dùng envelope gồm `type`, `messageId`, `agentId`, `sentAt`, `seq`, `payload`.
- Agent lưu tối đa 500 command đã hoàn tất để tránh thực thi lại cùng `commandId`.
- Command hết hạn sau 60 giây và có trạng thái `queued`, `sent`, `acknowledged`, `succeeded`, `failed` hoặc `expired`.
- Chỉ hỗ trợ `process.kill`, `watchdog.launch`, `window.capture`; không có remote shell hay arbitrary command execution.

## Lưu trữ, retention và backup

Central Server dùng SQLite qua engine `node:sqlite` ở WAL mode:

```text
Development: .\data\windows-controller.db
Service:     C:\ProgramData\WindowsController\server\data\windows-controller.db
```

- Telemetry: 7 ngày.
- Screenshot: 7 ngày và tối đa tổng cộng 1 GB.
- Event và command audit: 30 ngày.
- Backup nhất quán bằng `VACUUM INTO`: mỗi ngày tại `data\backups`.
- JSON legacy được backup trước khi migration.

Chart.js được phục vụ từ thư mục `public`, không phụ thuộc CDN nên UI vẫn chạy khi LAN mất Internet.

## Bảo mật

- Agent kết nối outbound tới server; client không cần mở inbound port.
- Agent mới luôn ở trạng thái pending.
- Mỗi Agent có token ngẫu nhiên riêng; server chỉ lưu SHA-256 hash, client lưu token bằng DPAPI.
- Web UI/WebSocket dùng JWT.
- Password được hash bằng bcrypt.
- Named Pipe Desktop Helper dùng secret cục bộ và ACL giới hạn.
- Secret/path nhạy cảm bị giới hạn theo role.
- Mọi host-scoped REST API, WebSocket event và screenshot đều kiểm tra bảng `user_host_access`.
- Không thể xóa hoặc hạ quyền Super Admin cuối cùng.
- Không có tài khoản, password hoặc JWT secret hardcode.
- HTTP không mã hóa credential/token trên đường truyền; chỉ dùng trong LAN tin cậy hoặc chuyển sang HTTPS.

## Thư mục và log quan trọng

```text
C:\ProgramData\WindowsController\server
  data\windows-controller.db
  data\backups
  data\screenshots
  WindowsControllerServer.*.log

C:\ProgramData\WindowsController\agent
  runtime
  state
  helper\desktop-helper.log
  WindowsControllerAgent.*.log

C:\ProgramData\WindowsController\hardware-monitor
  hardware-sensors.json
  hardware-report.txt
  hardware-probe.log
  pawnio-installed.txt
```

Kiểm tra service và task:

```powershell
Get-Service WindowsControllerServer, WindowsControllerAgent
Get-ScheduledTask -TaskName 'Windows Controller Desktop Helper','Windows Controller Hardware Monitor'
```

## Xử lý sự cố

### Agent không xuất hiện trong Pending agents

```powershell
Get-Service WindowsControllerAgent
Get-Content 'C:\ProgramData\WindowsController\agent\WindowsControllerAgent.out.log' -Tail 50
Get-Content 'C:\ProgramData\WindowsController\agent\WindowsControllerAgent.err.log' -Tail 50
Test-NetConnection 192.168.1.10 -Port 3003
```

Kiểm tra `ServerUrl`, firewall server, LocalSubnet và việc browser có mở được URL server từ máy Agent hay không.

### Không có nhiệt độ/công suất

```powershell
Get-ScheduledTask -TaskName 'Windows Controller Hardware Monitor'
Get-Content 'C:\ProgramData\WindowsController\hardware-monitor\hardware-probe.log' -Tail 50
Get-Content 'C:\ProgramData\WindowsController\hardware-monitor\pawnio-installed.txt'
Get-Content 'C:\ProgramData\WindowsController\hardware-monitor\hardware-sensors.json'
```

Không phải bo mạch/CPU nào cũng công bố sensor. Nếu PawnIO đã cài nhưng report vẫn không có `CPU Package`, `TjMax` bằng 0 hoặc không tìm thấy Super-I/O, ứng dụng sẽ báo unavailable thay vì tạo giá trị giả.

### Nuvoton NCT6779D hiển thị 108–109°C

Một số bo X99 trả các kênh hở dưới tên `Temperature #4/#5/#6`, tương ứng AUXTIN1/2/3. Agent map lại sensor NCT6779D, loại các AUXTIN từ 100°C trở lên, ưu tiên `Mainboard`, đồng thời giữ `CPU (PECI)` thành sensor CPU dự phòng.

Sau khi update source, chạy lại một installer Agent duy nhất:

```powershell
.\agent\install-agent.ps1 -ServerUrl "http://192.168.1.10:3003"
```

### `interactive_session_unavailable`

- Đảm bảo có user đăng nhập trực tiếp/RDP và desktop chưa bị logoff.
- Kiểm tra Scheduled Task `Windows Controller Desktop Helper` đang Running/Ready.
- Dùng `runMode: interactive` cho GUI; `service` chỉ dành cho process nền.
- Xem `%ProgramData%\WindowsController\agent\helper\desktop-helper.log`.

## Gỡ cài đặt

Gỡ Agent, Desktop Helper và Hardware Monitor Scheduled Task nhưng giữ các file dữ liệu/PawnIO:

```powershell
.\agent\uninstall-agent.ps1
```

Giữ Hardware Monitor tiếp tục chạy khi gỡ Agent:

```powershell
.\agent\uninstall-agent.ps1 -KeepHardwareMonitor
```

Chỉ dùng `-RemoveData` khi thực sự muốn xóa Agent state, hardware monitor runtime và local .NET runtime:

```powershell
.\agent\uninstall-agent.ps1 -RemoveData
```

PawnIO driver được giữ lại vì có thể đang được LibreHardwareMonitor hoặc công cụ khác sử dụng.

Gỡ service Central Server nhưng giữ database: mở PowerShell Administrator và chạy các lệnh sau tại thư mục cài đặt:

```powershell
$root = 'C:\ProgramData\WindowsController\server'
& "$root\WindowsControllerServer.exe" stop
& "$root\WindowsControllerServer.exe" uninstall
Remove-NetFirewallRule -DisplayName 'Windows Controller Central Server' -ErrorAction SilentlyContinue
```

Không xóa `$root\data` nếu còn cần SQLite, screenshot hoặc backup.

## API chính

Tất cả endpoint fleet đều host-scoped dưới `/api/v1`:

```text
GET    /hosts
GET    /hosts/:id
GET    /hosts/:id/telemetry
GET    /hosts/:id/processes
POST   /hosts/:id/commands
GET    /hosts/:id/watchdog
PUT    /hosts/:id/watchdog
GET    /hosts/:id/events
GET    /hosts/:id/commands
GET    /agents/pending
POST   /agents/:id/approve
POST   /agents/:id/revoke
GET    /users
POST   /users
PUT    /users/:username
DELETE /users/:username
```

Agent realtime dùng `/ws/agent`; browser realtime dùng `/ws/ui` trên cùng port.

## Chạy development và test

```powershell
npm.cmd install
# Mở PowerShell bằng quyền Administrator nếu Central Server service đang chạy
npm.cmd run dev
```

Mở `http://localhost:3003`. Dev launcher tạm dừng service `WindowsControllerServer`, phục vụ trực tiếp `server/` và `public/` trong repository, nhưng vẫn dùng database tại `C:\ProgramData\WindowsController\server\data`. Vì vậy thay đổi CSS/HTML chỉ cần refresh trình duyệt, không cần chạy lại `install-server.ps1`, và Agent vẫn giữ nguyên danh tính/token đã được duyệt.

Nhấn `Ctrl+C` để thoát dev mode; launcher sẽ tự khởi động lại Central Server service. Nếu không có service đã cài và muốn dùng database trong source, chạy `npm.cmd run dev:standalone`.

Chạy Agent không cài service:

```powershell
Copy-Item .\agent\config.example.json .\agent\config.json
# Sửa serverUrl trong config.json
node .\agent\agent.js --config .\agent\config.json
```

Kiểm tra source và test:

```powershell
npm.cmd run check
npm.cmd test
```

## Synology DSM Agent

Synology dùng Agent Linux riêng trong thư mục `synology-agent`. Agent này dùng cùng WebSocket enrollment/token với Agent Windows và hỗ trợ:

- CPU delta từ `/proc/stat`, RAM từ `/proc/meminfo`, network rate từ `/proc/net/dev`;
- volume từ `df`, process snapshot từ `ps`;
- nhiệt độ/công suất nếu DSM expose sensor qua `/sys/class/thermal` hoặc `/sys/class/hwmon`;
- `process.kill`, watchdog process và launch executable nền;
- cache telemetry/event, heartbeat và reconnect exponential backoff.

Không hỗ trợ Desktop Helper, interactive window, screenshot hoặc LibreHardwareMonitor.

### Cài trên Synology

1. Cài package Node.js 18+ trong Synology Package Center.
2. Bật SSH, copy toàn bộ thư mục `synology-agent` lên NAS.
3. Chạy bằng `root`:

```sh
sudo sh ./synology-agent/install-synology.sh \
  --server-url http://192.168.1.10:3003
```

Mặc định Agent được cài tại `/volume1/@appdata/windows-controller-agent` và tạo startup script `/usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh`.

```sh
# Trạng thái và log
sudo /usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh status
tail -f /volume1/@appdata/windows-controller-agent/agent.log

# Gỡ service nhưng giữ identity/token để có thể cài lại mà không enroll máy mới
sudo sh ./synology-agent/uninstall-synology.sh
```

Sau khi Agent kết nối lần đầu, duyệt hostname/fingerprint trong trang Admin giống Agent Windows.

## Home Assistant Connector

Home Assistant dùng connector chỉ đọc qua REST API. Connector gửi CPU/RAM nếu đã có entity System Monitor, số lượng entity, entity unavailable và các sensor nhiệt độ/công suất được chọn. Connector không nhận lệnh process, watchdog, launch hoặc screenshot.

### Home Assistant OS / Supervised Add-on

1. Copy thư mục `homeassistant-addon` vào `/addons/windows_controller_connector` trên máy Home Assistant.
2. Vào **Settings → Add-ons → Add-on Store**, mở menu và chọn **Check for updates**.
3. Cài **Windows Controller Home Assistant Connector**.
4. Điền `central_server_url`. Giữ `home_assistant_url` là `http://supervisor/core`; Supervisor token được cấp tự động.
5. Chọn entity CPU/RAM và danh sách sensor muốn tổng hợp:

```yaml
cpu_entity_id: sensor.processor_use
memory_entity_id: ""
memory_used_entity_id: sensor.memory_use
memory_free_entity_id: sensor.memory_free
disk_used_percent_entity_id: sensor.system_monitor_disk_use_percent
disk_free_entity_id: sensor.system_monitor_disk_free
power_entity_ids:
  - sensor.server_total_power
temperature_entity_ids:
  - sensor.cpu_package_temperature
```

Connector tự đổi `sensor.memory_use` và `sensor.memory_free` từ MiB sang byte, sau đó tính tổng RAM và phần trăm đang dùng. Với ổ đĩa, connector kết hợp `sensor.system_monitor_disk_use_percent` với `sensor.system_monitor_disk_free` theo GiB để suy ra dung lượng tổng, đã dùng và còn trống. `memory_entity_id` chỉ là phương án tương thích cũ khi hệ thống có một sensor RAM phần trăm duy nhất.

Chỉ thêm các power entity không chồng lặp vì `TOTAL POWER` là tổng của danh sách `power_entity_ids`.

Nếu log báo `home_assistant_http_401_supervisor_token_rejected`, hãy kiểm tra add-on có bật `homeassistant_api: true`, URL chính xác là `http://supervisor/core` và add-on đã được **Rebuild** sau khi thay đổi manifest. Nếu chạy Home Assistant Container/Core bằng URL trực tiếp (ví dụ `http://homeassistant:8123`), không dùng `SUPERVISOR_TOKEN`; hãy tạo **Long-Lived Access Token** rồi điền vào `home_assistant_token`.

Khi cập nhật source add-on, cần copy cả `Dockerfile`, `build.yaml`, `config.yaml`, `package.json`, `agent.js` và `run.sh`, sau đó chọn **Rebuild**. File `build.yaml` ánh xạ đúng Home Assistant base image cho `amd64`, `aarch64` và `armv7`.

### Home Assistant Container/Core

Tạo long-lived access token trong Home Assistant profile, sao chép `config.example.json`, sau đó chạy connector cạnh Home Assistant:

```sh
cd homeassistant-addon
cp config.example.json config.json
npm install --omit=dev
node agent.js --config ./config.json
```

Nên quản lý process này bằng systemd, Docker restart policy hoặc process supervisor của host. Sau lần kết nối đầu tiên, approve connector trong Central Server.

Central Server dùng trường `capabilities` để tự ẩn chức năng không tương thích. Vì vậy Home Assistant không hiển thị kill/screenshot/watchdog, còn Synology không hiển thị các thao tác cửa sổ Windows.

---

## English quick guide

Windows Controller Fleet monitors and controls up to roughly 20 Windows hosts on a trusted LAN. Install the Central Server on one machine and install an Agent on every managed machine, including the Central Server itself.

Optional platform connectors are included for Synology DSM (`synology-agent`) and Home Assistant (`homeassistant-addon`). Synology supports Linux telemetry, processes and watchdog rules. Home Assistant is read-only and publishes configured REST API entities; platform capabilities automatically hide unsupported Windows commands in the UI.

### Requirements

- Windows 10/11 or Windows Server
- Node.js 22.5+ (Node.js 24 LTS recommended)
- Administrator rights
- Trusted LAN; inbound TCP is limited to the Windows `LocalSubnet` firewall scope
- Static IP or DHCP reservation for the Central Server

### Install the Central Server

Run in an elevated PowerShell terminal:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\deploy\install-server.ps1 -Port 3003
```

Open the printed `http://<server-ip>:3003` URL and create the first account. The first account is the default Super Admin.

### Install an Agent with one installer entry point

Keep the complete `agent` directory, but run only `install-agent.ps1`:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\agent\install-agent.ps1 -ServerUrl "http://192.168.1.10:3003"
```

By default this single command installs the WinSW Agent service, Desktop Helper, firewall rule, LibreHardwareMonitor bridge, local .NET runtime and PawnIO. Use `-SkipHardwareMonitor` only when hardware temperature/power monitoring is not required. Use `-HardwareMonitorPackagePath` for an offline official LibreHardwareMonitor ZIP.

Approve the printed hostname/fingerprint in **Admin → Pending agents**.

### Host-scoped access control

- **Super Admin** sees every host and manages users, assignments, enrollment and settings.
- **Admin** can view and control only assigned hosts.
- **Viewer** has read-only access to assigned hosts.

Use **Admin → Users → Edit** to select a role and the allowed machine list. Enforcement applies to REST, WebSocket and screenshot access, not only to UI visibility.

### Data engines

- Node.js `os` delta sampling: CPU, RAM, uptime and OS.
- PowerShell/CIM: disks, network and processes.
- `nvidia-smi`: NVIDIA GPU temperature and power.
- ACPI WMI and Windows Energy/Power Meter: firmware/OS-exposed sensors.
- `LibreHardwareMonitorLib` plus PawnIO: supported CPU package, motherboard/Super-I/O, GPU and storage sensors.
- WinSW hosts the services only; it does not read hardware sensors.

### Runtime

- Telemetry every 2 seconds; persisted at most every 10 seconds.
- Heartbeat every 5 seconds; offline within 20 seconds.
- Watchdog every 10 seconds using cached versioned rules.
- 7-day telemetry/screenshots, 30-day events/commands, daily SQLite backups.
- Only predefined commands are supported: process kill, watchdog launch and window capture. There is no remote shell.

### Important paths

```text
C:\ProgramData\WindowsController\server
C:\ProgramData\WindowsController\agent
C:\ProgramData\WindowsController\hardware-monitor
```

This deployment uses HTTP and must not be exposed directly to the Internet. Use HTTPS before operating outside a trusted LAN.

## Linux Agent

Linux hosts use `linux-agent`, a standalone Node.js agent that speaks the same authenticated `/ws/agent` protocol as Windows and Synology agents. It collects CPU, memory, uptime, disk, network, process, thermal and power telemetry from `/proc`, `df`, and Linux sysfs. It supports process listing/killing, watchdog launch, offline buffers, reconnect backoff, pending enrollment, and manual approval.

Requirements: Linux with `systemd`, Node.js 18+, npm, and root privileges for installation. From the repository checkout:

```sh
sudo ./linux-agent/install-linux.sh --server-url http://192.168.1.10:3003
```

The installer copies the runtime to `/var/lib/windows-controller-agent`, creates a `600`-permission config and state directory, installs dependencies, and enables `windows-controller-agent.service`. Approve the hostname under **Admin -> Pending agents**. Check runtime status with:

```sh
systemctl status windows-controller-agent.service
journalctl -u windows-controller-agent.service -n 50 --no-pager
```

Linux watchdog rules must use absolute executable paths and `runMode: service`; interactive desktop capture is not available on headless Linux hosts.
