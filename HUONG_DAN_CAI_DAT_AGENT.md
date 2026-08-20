# Hướng Dẫn Chi Tiết Cài Đặt Agent (Windows, Linux, Synology NAS, Home Assistant)

Tài liệu này hướng dẫn chi tiết từng bước cài đặt **NMH Ops Agent** (Client Agent) lên toàn bộ các nền tảng trong hệ sinh thái quản trị tập trung của **MinhHungOps / Windows Controller Fleet**.

---

## 📑 Mục Lục
1. [Kiến Trúc & Yêu Cầu Kết Nối](#1-kiến-trúc--yêu-cầu-kết-nối)
2. [Cài Đặt Windows Agent (PowerShell & Service)](#2-cài-đặt-windows-agent)
3. [Cài Đặt Linux Agent (Ubuntu / Debian / CentOS / Alpine)](#3-cài-đặt-linux-agent)
4. [Cài Đặt Synology NAS Agent (DSM 7.x)](#4-cài-đặt-synology-nas-agent)
5. [Cài Đặt Home Assistant Add-on](#5-cài-đặt-home-assistant-add-on)
6. [Quy Trình Phê Duyệt & Bảo Mật Máy Trạm Mới](#6-quy-trình-phê-duyệt--bảo-mật-máy-trạm-mới)
7. [Nâng Cấp Agent Từ Xa (OTA Updates)](#7-nâng-cấp-agent-từ-xa-ota-updates)
8. [Hướng Dẫn Gỡ Cài Đặt (Uninstall)](#8-hướng-dẫn-gỡ-cài-đặt)
9. [Xử Lý Sự Cố Thường Gặp (Troubleshooting)](#9-xử-lý-sự-cố-thường-gặp)

---

## 1. Kiến Trúc & Yêu Cầu Kết Nối

- **Central Server URL**: Địa chỉ IP hoặc tên miền của máy chủ MinhHungOps (ví dụ: `http://192.168.1.100:3003` hoặc `https://ops.example.com`).
- **Giao thức liên lạc**: WebSocket bảo mật (`ws://` hoặc `wss://`) kết nối 2 chiều liên tục.
- **Cơ chế xác thực**: Handshake định danh phần cứng (Hardware Fingerprint) + Secret Token Token Pairing + Phê duyệt tường minh từ Super Admin.
- **Tự phục hồi**: Toàn bộ Agent được tích hợp cơ chế Exponential Backoff Reconnect (tự động thử lại khi mất mạng hoặc khởi động lại máy chủ).

---

## 2. Cài Đặt Windows Agent

Windows Agent hỗ trợ đầy đủ các tính năng: Giám sát CPU/RAM, Nhiệt độ phần cứng (CPU/GPU/Mainboard), Công suất tiêu thụ (Watts), Sức khỏe ổ cứng S.M.A.R.T (NVMe/SATA), Watchdog tự sửa lỗi, Desktop Screenshot và Remote PowerShell Console.

### Yêu Cầu Hệ Thống:
- Windows 10, Windows 11, hoặc Windows Server 2016 trở lên (x64 / ARM64).
- Node.js 18+ hoặc 22+ (Bộ cài đặt tự động kiểm tra).
- Quyền Administrator (PowerShell Run as Administrator).

### Cách 1: Cài Đặt Tự Động Qua Lệnh PowerShell 1 Dòng (Khuyến Nghị)

Mở **PowerShell (Run as Administrator)** trên máy trạm Windows và chạy lệnh:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force;
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;
iex ((New-Object System.Net.WebClient).DownloadString('http://<IP_CENTRAL_SERVER>:3003/api/v1/installers/windows?serverUrl=http://<IP_CENTRAL_SERVER>:3003'))
```
*(Thay thế `<IP_CENTRAL_SERVER>:3003` bằng địa chỉ máy chủ Controller của bạn).*

### Cách 2: Cài Đặt Thủ Công Bằng File Kịch Bản Trong Thư Mục Mã Nguồn

1. Tải hoặc clone thư mục `agent/` về máy trạm.
2. Mở PowerShell với quyền **Administrator**, điều hướng vào thư mục `agent`:
   ```powershell
   cd agent
   .\install-agent.ps1 -ServerUrl "http://192.168.1.100:3003"
   ```

### Thành phần được cài đặt trên Windows:
- **Dịch vụ nền**: `WindowsControllerAgent` (tự động chạy ngầm cùng Windows qua WinSW).
- **Thư mục cài đặt**: `C:\ProgramData\WindowsController\agent`
- **Bộ đo phần cứng**: `C:\ProgramData\WindowsController\hardware-monitor` (LibreHardwareMonitor background collector).

---

## 3. Cài Đặt Linux Agent

Linux Agent hỗ trợ theo dõi hiệu năng CPU, RAM, Disk, System Load, thông lượng mạng và điều khiển Terminal Shell từ xa trên Ubuntu, Debian, CentOS, AlmaLinux, Alpine, v.v.

### Yêu Cầu:
- Hệ điều hành Linux hỗ trợ `systemd`.
- Node.js phiên bản 18 trở lên (`node -v` $\ge$ 18).
- Quyền `sudo` / `root`.

### Các Bước Cài Đặt:

1. Đăng nhập SSH vào máy chủ Linux:
   ```bash
   # Cài đặt Node.js nếu chưa có (Ubuntu/Debian ví dụ)
   sudo apt-get update && sudo apt-get install -y nodejs npm curl
   ```

2. Tải và chạy script cài đặt:
   ```bash
   # Nếu có mã nguồn linux-agent:
   cd linux-agent
   sudo ./install-linux.sh --server-url "http://192.168.1.100:3003"
   ```

3. Hoặc tải trực tiếp từ máy chủ Controller:
   ```bash
   curl -fsSL "http://192.168.1.100:3003/api/v1/installers/linux?serverUrl=http://192.168.1.100:3003" | sudo bash
   ```

4. Kiểm tra trạng thái dịch vụ:
   ```bash
   sudo systemctl status windows-controller-agent.service
   ```

---

## 4. Cài Đặt Synology NAS Agent

Synology Agent được tối ưu hóa riêng cho hệ điều hành **DSM 6.x & DSM 7.x** (tự động nhận diện Storage Pools, Volume dung lượng, nhiệt độ ổ cứng và tiến trình NAS).

### Cách 1: Cài Đặt Trực Tiếp Qua Task Scheduler (Khuyến Nghị)

1. Mở giao diện web **Synology DSM** $\rightarrow$ **Control Panel** $\rightarrow$ **Task Scheduler**.
2. Bấm **Create** $\rightarrow$ **Triggered Task** $\rightarrow$ **User-defined script**.
3. Cài đặt các thông số:
   - **Task**: `MinhHungOps Synology Agent`
   - **User**: `root`
   - **Event**: `Boot-up`
4. Tại tab **Task Settings**, dán lệnh script khởi chạy:
   ```bash
   /usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh start
   ```
5. Chạy lệnh cài đặt lần đầu qua SSH:
   ```bash
   cd synology-agent
   sudo ./install-synology.sh --server-url "http://192.168.1.100:3003"
   ```

### Cách 2: Triển Khai Qua Synology Container Manager (Docker)

Tạo file `docker-compose.agent.yml` trong thư mục NAS:
```yaml
version: '3.8'
services:
  synology-agent:
    image: node:24-alpine
    container_name: minhhungops-synology-agent
    restart: unless-stopped
    network_mode: host
    volumes:
      - /volume1/@appdata/minhhungops-agent:/app/state
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
    environment:
      - SERVER_URL=http://192.168.1.100:3003
```

---

## 5. Cài Đặt Home Assistant Add-on

Home Assistant Add-on kết nối toàn bộ dữ liệu cảm biến, trạng thái mạng, các entity nhà thông minh và hỗ trợ chạy script bảo trì vào bảng điều khiển MinhHungOps.

### Các Bước Cài Đặt:

1. **Thêm Thư Mục Add-on**:
   - Copy thư mục `homeassistant-addon/` vào thư mục `/addons/local/minhhungops_agent` trên Home Assistant (hoặc sử dụng giao diện Samba Share / SSH).
2. **Cài Đặt Add-on**:
   - Vào giao diện Home Assistant $\rightarrow$ **Settings** $\rightarrow$ **Add-ons** $\rightarrow$ **Add-on Store**.
   - Bấm menu 3 chấm góc phải $\rightarrow$ **Check for updates** / **Repositories**.
   - Chọn **NMH Ops Controller Connector** trong danh mục Local Add-ons và bấm **Install**.
3. **Cấu Hình `options.json` / Configuration**:
   - Tại tab **Configuration** của Add-on, điền:
     ```yaml
     central_server_url: "http://192.168.1.100:3003"
     home_assistant_url: "http://supervisor/core"
     ```
4. **Khởi Động**:
   - Bật **Start on boot** và **Watchdog**.
   - Bấm **Start** để khởi chạy Add-on.

---

## 6. Quy Trình Phê Duyệt & Bảo Mật Máy Trạm Mới

Để ngăn chặn các thiết bị lạ tự ý gửi dữ liệu vào hệ thống, toàn bộ Agent mới khi kết nối lần đầu đều phải qua bước phê duyệt:

1. Sau khi cài đặt Agent, Agent sẽ gửi gói tin `agent.hello` với mã vân tay phần cứng và trạng thái `pending`.
2. Quản trị viên truy cập web MinhHungOps $\rightarrow$ Vào trang **Admin** $\rightarrow$ Tab **Duyệt máy trạm (Approvals)**.
3. Kiểm tra Tên máy, Địa chỉ IP, Nền tảng và bấm nút **Phê duyệt (Approve)**.
4. Ngay khi được phê duyệt, Central Server sẽ cấp phát Token bảo mật và kích hoạt luồng dữ liệu Telemetry thời gian thực.

---

## 7. Nâng Cấp Agent Từ Xa (OTA Updates)

Khi hệ thống có phiên bản Agent mới, bạn **không cần** phải đăng nhập vào từng máy để cài lại:

1. Vào trang **Fleet** trên giao diện điều khiển.
2. Tại banner **OTA Center**, hệ thống sẽ tự động hiển thị số lượng máy cần nâng cấp.
3. Bấm nút **"Nâng cấp toàn bộ (OTA)"** hoặc bấm biểu tượng nâng cấp trên từng thẻ máy trạm.
4. Central Server sẽ truyền gói mã nguồn mới qua WebSocket, Agent sẽ tự động ghi đè file runtime và khởi động lại dịch vụ trong vòng 3-5 giây mà không làm gián đoạn hệ thống.

---

## 8. Hướng Dẫn Gỡ Cài Đặt (Uninstall)

### Trên Windows:
Mở **PowerShell (Administrator)** trong thư mục `agent`:
```powershell
.\uninstall-agent.ps1
```
*Lệnh này sẽ dừng service, xóa service WinSW, xóa tác vụ Hardware Monitor và dọn dẹp thư mục `C:\ProgramData\WindowsController`.*

### Trên Linux:
```bash
sudo systemctl stop windows-controller-agent.service
sudo systemctl disable windows-controller-agent.service
sudo rm -f /etc/systemd/system/windows-controller-agent.service
sudo rm -rf /var/lib/windows-controller-agent
sudo systemctl daemon-reload
```

### Trên Synology NAS:
```bash
sudo /usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh stop
sudo rm -f /usr/local/etc/rc.d/WindowsControllerSynologyAgent.sh
sudo rm -rf /volume1/@appdata/windows-controller-agent
```

---

## 9. Xử Lý Sự Cố Thường Gặp (Troubleshooting)

| Hiện tượng | Nguyên nhân có thể | Cách khắc phục |
| :--- | :--- | :--- |
| **Agent hiển thị Offline liên tục** | Sai địa chỉ `serverUrl` hoặc Firewall chặn port 3003 | Kiểm tra ping `ping <IP_SERVER>` và kiểm tra mở port 3003 trên máy chủ |
| **Máy trạm đã cài nhưng không thấy trong Fleet** | Đang nằm ở danh sách chờ phê duyệt | Vào menu **Admin** $\rightarrow$ **Duyệt máy trạm** để bấm Approve |
| **Không hiển thị nhiệt độ / công suất trên Windows** | Chưa khởi chạy LibreHardwareMonitor probe | Chạy script `.\install-hardware-monitor.ps1` với quyền Administrator |
| **Linux Agent báo lỗi `Node.js is required`** | Chưa cài Node.js phiên bản $\ge 18$ | Chạy `node -v` để kiểm tra, cài đặt gói `nodejs` mới nhất |
