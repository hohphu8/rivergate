# GyosJS dogfood — Rivergate

Ngày kiểm tra: 2026-11-12. Runtime: **npm `gyosjs@0.5.1`, entry `gyosjs/csp`**. Không dùng bản core sửa local. Xem [phạm vi](PLAN.md), [bằng chứng kiểm tra](VALIDATION.md).

## Vấn đề tái hiện được: signal trong scope bị mất metadata

**Ưu tiên cho đợt sửa GyosJS tiếp theo.** `g-model` gắn trực tiếp vào callable signal trong một scope được reactive hóa không giữ đồng bộ hai chiều. Sau khi gõ, input thay đổi nhưng signal gốc trong closure vẫn giữ giá trị cũ. Gọi setter của signal sau đó cũng không cập nhật lại input.

Tái hiện với đúng package đã phát hành:

1. Chạy `npm run dev` trong Rivergate.
2. Mở `http://127.0.0.1:4210/docs/repros/signal-model.html`.
3. Gõ `typed` vào ô **Direct signal**; bấm **Reset direct signal**.
4. So sánh với ô **Accessor workaround** ngay phía dưới.

Mã tối thiểu nằm ở [signal-model.html](repros/signal-model.html); [JSON quan sát](repros/observed-0.5.1.json) được ghi từ lần chạy Chrome thật, không phải kết quả giả định.

| Thao tác | Input trực tiếp | Signal gốc | Input qua accessor | Signal qua accessor |
| --- | --- | --- | --- | --- |
| Gõ `typed` | `typed` | `initial` | `typed` | `typed` |
| Bấm reset | `typed` | `reset` | `reset` | `reset` |

Đối chiếu source private 0.5.1: trong `src/core/reactive.ts`, nhánh `typeof value === 'function'` trả `value.bind(proxy)`. Callable signal vì thế mất các thuộc tính riêng như `value`, `peek`, `__gyos_signal__`. `isSignal()` không còn nhận diện được giá trị này; setter của `g-model` thay thuộc tính scope thay vì cập nhật signal gốc. Các lời gọi `signal()` vẫn chạy, nên lỗi dễ bị che khuất khi chỉ dùng interpolation đọc giá trị.

Rivergate xử lý bằng accessor của scope:

```js
const importText = Gyos.signal('');
return {
  get recordText() { return importText(); },
  set recordText(value) { importText(value); },
};
// <textarea g-model="recordText"></textarea>
```

Luồng gõ JSON lỗi → chọn file hợp lệ → import đã được đưa vào browser tests. Đây là workaround của ứng dụng, **chưa phải fix trong GyosJS**. Không đổi private/public core hay bump version trong goal này.

Hướng sửa đề xuất: giữ nguyên identity/metadata của signal và computed trước nhánh bind method trong reactive proxy; thêm regression cho `.value`, `.peek`, callable read/write và `g-model` qua scope factory ở cả runtime thường/CSP. Cần kiểm tra cả getter/setter, scope lồng nhau và method dùng `this` trước khi đồng bộ private → public.

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

1. Sửa vấn đề signal/scope/model ở trên, bổ sung regression rồi mới cân nhắc patch release.
2. Thêm recipe **Worker + lifecycle + stale-result guard** vào docs bằng một ví dụ nhỏ. Chưa có bằng chứng cần thêm API Worker chuyên biệt vào core.
3. Bổ sung hướng dẫn formatter cho expression trong HTML. Giữ biểu thức ngắn hoặc dùng `g-text`/hàm trình bày cho chuỗi dài.
4. Tiếp tục app reactive kế tiếp sau khi dùng thử Rivergate thực tế. Bàn cờ xác nhận orchestration và keyed rendering; nó không thay thế bài stress hàng nghìn phần tử hoặc canvas/game loop.
