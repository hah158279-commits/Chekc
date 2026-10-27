# GETKEY Checker — 후이vip👑

## Chạy thử
1. Cài Node.js 18 trở lên.
2. Sao chép `.env.example` thành `.env`. Đặt `ADMIN_PASSWORD`, `APP_PASSWORD`, `SESSION_SECRET` thành giá trị riêng, dài và khó đoán.
3. Chạy `npm start`.
4. Mở `/getkey/`. Cửa admin: `/admin-door/`.

## Quan trọng: để hai app dùng chung dữ liệu
Hai gói chứa cùng backend và cùng API. **Không triển khai thành hai dịch vụ độc lập nếu muốn xu, key, nhiệm vụ và mã giảm giá đồng bộ.** Chọn một dịch vụ backend duy nhất để lưu `data.json` và file upload; dùng cả hai giao diện `/getkey/` và `/customer/` trên cùng host. Đặt `APP_HOME` để chọn trang mặc định. Nếu nền tảng hosting xóa filesystem khi redeploy, hãy gắn persistent disk; `data.json` hiện là JSON local, chưa phải database managed.

## Cấu hình cần thiết để dùng thực tế
- Facebook: `FACEBOOK_PAGE_ACCESS_TOKEN` có quyền phù hợp; checker chỉ xác minh những Page/API cho phép.
- TikTok: cấu hình endpoint provider hợp lệ trong `TIKTOK_LIVE_CHECK_URL` và API key nếu cần. Không có các cấu hình này, checker sẽ báo chưa cấu hình/không xác định, không bịa LIVE/DIE.
- Upload phòng file giới hạn 20 MB. Admin: `/admin-door/`.
- Nhiệm vụ cộng xu sau khi admin duyệt bằng chứng.
- Mã giảm giá hiện được kiểm tra và đánh dấu đã dùng theo phiên; chưa có cổng thanh toán tự động hoặc tài khoản người dùng riêng. Chỉ mở bán công khai sau khi tích hợp database bền vững, xác thực tài khoản và cổng thanh toán.
- Giá file mặc định 300.000₫/file. Không tích hợp chức năng spam tin nhắn hoặc báo cáo hàng loạt.
