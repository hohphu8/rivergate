# GyosJS dogfood — Rivergate

Ngày kiểm tra: 2026-11-12. Runtime hiện tại: **npm `gyosjs@0.5.4`, entry `gyosjs/csp`**. Không dùng bản core sửa local. Xem [phạm vi](PLAN.md), [bằng chứng kiểm tra](VALIDATION.md).

## Đã sửa trong 0.5.2: signal trong scope bị mất metadata

**Lỗi đã xác nhận trên 0.5.1 và được sửa trong 0.5.2.** Trên 0.5.1, `g-model` gắn trực tiếp vào callable signal trong một scope được reactive hóa không giữ đồng bộ hai chiều. Sau khi gõ, input thay đổi nhưng signal gốc trong closure vẫn giữ giá trị cũ. Gọi setter của signal sau đó cũng không cập nhật lại input. Rivergate hiện dùng trực tiếp `g-model="importText"`, đã bỏ accessor né lỗi.

Kiểm tra lại với package đang cài (0.5.2 phải đồng bộ cả hai ô; muốn tái hiện lỗi cũ cần checkout bản dùng 0.5.1):

1. Chạy `npm run dev` trong Rivergate.
2. Mở `http://127.0.0.1:4210/docs/repros/signal-model.html`.
3. Gõ `typed` vào ô **Direct signal**; bấm **Reset direct signal**.
4. So sánh với ô **Accessor workaround** ngay phía dưới.

Mã tối thiểu nằm ở [signal-model.html](repros/signal-model.html); [JSON quan sát 0.5.1](repros/observed-0.5.1.json) được giữ làm bằng chứng lịch sử. [Kết quả 0.5.2](repros/observed-0.5.2.json) xác nhận gõ và reset đồng bộ cả signal trực tiếp lẫn accessor, dùng đúng npm package, không alias core hay thay HTML khi chạy. Bảng dưới ghi lại lỗi của 0.5.1, không phải hành vi hiện tại.

| Thao tác | Input trực tiếp | Signal gốc | Input qua accessor | Signal qua accessor |
| --- | --- | --- | --- | --- |
| Gõ `typed` | `typed` | `initial` | `typed` | `typed` |
| Bấm reset | `typed` | `reset` | `reset` | `reset` |

Đối chiếu source private 0.5.1: trong `src/core/reactive.ts`, nhánh `typeof value === 'function'` trả `value.bind(proxy)`. Callable signal vì thế mất các thuộc tính riêng như `value`, `peek`, `__gyos_signal__`. `isSignal()` không còn nhận diện được giá trị này; setter của `g-model` thay thuộc tính scope thay vì cập nhật signal gốc. Các lời gọi `signal()` vẫn chạy, nên lỗi dễ bị che khuất khi chỉ dùng interpolation đọc giá trị.

Rivergate trước đây xử lý bằng accessor của scope trên 0.5.1:

```js
const importText = Gyos.signal('');
return {
  get recordText() { return importText(); },
  set recordText(value) { importText(value); },
};
// <textarea g-model="recordText"></textarea>
```

Luồng gõ JSON lỗi → chọn file hợp lệ → import nằm trong browser tests. Từ 0.5.2, luồng này dùng trực tiếp signal trong app; getter/setter trên chỉ còn là hướng dẫn cho ứng dụng đang giữ 0.5.1.

Fix đã phát hành: giữ nguyên identity/metadata của signal và computed trước nhánh bind method trong reactive proxy; có regression cho `.value`, `.peek`, callable read/write và `g-model` qua scope factory ở cả runtime thường/CSP. Release Candidate 0.5.2 đã pass 322 unit/integration tests và 135 browser tests trước khi publish npm.

## Những phần phù hợp với app reactive

- `signal` + `batch` đủ để xuất một snapshot giao diện nhất quán từ engine độc lập. Không cần đưa thuật toán tìm nước cờ vào effect.
- `*for` + `g-key="piece.id"` giữ cùng DOM element khi quân di chuyển. Browser test so sánh identity trước/sau nước đi; CSS có thể animate vị trí mà không tạo lại quân.
- `onUnmount` đủ để dispose bot, hủy replay timer và abort listener khi scope bị cleanup. Test gửi một kết quả Worker cũ sau cleanup và kiểm tra không có nước mới xuất hiện.
- CSP entry chạy được giao diện và Worker với `script-src 'self'`, không cần `unsafe-eval`. Inline style vẫn cần cho vị trí quân; đây không phải phép thử chính sách cấm toàn bộ inline style.

Các kiểm tra này chứng minh những luồng đã chạy; không phải tuyên bố không có memory leak trong mọi trường hợp, hay benchmark 60 FPS cho mọi thiết bị.

## Kinh nghiệm tích hợp, không quy thành lỗi core

- Worker cần vòng đời riêng: terminate khi undo/reset/đổi mode/xem lịch sử, kiểm tra request ID và position key, rồi kiểm tra lại tính hợp lệ của nước trả về. Promise/computed tự nó không giải quyết kết quả bất đồng bộ đã hết hiệu lực.
- Bọc timer của trình duyệt bằng arrow function khi inject vào class. Gọi native `setTimeout` như method của một object khác gây `Illegal invocation` trong browser, dù Node unit tests không bắt được.
- Giữ trạng thái “đang xem lịch sử” độc lập với chỉ số nước. Đến frame cuối không đồng nghĩa được phép tiếp tục ván hoặc tự chạy bot.
- Formatter HTML phổ thông có thể xuống dòng giữa string literal trong `{expression}`. Rivergate đưa nhãn dài vào hàm nhỏ (`dialogTitle()`, `confirmText()`, `labelButton()`). Đây là lý do nên có hướng dẫn formatter hoặc tooling riêng cho template GyosJS.
- Vite dev port 4190 bị Firefox chặn theo danh sách restricted ports. Đã đổi dev/preview sang 4210/4211.

## Đề xuất cho GyosJS sau Rivergate

1. Đã hoàn tất: sửa signal/scope/model, bổ sung regression và phát hành patch 0.5.2.
2. Thêm recipe **Worker + lifecycle + stale-result guard** vào docs bằng một ví dụ nhỏ. Chưa có bằng chứng cần thêm API Worker chuyên biệt vào core.
3. Bổ sung hướng dẫn formatter cho expression trong HTML. Giữ biểu thức ngắn hoặc dùng `g-text`/hàm trình bày cho chuỗi dài.
4. Tiếp tục app reactive kế tiếp sau khi dùng thử Rivergate thực tế. Bàn cờ xác nhận orchestration và keyed rendering; nó không thay thế bài stress hàng nghìn phần tử hoặc canvas/game loop.
