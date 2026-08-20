# Sổ Tay Hướng Dẫn Sử Dụng Hệ Thống MinhHungOps (Windows Controller Fleet)

Hệ thống **MinhHungOps (Windows Controller Fleet)** là nền tảng quản trị, giám sát và vận hành cụm máy trạm đa nền tảng (Windows, Linux, Synology NAS, Home Assistant, MikroTik Gateway, Docker) theo thời gian thực với chuẩn an toàn, trực quan và tối ưu cho môi trường mạng nội bộ (LAN) cũng như quản trị từ xa.

---

## 📑 Mục Lục
1. [Giao Diện Tổng Quan & Khung Điều Hướng](#1-giao-diện-tổng-quan--khung-điều-hướng)
2. [Quản Lý Cụm Máy Trạm (Fleet View) & Điểm Sức Khỏe](#2-quản-lý-cụm-máy-trạm-fleet-view)
3. [Bảng Điều Khiển Chi Tiết Máy Trạm (Dashboard View)](#3-bảng-điều-khiển-chi-tiết-máy-trạm-dashboard-view)
4. [Theo Dõi Sức Khỏe Ổ Cứng Vật Lý S.M.A.R.T](#4-theo-dõi-sức-khỏe-ổ-cứng-smart)
5. [Quản Lý Tiến Trình & Cây Tiến Trình (Processes View)](#5-quản-lý-tiến-trình-processes-view)
6. [Console Dòng Lệnh Từ Xa (Remote Web Terminal)](#6-console-dòng-lệnh-từ-xa-remote-web-terminal)
7. [Cơ Chế Tự Chữa Lành Biên (Watchdog Engine)](#7-cơ-chế-tự-chữa-lành-biên-watchdog-engine)
8. [Quản Trị Docker Containers](#8-quản-trị-docker-containers)
9. [Trung Tâm Kịch Bản Tự Động (Script Hub)](#9-trung-tâm-kịch-bản-tự-động-script-hub)
10. [Giám Sát Mạng & Hạ Tầng Router (Network Monitor)](#10-giám-sát-mạng--hạ-tầng-router-network-monitor)
11. [Quản Trị Người Dùng & Phân Quyền (RBAC)](#11-quản-trị-người-dùng--phân-quyền-rbac)

---

## 1. Giao Diện Tổng Quan & Khung Điều Hướng

```
+-----------------------------------------------------------------------------------------+
| [NMH Ops Logo]  [Chọn Máy Trạm v]  [Tìm Kiếm Ctrl+K]   [🇻🇳 Tiếng Việt] [🌓 Theme] [Admin] |
+-----------------------------------------------------------------------------------------+
| [📱 Menu Sidebar]  |                                                                     |
| -----------------  |  🚀 BẢNG ĐIỀU KHIỂN CHÍNH / KHU VỰC VẬN HÀNH TRỰC QUAN              |
| 🖥️ Cụm máy (Fleet)  |                                                                     |
| 📊 Giám sát (Dash) |  - Bento Grid số liệu thời gian thực (CPU %, RAM %, Watts, °C)      |
| ⚙️ Tiến trình (Proc)|  - Biểu đồ spline tài nguyên linh hoạt theo mốc thời gian            |
| 🐕 Watchdog Engine |  - Sức khỏe ổ cứng NVMe / SATA & Trạng thái phân vùng ổ đĩa         |
| 🐳 Docker          |                                                                     |
| 📜 Script Hub      |                                                                     |
| 🌐 Mạng (Network)  |                                                                     |
| 🛡️ Quản trị (Admin)|                                                                     |
+--------------------+--------------------------------------------------------------------+
```

### Các Tiện Ích Trên Thanh Điều Hướng:
- **Bộ Chọn Máy Trạm Nhanh**: Chọn ngay máy trạm cần xem với đèn báo Online/Offline.
- **Command Palette (`Ctrl + K`)**: Tìm kiếm nhanh máy trạm, container hoặc tính năng mà không cần dùng chuột.
- **Chuyển Đổi Dark/Light Mode**: Chế độ tối Slate-Obsidian độ tương phản cao hoặc chế độ sáng dịu mắt.
- **Chuyển Đổi Ngôn Ngữ**: Đồng bộ tức thì giữa 🇻🇳 Tiếng Việt và 🇺🇸 English.

---

## 2. Quản Lý Cụm Máy Trạm (Fleet View)

Trang **Fleet View** cung cấp góc nhìn toàn cảnh về toàn bộ các thiết bị đang kết nối vào hệ thống.

```
+-----------------------------------------------------------------------------------------+
|  [ OTA CENTER: Agent v2.1.5 mới nhất | 4 máy đã cập nhật | [Nâng cấp toàn bộ (OTA)] ]    |
+-----------------------------------------------------------------------------------------+
|  [ĐIỂM SỨC KHỎE: 98/100 (Hoàn Hảo)]   [Tổng Máy Trạm: 5]   [Sức Khỏe: 100%]  [Chú Ý: 0] |
+-----------------------------------------------------------------------------------------+
|  THẺ MÁY TRẠM:                                                                          |
|  +--------------------------------+  +--------------------------------+                 |
|  | 🟢 DESKTOP-MAIN (192.168.1.15) |  | 🟢 SYNOLOGY-NAS (192.168.1.20) |                 |
|  | Windows 11 Pro • Agent v2.1.5  |  | DSM 7.2 • Synology Agent       |                 |
|  | CPU: [====------] 32% (52°C)   |  | CPU: [==----------] 12%        |                 |
|  | RAM: [========--] 68% (21.4GB) |  | RAM: [====--------] 38% (6.2GB)|                 |
|  | ⚡ 85W Công suất tiêu thụ       |  | 💾 Storage: 4.2TB / 12TB       |                 |
|  | [Xem Chi Tiết ->]              |  | [Xem Chi Tiết ->]              |                 |
|  +--------------------------------+  +--------------------------------+                 |
+-----------------------------------------------------------------------------------------+
```

### Tính Năng Nổi Bật:
1. **Điểm Sức Khỏe Hạ Tầng (Health Score Widget)**:
   - Tự động đánh giá điểm số 0-100 dựa trên tỷ lệ máy online, độ trễ ping mạng và trạng thái Gateway.
   - **Nút Bỏ Qua (Ignore)**: Cho phép ẩn/bỏ qua các cảnh báo không cần thiết để tập trung vào vấn đề quan trọng.
2. **Bộ Lọc Nhanh (Status Filters)**:
   - Lọc nhanh các máy: *Tất cả (All)*, *Trực tuyến (Online)*, *Ngoại tuyến (Offline)*, hoặc *Cần chú ý (Attention)*.
3. **Trung Tâm Nâng Cấp Tự Động (OTA Center)**:
   - Xem phiên bản Agent mới nhất và bấm **"Nâng cấp toàn bộ (OTA)"** để hệ thống tự động cập nhật qua mạng mà không cần truy cập từng máy.

---

## 3. Bảng Điều Khiển Chi Tiết Máy Trạm (Dashboard View)

Khi chọn một máy trạm cụ thể, trang **Dashboard** sẽ hiển thị dữ liệu vi mô thời gian thực:

- **Hero Identity Card**: Tên hiển thị máy trạm, IP LAN, hệ điều hành, phiên bản Agent, Fingerprint phần cứng.
- **6 Thẻ Đo Lường Trọng Tâm (Bento Grid)**:
  - 🖥️ **Tải CPU**: Tỷ lệ % sử dụng, tên model chip CPU (ví dụ: Intel Core i9, AMD Ryzen, Dual Xeon).
  - 🧠 **Bộ Nhớ RAM**: Dung lượng đã dùng / tổng dung lượng (GB) kèm % trực quan.
  - ⏱️ **Thời Gian Chạy (Uptime)**: Số ngày, giờ máy đã hoạt động liên tục.
  - 🌐 **Thông Lượng Mạng**: Tốc độ tải lên ($\uparrow$ MB/s) và tải xuống ($\downarrow$ MB/s) thời gian thực.
  - 🌡️ **Nhiệt Độ Cảm Biến**: Nhiệt độ nóng nhất của CPU Package hoặc linh kiện.
  - ⚡ **Công Suất Tiêu Thụ**: Công suất nguồn điện thời gian thực (Watts) đo từ bo mạch chủ và GPU.
- **Bộ Lọc Biểu Đồ Đa Mốc Thời Gian**: Chọn hiển thị lịch sử tải trong **60 phút**, **8 tiếng**, **1 ngày**, **1 tuần**, hoặc **1 tháng**.

---

## 4. Theo Dõi Sức Khỏe Ổ Cứng S.M.A.R.T

Hệ thống tự động đọc chip điều khiển phần cứng của tất cả ổ cứng vật lý (NVMe SSD, SATA SSD, HDD):

- **Loại ổ đĩa & Chuẩn kết nối**: Hiển thị chính xác NVMe, SATA, SAS hoặc USB.
- **Tình trạng sức khỏe (% Health)**: Dựa trên số sector lỗi, khối lượng đọc/ghi và thuật toán S.M.A.R.T.
- **Thời gian đã chạy (Power-On Hours)**: Tổng số giờ ổ cứng đã hoạt động từ lúc xuất xưởng.
- **Tỷ lệ hao mòn (Wear Percent)**: Tỷ lệ % hao mòn chip nhớ NAND Flash của ổ SSD.
- **Nhiệt độ ổ cứng**: Cảnh báo khi ổ cứng vượt quá 60°C.

---

## 5. Quản Lý Tiến Trình (Processes View)

Cho phép kiểm soát toàn bộ ứng dụng và dịch vụ đang chạy trên máy trạm Windows / Linux:

- **Tìm kiếm tức thì**: Lọc theo tên tiến trình (`chrome.exe`, `node.exe`, `game.exe`, v.v.) hoặc PID.
- **Sắp xếp linh hoạt**: Xếp theo mức chiếm dụng RAM, CPU hoặc ID tiến trình.
- **Diệt Tiến Trình An Toàn (Kill Process / Process Tree)**:
  - Bấm biểu tượng thùng rác để kết thúc tiến trình bị treo hoặc chiếm dụng tài nguyên.
  - Hỗ trợ tùy chọn **"Diệt toàn bộ cây tiến trình con (Process Tree Kill)"** để dọn sạch hoàn toàn các tiến trình ẩn phụ thuộc.

---

## 6. Console Dòng Lệnh Từ Xa (Remote Web Terminal)

Không cần mở phần mềm Remote Desktop (RDP) hay TeamViewer, bạn có thể thực thi lệnh trực tiếp trên trình duyệt:

- Mở hộp thoại **Remote Terminal** trong trang Tiến trình hoặc Dashboard.
- Nhập lệnh PowerShell (trên Windows) hoặc Bash Shell (trên Linux / Synology / Home Assistant).
- Xem kết quả trả về (`stdout` / `stderr`) sắc nét với phông chữ lập trình `JetBrains Mono`.
- Tích hợp sẵn các mẫu lệnh nhanh: Kiểm tra mạng, dọn dẹp ổ đĩa, kiểm tra IP, xem danh sách service.

---

## 7. Cơ Chế Tự Chữa Lành Biên (Watchdog Engine)

Watchdog là "người lính gác" thông minh chạy cục bộ trên máy trạm, tự động phát hiện và xử lý sự cố ngay cả khi mất kết nối mạng với máy chủ:

- **Quy Tắc Giám Sát (Rules)**:
  - *Tự khởi động lại phần mềm*: Nếu một tiến trình quan trọng bị tắt hoặc crash, tự bật lại sau $X$ giây.
  - *Bảo vệ quá tải CPU/RAM*: Nếu RAM vượt quá 95% liên tục trong 3 phút, tự động khởi động lại dịch vụ hoặc giải phóng bộ nhớ.
  - *Tự khởi động lại máy định kỳ*: Lên lịch tự động reboot máy trạm vào ban đêm để duy trì hiệu năng mượt mà.

---

## 8. Quản Trị Docker Containers

Tích hợp giao diện quản lý Docker trực quan cho máy chủ Controller, Synology hoặc máy trạm chạy Docker Engine:

- **Xem danh sách Container**: Hiển thị tên, Image, trạng thái (Running / Stopped / Restarting), Port mapping và thời gian chạy.
- **Thao tác nhanh**: Khởi động (Start), Tạm dừng (Stop), Khởi động lại (Restart), hoặc Xóa container.
- **Xem nhật ký thời gian thực (Live Logs Streaming)**: Theo dõi log đầu ra của ứng dụng container mà không cần SSH.
- **Terminal Shell Exec**: Mở shell trực tiếp vào bên trong container để thao tác kỹ thuật.

---

## 9. Trung Tâm Kịch Bản Tự Động (Script Hub)

Script Hub là thư viện kịch bản vận hành tự động giúp bạn thực thi tác vụ trên 1 hoặc nhiều máy trạm cùng lúc:

- **Thư Viện Kịch Bản Mẫu Sẵn Có (Preset Templates)**:
  - 🧹 *Dọn dẹp file tạm & Windows Update Cache*
  - 🔄 *Xóa Cache DNS & Khôi phục card mạng*
  - 🖨️ *Khởi động lại dịch vụ Print Spooler kẹt lệnh in*
  - 💾 *Kiểm tra S.M.A.R.T toàn bộ ổ đĩa*
  - 🔍 *Truy tìm Top 10 ứng dụng ăn CPU / RAM nhiều nhất*
- **Tạo Kịch Bản Tùy Biến**: Tạo và lưu trữ các đoạn script PowerShell, Shell script hoặc Python theo ý muốn.
- **Thực thi trên Home Assistant**: Có thể gửi lệnh trực tiếp đến Home Assistant Add-on để gọi dịch vụ hoặc kiểm tra thiết bị.

---

## 10. Giám Sát Mạng & Danh Sách Router / Gateway Được Hỗ Trợ (Network Monitor)

Hệ thống tích hợp sẵn các driver kết nối chuyên dụng cho đa dạng các dòng Router, Gateway và Hệ thống Wi-Fi Mesh phổ biến:

1. 🛡️ **MikroTik RouterOS (v6 & v7)**: Kết nối trực tiếp qua Binary API (Cổng 8728 / 8729) hoặc REST API. Giám sát thông lượng WAN PPPoE thực tế, đo tải CPU/RAM, đọc cảm biến nhiệt độ và điện áp, quản lý danh sách DHCP Leases, Active PPPoE Sessions và hỗ trợ khởi động lại từ xa.
2. 🌐 **OpenWrt / ImmortalWrt**: Kết nối qua LuCI ubus / JSON-RPC API. Giám sát WAN IP, System load, thông lượng các giao diện mạng, danh sách thiết bị kết nối và cấu hình Wi-Fi.
3. 📡 **ZTE EasyMesh & GPON ONT** (*ZTE H196A, ZXHN F670L, H3601, F6600, F680...*): Tự động vẽ sơ đồ cây mạng Mesh, trạng thái các node phụ, đo cường độ tín hiệu sóng và thống kê client.
4. 📶 **TP-Link Deco Wi-Fi 6/7 Mesh** (*Deco X20, X50, X60, XE75, M4, M5, W3600...*): Tự động phát hiện topology các node Deco, kiểm tra trạng thái kết nối Internet và các thiết bị đang phát sóng.
5. 📲 **Xiaomi MiWiFi & Mesh Router** (*Xiaomi AX3000, AX6000, AX9000, BE3600, Redmi AX6S, AX5, CR6608...*): Giám sát các node Mesh chính/phụ, đo tốc độ truyền dẫn và danh sách thiết bị LAN/Wi-Fi.
6. 🏢 **Gecoos Enterprise AP & AC Controller**: Hỗ trợ đồng bộ trạng thái các Access Point doanh nghiệp và bộ điều khiển tập trung Cloud AC.
7. 🔌 **Generic Router, Firewall & Switch**: Hỗ trợ giám sát mọi dòng thiết bị mạng khác (*pfSense, OPNsense, Cisco, DrayTek Vigor, Ubiquiti UniFi, ASUSWRT, Ruijie Reyee, Huawei ONT...*) thông qua giao thức ICMP Ping và kiểm tra cổng dịch vụ TCP.



---

## 11. Quản Trị Người Dùng & Phân Quyền (RBAC)

Hệ thống bảo vệ đa tầng với 3 cấp độ phân quyền người dùng:

| Vai trò (Role) | Quyền Hạn Chi Tiết |
| :--- | :--- |
| **Super Admin** | Toàn quyền cấu hình hệ thống, duyệt/xóa máy trạm, tạo tài khoản, nâng cấp OTA và quản trị Docker. |
| **Host Admin** | Được phân công quản lý một nhóm máy trạm cụ thể; có quyền diệt tiến trình, chạy script, điều khiển terminal trên các máy được giao. |
| **Viewer** | Chỉ có quyền xem telemetry, biểu đồ và trạng thái máy trạm; không thể can thiệp thao tác nhạy cảm. |

---

*Tài liệu được phát triển và duy trì bởi đội ngũ MinhHungOps.*
