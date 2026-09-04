import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiProcessor } from './ai.processor';
import { AiService } from './ai.service';
import { McpService } from './mcp.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'ai' })],
  controllers: [AiController],
  providers: [AiService, AiProcessor, McpService],
})
export class AiModule {}
