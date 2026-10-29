# 原型事件接入契约（尚未启用真实采集）

需要迁移 `117_product_events.sql` 和服务端 `PRODUCT_EVENTS_ENABLED=true`。默认关闭；此代码不会创建实际原型或向现站访客安装采集脚本。

在工作台先保存停用定义，再由 owner 明确确认实际 HTTPS 原型、已经向使用者展示的告知地址/版本、事件白名单及 1–30 天保留期，最后激活。修改告知或定义时建立新定义并重新确认。URL 不接受凭证、查询参数或片段。

激活/轮换只在成功的首次响应中返回一次随机令牌。数据库只保存 SHA-256；停用/撤销/删除拒绝后续事件，轮换令旧令牌立即失效。响应丢失后，以同一请求身份重试不会返回另一份未生效的令牌；需要再次轮换。令牌只放在原型服务端的秘密环境变量，不进入浏览器、日志或 sessionStorage。

服务端入口：`POST /api/product-events`，`Authorization: Bearer <token>`，`Content-Type: application/json`。最大 8192 字节；数据库限制每原型 60 条/分钟、5000 条/24 小时。不接受 owner/user_id、原始搜索词、姓名、邮件、IP、设备指纹或任意附加 JSON。

```json
{
  "externalId": "a7a91188-cfce-4b0d-b96a-8d11232b2481",
  "kind": "query",
  "occurredAt": "2026-10-28T01:00:00Z",
  "noticeVersion": "v1",
  "attributes": {"resultCount": 0}
}
```

`externalId` 是原型服务端生成的事件 UUID，重试使用同一 ID 和内容；同 ID 不同内容拒绝。`occurredAt` 要带时区，不得在未来或超出该原型保留期；`capturedAt` 由数据库生成。可选 `subjectHash` 只能是 64 位小写十六进制的单向散列，用于匿名标识；不能传原始身份或浏览器指纹。

| kind | attributes（仅这些字段） |
| --- | --- |
| query | `{"resultCount": 0}`；整数 0–1000000 |
| no_result | `{}` |
| task_completed | `{"durationBucket":"unknown"}`；`under_minute` / `one_to_five_minutes` / `over_five_minutes` / `unknown` |
| return_visit | `{"interval":"unknown"}`；`day` / `week` / `month` / `unknown` |
| inquiry | `{"channel":"form"}`；`form` / `email` / `other`，不传实际邮件地址 |
| payment | `{"amountMinor":100,"currency":"JPY","kind":"one_time"}`；金额最小单位整数 0–1000000000，币种 JPY/USD/EUR，类型 one_time/recurring |

点击、咨询、付款均只是原型自报的事件，单次付款不证明长期需求。只有 owner 主动写明适用范围和未知，才建立本人想法的引用；不会新增真人 validation、修改 status/last_activity_at 或绕过锁定机制。

删除原型会原子撤销令牌、清除接入资料、事件属性、匿名散列、外部 ID、事件时间及内容指纹，并清除派生关联的适用说明/未知；引用保留无内容占位。删除回执只有 owner、数量、原因和时间，没有访客内容。

过期内容不能从正常列表/RLS 或派生引用读取；读取和收录时会执行有界物理清理。可在工作台立即清理本人全部超期内容；`purgeExpiredProductEvents(limit)` 提供 service-only 批量清理。物理清理任务需要另外启用受保护的运行入口，不因交付代码而自动获得生产定时运行能力。

仅本地 SQL 夹具验证：

```text
node lib/domains/observations/product-events/postgres.integration.mjs <absolute PGlite dist/index.js>
```

脚本创建隔离 PostgreSQL 实例，不连接真实 Supabase 或真实原型。
