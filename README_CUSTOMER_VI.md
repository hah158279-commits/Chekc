# GETKEY 후이vip👑 — Customer app + private developer upload door

## Đường dẫn
- Khách hàng: `/customer/`
- Quản trị key hiện có: `/getkey/`
- Cửa sau upload file dành cho admin: `/admin-door/` (đăng nhập bằng `ADMIN_PASSWORD` của server)

## Cách deploy theo cấu trúc ZIP hiện tại
1. Thay ZIP cũ trong repo GitHub bằng ZIP này, không để nhiều ZIP source cùng lúc.
2. Giữ Build Command: `for f in *.zip; do unzip -o "$f"; done && cd hui_meta_getkey_rebuild && npm install`
3. Giữ Start Command: `cd hui_meta_getkey_rebuild && npm start`
4. Render → Manual Deploy → Deploy latest commit.
5. Mở `/customer/`, `/getkey/`, `/admin-door/`.

## Cửa sau
- Chỉ có API admin authenticated mới upload được.
- Có 3 phòng cố định: Hook Mic, File FB, File Messenger.
- Mỗi phòng cho phép đặt tên hiển thị, version và upload file mới tối đa 20 MB.
- File upload được lưu trong `private-files/uploads/`, không nằm trong public directory.
- Khách cần key `kind=file` đúng `fileId` để tải; lần tải đầu tiên sẽ kích hoạt key theo phiên khách. Key không thể dùng từ phiên khác.
- Mật khẩu admin là `ADMIN_PASSWORD` trong Render Environment. Đặt giá trị dài/ngẫu nhiên, không dùng mặc định.

## Quan trọng
- Render filesystem có thể bị mất khi deploy/restart nếu không có Persistent Disk; để bán file thật, gắn Persistent Disk vào thư mục dữ liệu/file hoặc chuyển file metadata sang database và lưu file ở object storage.
- Mật khẩu/phiên web không đảm bảo ràng buộc phần cứng tuyệt đối; browser cookie/session chỉ là ràng buộc phiên.
- Facebook/TikTok checker cần API hợp lệ. Không có API thì app phải hiển thị CHƯA CẤU HÌNH, không được giả trạng thái LIVE/DIE.
- Không tích hợp spam tin nhắn hoặc mass-report; chỉ phân phối file bạn có quyền chia sẻ và dùng theo quy định nền tảng.
