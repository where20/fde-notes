# 📙 Day 28：WebSocket 实时通信

> 前置回顾：Day 27 把耗时任务丢进队列，但前端要知道任务进度只能轮询。本篇解决**服务端主动推送**——WebSocket 双向实时通信。聊天、协作编辑、实时通知都靠它。

---

## 28.1 HTTP 的局限：只能"你问我答"

| 特性 | HTTP | WebSocket |
| ---- | ---- | ---- |
| 通信方向 | 单向（客户端发起） | **双向**（服务端可主动推） |
| 连接 | 请求-响应后关闭 | **长连接**（保持） |
| 实时性 | 靠轮询（浪费资源） | 原生实时推送 |
| 开销 | 每次带完整 Header | 握手后开销极小 |

### 轮询的痛点

```
轮询：客户端每秒问一次"好了吗？"  → 99% 请求是浪费
长轮询：客户端问，服务端"憋着"直到有数据 → 实现复杂
WebSocket：建立连接后，服务端随时推  → 最优解
```

> 一句话：**HTTP 适合"请求-响应"，WebSocket 适合"持续双向通信"**。

---

## 28.2 WebSocket 握手过程

WebSocket 连接从 HTTP 握手开始，"升级"协议：

```
客户端 → GET /ws  Upgrade: websocket  Connection: Upgrade
服务端 → 101 Switching Protocols          （协议升级成功）
         ↓
    之后走 WebSocket 帧协议，双向通信
```

> 关键：WebSocket **复用 HTTP 握手**，通过 `101 Switching Protocols` 状态码升级，之后就是独立的 WS 协议。

---

## 28.3 NestJS Gateway

NestJS 用 **Gateway** 抽象 WebSocket（串 Day 3：`ExecutionContext.getType()` 可以是 `'ws'`）。

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

```ts
// chat.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },        // 允许跨域
  namespace: '/chat',            // 命名空间（可选）
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  // 客户端连接时触发
  handleConnection(client: Socket) {
    this.logger.log(`客户端连接: ${client.id}`);
  }

  // 客户端断开时触发
  handleDisconnect(client: Socket) {
    this.logger.log(`客户端断开: ${client.id}`);
  }

  // 监听客户端发来的 'message' 事件
  @SubscribeMessage('message')
  handleMessage(
    @MessageBody() data: { text: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`收到消息: ${data.text}`);
    return { event: 'message', data: `服务端收到: ${data.text}` };   // 回给发送者
  }
}
```

> Gateway 就像"WebSocket 版的 Controller"：`@SubscribeMessage` = 路由，处理客户端事件。

---

## 28.4 服务端主动推送（核心）

WebSocket 的价值在于**服务端随时推**：

```ts
@Injectable()
export class ChatGateway {
  @WebSocketServer()
  server: Server;        // Socket.IO 服务端实例

  // 广播给所有连接的客户端
  broadcastToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  // 推送给指定客户端
  sendToClient(clientId: string, event: string, data: any) {
    this.server.to(clientId).emit(event, data);
  }
}
```

### 推送场景速查

| 方法 | 作用 |
| ---- | ---- |
| `server.emit(event, data)` | 广播给**所有**客户端 |
| `server.to(room).emit(...)` | 推给**某个房间**的所有人 |
| `client.emit(event, data)` | 推给**单个**客户端 |
| `client.broadcast.emit(...)` | 推给**除自己外所有人** |
| `server.to(userId).emit(...)` | 推给指定用户（需绑定 userId） |

---

## 28.5 房间（Room）：分组推送

房间是 Socket.IO 的核心概念，用于**分组广播**（聊天室、协作房间）。

```ts
@SubscribeMessage('joinRoom')
handleJoinRoom(
  @MessageBody() roomId: string,
  @ConnectedSocket() client: Socket,
) {
  client.join(roomId);                                  // 加入房间
  client.to(roomId).emit('userJoined', { id: client.id });  // 通知房间内其他人
}

@SubscribeMessage('leaveRoom')
handleLeaveRoom(@MessageBody() roomId: string, @ConnectedSocket() client: Socket) {
  client.leave(roomId);
}
```

> 典型应用：多人聊天室、协作文档、直播间弹幕——同一房间的消息只推给房间成员。

---

## 28.6 认证：WebSocket 怎么鉴权？

WebSocket 握手阶段还是 HTTP，可以从握手信息取 token：

```ts
@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayConnection {
  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token    // 客户端连接时带 token
      || client.handshake.headers?.authorization;

    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;           // 存到 socket 上下文
    } catch {
      client.disconnect();                        // 鉴权失败断开
    }
  }
}
```

> ⚠️ **注意**：Guard 也能用在 Gateway 上（`@UseGuards(WsGuard)`），但 Gateway 的 Guard 拿到的 `ExecutionContext.getType()` 是 `'ws'`，取请求要用 `context.switchToWs().getClient()` 而非 `switchToHttp()`。

---

## 28.7 心跳与断线重连

长连接会"假死"（网络中断但双方不知道），需要心跳保活：

```ts
@WebSocketGateway({
  pingInterval: 25000,     // 每 25 秒发一次 ping
  pingTimeout: 60000,      // 60 秒无响应判定断开
})
```

客户端断线重连：

```ts
// 前端（Socket.IO 客户端自动重连）
socket.on('disconnect', () => { /* 自动重连 */ });
```

---

## 28.8 注意事项

| 坑 | 说明 |
| ---- | ---- |
| **水平扩展问题** | 多实例部署时，A 实例的连接收不到 B 实例推的消息 → 需 Redis Adapter 同步 |
| 连接数上限 | 单机 WebSocket 连接数有限，需压测 |
| 消息丢失 | WebSocket 不保证消息必达，关键消息要确认机制 |
| 别滥用 | 简单场景用 SSE（Day 29）更轻量 |

### 多实例扩展（Redis Adapter）

```ts
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';

// 多个 Gateway 实例通过 Redis 同步消息
```

---

## 28.9 自检清单

- [ ] WebSocket 相比 HTTP 的核心优势？
- [ ] 握手过程？`101 Switching Protocols` 是什么？
- [ ] Gateway 和 Controller 的类比关系？`@SubscribeMessage` 作用？
- [ ] 广播 / 房间 / 单推分别用什么方法？
- [ ] 房间（Room）解决什么问题？
- [ ] WebSocket 怎么做鉴权？token 从哪取？
- [ ] 多实例部署时 WebSocket 有什么问题？怎么解决？
- [ ] 什么时候不该用 WebSocket？

---

## 🔗 上下篇

← [Day 27：BullMQ 任务队列](/day27-bullmq) ｜ → [Day 29：SSE 与实时实战整合](/day29-sse-realtime)
