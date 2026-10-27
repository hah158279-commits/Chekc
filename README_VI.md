# 후이 meta + GetKey — bản tích hợp checker cấu hình được

Hai PWA riêng trong cùng project:
- `public/meta/` — app người dùng, giao diện tím/đen; checker Facebook/TikTok hàng loạt, theo dõi LIVE mỗi 60 giây khi trang mở, lịch sử check, thông tin key, kích hoạt key.
- `public/getkey/` — admin console giao diện xanh ngọc; tạo key, quản lý khách/key, tìm kiếm, thu hồi/mở lại, xuất CSV.
- `private-files/` — ba file khách mua bằng key file riêng mới tải được qua API.

## Chạy thử
Yêu cầu Node.js 18+.

```sh
cp .env.example .env
# Điền mật khẩu mạnh và các cấu hình API ở bên dưới
npm start
```

Mở `http://localhost:8080/meta/` và `http://localhost:8080/getkey/`. Muốn khách dùng qua Internet/iPhone cần triển khai máy chủ HTTPS thật, cấu hình reverse proxy/TLS, backup dữ liệu và giới hạn đăng nhập trước khi bán công khai.

## Checker Facebook
- Dùng Facebook **Page ID hoặc link Page**, không đảm bảo check được tài khoản cá nhân tùy ý.
- Cần `FACEBOOK_PAGE_ACCESS_TOKEN` có quyền đọc live videos của Page; tùy ứng dụng/quyền đã được Meta cấp. Có thể đặt `FACEBOOK_GRAPH_VERSION`.
- Khi Graph API trả phiên `LIVE_NOW`, kết quả là `LIVE`; khi truy vấn thành công nhưng không có phiên đang live, kết quả là `DIE`. Lỗi quyền, token hoặc mạng sẽ là `KHÔNG XÁC ĐỊNH`, không đoán là DIE.

## Checker TikTok
TikTok không có endpoint LIVE tổng quát công khai được mô tả trong bộ API developer thông thường. Bản này dùng adapter đến endpoint do chủ hệ thống cấu hình; **chưa có endpoint/key thì không thể xác minh trạng thái thật**.
- `TIKTOK_LIVE_CHECK_URL`: URL endpoint POST của nhà cung cấp checker mà bạn tin cậy.
- Body gửi đi: `{"username":"ten_tiktok"}`.
- Header mặc định `Authorization: Bearer <TIKTOK_LIVE_API_KEY>`; có thể đổi tên header bằng `TIKTOK_LIVE_API_KEY_HEADER`.
- Phản hồi hỗ trợ: `{"is_live":true}` / `{"is_live":false}` hoặc `{"status":"LIVE"}` / `{"status":"OFFLINE"}`. Nếu định dạng khác, code trả `KHÔNG XÁC ĐỊNH`.
- Chỉ cấu hình endpoint đáng tin cậy; server sẽ gửi username tài khoản người dùng nhập tới endpoint đó.

## Tính năng bổ sung đã tích hợp
- Check Facebook và TikTok hàng loạt: dán mỗi ID/username trên một dòng.
- Theo dõi LIVE: chạy lại mỗi 60 giây khi trang đang mở; mỗi lần kiểm tra tiếp tục áp dụng hạn mức/key, nên cần key phù hợp để theo dõi liên tục. iPhone có thể dừng khi app xuống nền.
- Lịch sử check: lưu 100 đợt kiểm tra gần nhất theo phiên đăng nhập.
- Thông tin key: xem key checker đang hoạt động trong phiên hiện tại và hạn dùng.
- Quản lý khách: GetKey có thống kê số key/khách nhãn, tìm kiếm, thu hồi/mở lại và xuất CSV.

## Key và hạn mức
- Mỗi công cụ có 5 dòng miễn phí/ngày; key thuê đúng công cụ đã kích hoạt trên thiết bị bỏ qua hạn mức của công cụ đó.
- Key check: 1 ngày 20.000đ; 7 ngày 70.000đ; 30 ngày 150.000đ; 365 ngày 400.000đ. Thời hạn bắt đầu khi kích hoạt.
- Key file: 300.000đ cho mỗi file cụ thể. File key chỉ tải đúng file đã mua; ba file hiện có: `Hook mic.md`, `Tool dame fb.js`, `Tool spam mes.js`.
- Key gắn với mã thiết bị được lưu trong trình duyệt và phiên đăng nhập; admin có thể thu hồi key.
- Admin tạo key ở `/getkey/`. Không có cổng thanh toán tự động; admin xác nhận thanh toán rồi tạo/gửi key.

## Trước khi triển khai công khai
- Đặt `ADMIN_PASSWORD`, `APP_PASSWORD`, `SESSION_SECRET` mạnh trong `.env`; không dùng mật khẩu mẫu.
- Chạy qua HTTPS, bật rate limit đăng nhập, backup `data.json`, theo dõi lỗi và kiểm tra bảo mật độc lập.
- `data.json` chứa key/phiên sử dụng, không xóa khi đang vận hành; chỉ xóa dữ liệu thử nghiệm trước khi triển khai.
- Đây là bản prototype tích hợp, chưa phải dịch vụ production đã kiểm thử bảo mật độc lập.
