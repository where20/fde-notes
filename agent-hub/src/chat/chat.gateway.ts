import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface ChatPayload {
  text?: string;
}

/**
 * 聊天网关：客户端连到 `/chat` 命名空间发消息，服务端回推（broadcast）。
 * 这是 Agent 应用"实时推送"（如流式答案、通知）的 WebSocket 实现。
 */
@WebSocketGateway({
  namespace: '/chat',
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`客户端接入: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`客户端断开: ${client.id}`);
  }

  @SubscribeMessage('message')
  handleMessage(
    client: Socket,
    payload: string | ChatPayload,
  ): { event: string; data: unknown } {
    const text =
      typeof payload === 'string' ? payload : payload?.text ?? '(空消息)';
    this.logger.log(`收到 ${client.id}: ${text}`);

    const message = {
      from: client.id,
      text,
      at: new Date().toISOString(),
    };

    // 回推给所有在线客户端（含发送者）
    this.server.emit('message', message);

    // 返回值作为 ACK 回给发送者
    return { event: 'message', data: message };
  }
}
