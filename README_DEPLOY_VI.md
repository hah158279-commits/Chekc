# GETKEY_App2_Admin_Huivip

App 2 GETKEY quản trị hiện tại + quản lý key + tích hợp xu/mã giảm giá

## Chạy thử
1. Cài Node.js 18 trở lên.
2. Sao chép `.env.example` thành `.env`, đổi `ADMIN_PASSWORD`, `APP_PASSWORD`, `SESSION_SECRET`.
3. Chạy `npm start`.
4. Mở `/getkey/`.

## Lưu ý đồng bộ 2 app
Hai ZIP có cùng API và cấu trúc dữ liệu. Để xu, coupon, nhiệm vụ, key và quyền phòng file đồng bộ thật, **chỉ triển khai một máy chủ backend duy nhất** rồi cho cả hai app dùng chung URL/host đó (các đường dẫn `/customer/` và `/getkey/` cùng trên host). Nếu triển khai hai máy chủ độc lập, `data.json` tách biệt và dữ liệu không tự đồng bộ.

## Cấu hình tích hợp
- Facebook LIVE check cần `FACEBOOK_PAGE_ACCESS_TOKEN` có quyền phù hợp với Page.
- TikTok checker cần `TIKTOK_LIVE_CHECK_URL` của nhà cung cấp hợp lệ.
- Cổng thanh toán chưa được kết nối; giá 300.000₫/file và giá key là giá quản trị ghi nhận, không chứng minh giao dịch đã thanh toán. Coupon hiện được kiểm tra/đánh dấu dùng một lần theo phiên đăng nhập; cần tài khoản người dùng thật và payment gateway nếu mở bán công khai.
- Nhiệm vụ được cộng xu sau khi admin xem bằng chứng và duyệt thủ công; không tự động đăng bài hay tạo tương tác giả.
- Phòng file admin upload giới hạn 20 MB, cần đổi mật khẩu mặc định trước khi đưa lên mạng.
- Phòng công cụ chỉ là khu phân phối file; gói này không tích hợp tự động spam tin nhắn hoặc báo cáo hàng loạt.
