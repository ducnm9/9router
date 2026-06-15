# API Key Quota Management

## Overview

Hệ thống quản lý dung lượng sử dụng LLM theo từng API key. Mỗi key có quota riêng (token + cost), counter theo tháng, tự động reset ngày 1, warning khi gần chạm limit, block khi vượt.

## Decisions

- **Giới hạn kép:** tổng token (input+output) VÀ cost (USD). Cái nào chạm trước thì trigger.
- **Chu kỳ reset:** ngày 1 hàng tháng, cố định cho tất cả key.
- **Warning + hard block:** warning header khi >= threshold (mặc định 80%), block 429 khi >= 100%.
- **Per-key quota:** mỗi key set quota riêng, không dùng plan system.
- **Request đang stream:** cho hoàn thành, ghi nhận vượt, block request tiếp theo.
- **Dedicated counter file:** tách riêng `quota.json` khỏi usage tracking hiện tại.

## Data Model

### Quota config (mở rộng `apiKeys[]` trong `db.json`)

```javascript
{
  id: "key_abc123",
  name: "Production App",
  key: "sk-...",
  machineId: "...",
  isActive: true,
  createdAt: "2025-01-15T...",
  quota: {
    maxTokens: 1000000,       // tổng token (input+output) / tháng, null = unlimited
    maxCost: 5.00,            // USD / tháng, null = unlimited
    warningThreshold: 0.8     // tỷ lệ % để gửi warning header (0.8 = 80%)
  }
}
```

Key không có field `quota` hoặc `quota: null` → unlimited (backward compatible).

### Quota counter (`~/.9router/quota.json`)

```javascript
{
  period: "2025-07",
  counters: {
    "key_abc123": {
      totalTokens: 523400,
      totalCost: 2.34,
      lastUpdated: "2025-07-10T14:30:00Z"
    }
  }
}
```

`period` dùng format `YYYY-MM`. Khi tháng hiện tại khác `period` → reset tất cả counters về 0, cập nhật `period`.

## Quota Check Flow

### Pre-request (trong `handleChat()`, sau khi extract API key)

1. Load counter từ `quota.json`
2. Check period — nếu sang tháng mới thì reset
3. Load quota config từ `apiKeys[]`
4. So sánh:
   - `totalTokens >= maxTokens` HOẶC `totalCost >= maxCost` → reject HTTP 429
   - `totalTokens/maxTokens >= warningThreshold` HOẶC `totalCost/maxCost >= warningThreshold` → set warning flag
   - Dưới threshold → pass bình thường

### Post-request (sau khi response hoàn tất)

1. Lấy usage từ `usageTracking` (đã có sẵn trong hệ thống)
2. Cộng dồn: `totalTokens += prompt_tokens + completion_tokens`, `totalCost += calculated_cost`
3. Ghi `quota.json`

### Warning headers

Khi request pass nhưng >= warningThreshold:

```
X-Quota-Warning: true
X-Quota-Tokens-Used: 820000
X-Quota-Tokens-Limit: 1000000
X-Quota-Cost-Used: 4.20
X-Quota-Cost-Limit: 5.00
X-Quota-Reset: 2025-08-01T00:00:00Z
```

### Error response (HTTP 429)

```json
{
  "error": {
    "type": "quota_exceeded",
    "message": "API key quota exceeded. Token usage: 1,002,345/1,000,000. Resets on 2025-08-01.",
    "code": "quota_exceeded",
    "quota": {
      "tokens": { "used": 1002345, "limit": 1000000 },
      "cost": { "used": 5.12, "limit": 5.00 },
      "resetsAt": "2025-08-01T00:00:00Z"
    }
  }
}
```

## API Endpoints

### GET /api/keys/:id/quota

Trả về quota status của key.

```json
{
  "keyId": "key_abc123",
  "quota": { "maxTokens": 1000000, "maxCost": 5.00, "warningThreshold": 0.8 },
  "usage": { "totalTokens": 523400, "totalCost": 2.34 },
  "percentage": { "tokens": 52.3, "cost": 46.8 },
  "period": "2025-07",
  "resetsAt": "2025-08-01T00:00:00Z"
}
```

### PUT /api/keys/:id/quota

Cập nhật quota config.

Request body:
```json
{ "maxTokens": 2000000, "maxCost": 10.00, "warningThreshold": 0.9 }
```

Validation:
- `maxTokens`: positive integer hoặc null
- `maxCost`: positive number hoặc null
- `warningThreshold`: number từ 0.1 đến 0.99

### POST /api/keys/:id/quota/reset

Reset counter thủ công cho key (admin dùng khi muốn cho key dùng lại sớm). Không cần body.

### GET /api/usage/quota-summary

Overview tất cả key có quota.

```json
{
  "period": "2025-07",
  "resetsAt": "2025-08-01T00:00:00Z",
  "keys": [
    {
      "keyId": "key_abc123",
      "name": "Production App",
      "percentage": { "tokens": 52.3, "cost": 46.8 },
      "status": "ok"
    },
    {
      "keyId": "key_xyz789",
      "name": "Dev Key",
      "percentage": { "tokens": 92.1, "cost": 88.0 },
      "status": "warning"
    }
  ]
}
```

`status`: `"ok"` | `"warning"` | `"exceeded"`

## Module Architecture

### New files

```
src/lib/quotaDb.js                          # Core: đọc/ghi quota.json, check, reset, increment
src/app/api/keys/[id]/quota/route.js        # GET + PUT quota config & status
src/app/api/keys/[id]/quota/reset/route.js  # POST reset counter
```

### Modified files

```
src/sse/handlers/chat.js        # Thêm quota check trước khi route request
open-sse/utils/usageTracking.js # Hook post-request → gọi quotaDb.incrementCounter()
src/lib/localDb.js              # Mở rộng apiKeys schema (thêm quota field)
src/app/api/usage/route.js      # Thêm endpoint quota-summary (hoặc file mới)
```

### quotaDb.js API

```javascript
// Đọc quota counter cho 1 key (auto-reset nếu sang tháng)
getCounter(keyId) → { totalTokens, totalCost, lastUpdated }

// Check quota: trả về { allowed: bool, warning: bool, details: {...} }
checkQuota(keyId) → { allowed, warning, usage, limit, resetsAt }

// Cộng dồn usage sau request hoàn tất
incrementCounter(keyId, { tokens, cost }) → void

// Reset counter thủ công
resetCounter(keyId) → void

// Lấy summary tất cả key
getAllCounters() → { period, counters }
```

## Dashboard UI

Mở rộng trang API Keys hiện tại:

- Mỗi key hiển thị progress bar (% token + % cost)
- Màu: xanh < 80%, vàng 80-99%, đỏ >= 100%
- Click key → panel chi tiết: biểu đồ usage theo ngày trong tháng, ngày reset, nút reset thủ công
- Form tạo/sửa key thêm fields: maxTokens, maxCost, warningThreshold

## Edge Cases

- **Key không có quota config:** treated as unlimited, skip check entirely.
- **`requireApiKey = false`:** không check quota (vì không có key identity).
- **Request vượt quota giữa stream:** cho hoàn thành request hiện tại, ghi nhận vượt, block request tiếp.
- **Nhiều request đồng thời cùng key:** có thể vượt nhẹ do race condition. Chấp nhận — file lock (`proper-lockfile`) khi ghi sẽ serialize writes, nhưng reads có thể stale. Overshoot tối đa = 1 response.
- **quota.json bị corrupt/mất:** tạo mới với counters trống, period = tháng hiện tại.
- **Key bị xóa:** counter vẫn nằm trong quota.json, tự dọn khi reset tháng mới (orphan cleanup).

## Backward Compatibility

- Key cũ không có `quota` field → unlimited, behavior y hệt hiện tại.
- Không thay đổi format response cho client khi quota chưa bật.
- Warning headers là additive, không break client nào.
- `requireApiKey = false` → toàn bộ quota system bị bypass.

## Out of Scope (future work)

1. Default quota cho key mới tạo (settings-level)
2. Quota history/audit log
3. Model-level restrictions per key
4. Rate limiting (requests/phút)
5. Quota pooling (team shared quota)
6. Webhook/email notifications
