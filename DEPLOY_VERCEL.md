# 🚀 Hướng Dẫn Triển Khai NMH Ops Controller Trên Vercel

Tài liệu này hướng dẫn chi tiết cách triển khai giao diện Frontend (**React + Vite SPA**) của **NMH Ops Controller** lên nền tảng **Vercel** hoàn toàn miễn phí, có HTTPS và CDN toàn cầu.

---

## 🏗️ Kiến Trúc Khi Triển Khai Vercel
- **Frontend UI (Vercel)**: Giao diện web React Single Page App, quản trị viên có thể truy cập từ bất kỳ đâu (máy tính, điện thoại Android/iOS qua PWA).
- **Backend Central Server (Self-Hosted / VPS / Home Server / Docker)**: Máy chủ Node.js Express + WebSocket quản lý cơ sở dữ liệu SQLite, Agent, Docker Socket và Network Monitor.

---

## 📋 Cách 1: Triển Khai Nhanh Qua Giao Diện Web Vercel (Khuyên Dùng)

### Bước 1: Đẩy mã nguồn lên GitHub / GitLab
Nếu bạn chưa đẩy repo lên GitHub:
```bash
git add .
git commit -m "feat: Add Vercel deployment support and vercel.json"
git push origin main
```

### Bước 2: Import Dự Án Vào Vercel
1. Đăng nhập vào [Vercel Dashboard](https://vercel.com/dashboard).
2. Bấm **Add New...** $\rightarrow$ **Project**.
3. Chọn Git repository `MinhHungOps` (hoặc `windows-controller-webapp`).

### Bước 3: Cấu Hình Project Settings Trên Vercel
- **Framework Preset**: `Vite` (Vercel sẽ tự động nhận diện từ file [`vercel.json`](./vercel.json))
- **Root Directory**: `./` (Để nguyên thư mục gốc)
- **Build Command**: `npm run build:frontend`
- **Output Directory**: `frontend/dist`
- **Install Command**: `npm install`

### Bước 4: Cấu Hình Biến Môi Trường (Environment Variables)
Nếu bạn muốn Frontend trên Vercel tự động kết nối tới Backend Server ở nhà/VPS:
1. Trong mục **Environment Variables**, thêm biến:
   - **Name**: `VITE_API_URL`
   - **Value**: `https://your-server-domain.com` *(hoặc `http://your-home-ip:3003`)*
2. Bấm **Deploy**.

Sau 1-2 phút, bạn sẽ nhận được một domain miễn phí như: `https://minhhungops.vercel.app`.

---

## 💻 Cách 2: Triển Khai Qua Vercel CLI

1. Cài đặt Vercel CLI (nếu chưa có):
   ```bash
   npm i -g vercel
   ```
2. Đăng nhập vào tài khoản Vercel:
   ```bash
   vercel login
   ```
3. Chạy lệnh deploy:
   ```bash
   vercel
   ```
4. Khi sẵn sàng deploy lên môi trường Production:
   ```bash
   vercel --prod
   ```

---

## ⚙️ Cấu Hình File `vercel.json` Có Sẵn Trong Dự Án

File [`vercel.json`](./vercel.json) ở thư mục gốc đã được thiết lập sẵn:
```json
{
  "buildCommand": "npm run build:frontend",
  "outputDirectory": "frontend/dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 🔒 Lưu Ý Về Kết Nối Mạng & CORS Khi Chạy Vercel
1. **HTTPS / Mixed Content**:
   - Vercel luôn chạy HTTPS (`https://...`).
   - Nếu bạn gọi API về server ở nhà qua `http://...`, trình duyệt có thể chặn do cơ chế **Mixed Content**.
   - **Giải pháp**: Sử dụng Cloudflare Tunnel, Nginx Reverse Proxy với SSL (Let's Encrypt), hoặc DuckDNS + Certbot để máy chủ backend của bạn có domain HTTPS (ví dụ `https://ops.yourdomain.com`).
2. **WebSocket (WSS)**:
   - Giao diện trên Vercel tự động chuyển đổi `https://` thành `wss://` để duy trì luồng telemetry và live logs real-time với Central Server.
