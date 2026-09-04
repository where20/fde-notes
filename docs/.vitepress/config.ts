import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'NestJS 学习笔记',
    description: '前端转 Agent 开发 · 35 天路线（总览 + Day 1~35 全系列完结）',
    // 部署到 GitHub Pages 项目站点（username.github.io/<repo>/）时，
    // 在部署工作流里设 VITE_BASE=/<repo>/；用户站点或自定义域名保持默认 '/'。
    base: process.env.VITE_BASE || '/',
    themeConfig: {
      nav: [
        { text: '总览', link: '/' },
        { text: '🔧 实战施工图', link: '/hands-on-guide' },
        {
          text: '阶段一 · 基础架构',
          items: [
            { text: 'Day 1 · Module/DI/IoC', link: '/day1-module-di' },
            { text: 'Day 2 · Decorator/Metadata', link: '/day2-decorator-metadata' },
          ],
        },
        {
          text: '阶段二 · 请求生命周期',
          items: [
            { text: 'Day 3 · 生命周期总览', link: '/day3-lifecycle' },
            { text: 'Day 4 · 登录实战', link: '/day4-auth' },
            { text: 'Day 5 · Middleware 深入', link: '/day5-middleware' },
            { text: 'Day 6 · Guard 深入', link: '/day6-guard' },
            { text: 'Day 7 · Pipe 深入', link: '/day7-pipe' },
            { text: 'Day 8 · Interceptor 深入', link: '/day8-interceptor' },
            { text: 'Day 9 · Exception Filter 深入', link: '/day9-exception-filter' },
          ],
        },
        {
          text: '阶段三 · REST API 与文档',
          items: [
            { text: 'Day 10 · REST API 设计规范', link: '/day10-rest-api' },
            { text: 'Day 11 · DTO 进阶', link: '/day11-dto-advanced' },
            { text: 'Day 12 · Swagger 文档', link: '/day12-swagger' },
          ],
        },
        {
          text: '阶段四 · 数据持久化',
          items: [
            { text: 'Day 13 · PostgreSQL 基础', link: '/day13-postgresql' },
            { text: 'Day 14 · Prisma 入门', link: '/day14-prisma-intro' },
            { text: 'Day 15 · NestJS 整合 Prisma', link: '/day15-nestjs-prisma' },
            { text: 'Day 16 · 关系建模与事务', link: '/day16-relations-transaction' },
            { text: 'Day 17 · 高级查询与实战', link: '/day17-advanced-query' },
          ],
        },
        {
          text: '阶段五 · 安全与认证',
          items: [
            { text: 'Day 18 · JWT 认证原理', link: '/day18-jwt-auth' },
            { text: 'Day 19 · Passport 策略', link: '/day19-passport' },
            { text: 'Day 20 · RBAC 权限控制', link: '/day20-rbac' },
            { text: 'Day 21 · 认证实战整合', link: '/day21-auth-practice' },
          ],
        },
        {
          text: '阶段六 · 工程化',
          items: [
            { text: 'Day 22 · 工程化与配置管理', link: '/day22-config-logging' },
            { text: 'Day 23 · 测试（单元 + E2E）', link: '/day23-testing' },
            { text: 'Day 24 · Docker 容器化', link: '/day24-docker' },
            { text: 'Day 25 · 工程化实战整合', link: '/day25-engineering-practice' },
          ],
        },
        {
          text: '阶段七 · 缓存/队列/实时',
          items: [
            { text: 'Day 26 · Redis 缓存', link: '/day26-redis' },
            { text: 'Day 27 · BullMQ 任务队列', link: '/day27-bullmq' },
            { text: 'Day 28 · WebSocket 实时通信', link: '/day28-websocket' },
            { text: 'Day 29 · SSE 与实时实战', link: '/day29-sse-realtime' },
          ],
        },
        {
          text: '阶段八 · 底层原理',
          items: [
            { text: 'Day 30 · IoC/DI 底层原理', link: '/day30-ioc-di-internals' },
            { text: 'Day 31 · Provider 作用域', link: '/day31-scope' },
            { text: 'Day 32 · 动态模块', link: '/day32-dynamic-module' },
            { text: 'Day 33 · 装饰器与元编程', link: '/day33-decorator-metaprogramming' },
          ],
        },
        {
          text: '阶段九 · 微服务与毕业',
          items: [
            { text: 'Day 34 · 微服务与 MQ', link: '/day34-microservices-mq' },
            { text: 'Day 35 · CQRS 与毕业', link: '/day35-cqrs-graduation' },
          ],
        },
        {
          text: 'Agent 开发',
          items: [
            { text: '第 1 篇 · Node 版最小示例', link: '/agent-01-node-agent' },
            { text: '第 2 篇 · Agent 循环接进 NestJS', link: '/agent-02-agent-in-nestjs' },
          ],
        },
      ],
      sidebar: [
        {
          text: '阶段一 · 基础架构',
          items: [
            { text: '总览 · 35 天路线', link: '/' },
            { text: '🔧 实战施工图', link: '/hands-on-guide' },
            { text: 'Day 1 · Module/DI/IoC', link: '/day1-module-di' },
            { text: 'Day 2 · Decorator/Metadata', link: '/day2-decorator-metadata' },
          ],
        },
        {
          text: '阶段二 · 请求生命周期',
          items: [
            { text: 'Day 3 · 生命周期总览', link: '/day3-lifecycle' },
            { text: 'Day 4 · 登录实战', link: '/day4-auth' },
            { text: 'Day 5 · Middleware 深入', link: '/day5-middleware' },
            { text: 'Day 6 · Guard 深入', link: '/day6-guard' },
            { text: 'Day 7 · Pipe 深入', link: '/day7-pipe' },
            { text: 'Day 8 · Interceptor 深入', link: '/day8-interceptor' },
            { text: 'Day 9 · Exception Filter 深入', link: '/day9-exception-filter' },
          ],
        },
        {
          text: '阶段三 · REST API 与文档',
          items: [
            { text: 'Day 10 · REST API 设计规范', link: '/day10-rest-api' },
            { text: 'Day 11 · DTO 进阶', link: '/day11-dto-advanced' },
            { text: 'Day 12 · Swagger 文档', link: '/day12-swagger' },
          ],
        },
        {
          text: '阶段四 · 数据持久化',
          items: [
            { text: 'Day 13 · PostgreSQL 基础', link: '/day13-postgresql' },
            { text: 'Day 14 · Prisma 入门', link: '/day14-prisma-intro' },
            { text: 'Day 15 · NestJS 整合 Prisma', link: '/day15-nestjs-prisma' },
            { text: 'Day 16 · 关系建模与事务', link: '/day16-relations-transaction' },
            { text: 'Day 17 · 高级查询与实战', link: '/day17-advanced-query' },
          ],
        },
        {
          text: '阶段五 · 安全与认证',
          items: [
            { text: 'Day 18 · JWT 认证原理', link: '/day18-jwt-auth' },
            { text: 'Day 19 · Passport 策略', link: '/day19-passport' },
            { text: 'Day 20 · RBAC 权限控制', link: '/day20-rbac' },
            { text: 'Day 21 · 认证实战整合', link: '/day21-auth-practice' },
          ],
        },
        {
          text: '阶段六 · 工程化',
          items: [
            { text: 'Day 22 · 工程化与配置管理', link: '/day22-config-logging' },
            { text: 'Day 23 · 测试（单元 + E2E）', link: '/day23-testing' },
            { text: 'Day 24 · Docker 容器化', link: '/day24-docker' },
            { text: 'Day 25 · 工程化实战整合', link: '/day25-engineering-practice' },
          ],
        },
        {
          text: '阶段七 · 缓存/队列/实时',
          items: [
            { text: 'Day 26 · Redis 缓存', link: '/day26-redis' },
            { text: 'Day 27 · BullMQ 任务队列', link: '/day27-bullmq' },
            { text: 'Day 28 · WebSocket 实时通信', link: '/day28-websocket' },
            { text: 'Day 29 · SSE 与实时实战', link: '/day29-sse-realtime' },
          ],
        },
        {
          text: '阶段八 · 底层原理',
          items: [
            { text: 'Day 30 · IoC/DI 底层原理', link: '/day30-ioc-di-internals' },
            { text: 'Day 31 · Provider 作用域', link: '/day31-scope' },
            { text: 'Day 32 · 动态模块', link: '/day32-dynamic-module' },
            { text: 'Day 33 · 装饰器与元编程', link: '/day33-decorator-metaprogramming' },
          ],
        },
        {
          text: '阶段九 · 微服务与毕业',
          items: [
            { text: 'Day 34 · 微服务与 MQ', link: '/day34-microservices-mq' },
            { text: 'Day 35 · CQRS 与毕业', link: '/day35-cqrs-graduation' },
          ],
        },
        {
          text: 'Agent 开发',
          items: [
            { text: '第 1 篇 · Node 版最小示例', link: '/agent-01-node-agent' },
          ],
        },
      ],
      docFooter: { prev: true, next: true },
      outline: { level: [2, 3] },
    },
    vite: {
      server: {
        watch: {
          // dist 是 `vitepress build` 的产物目录，dev server 不应监听它。
          // 否则每次执行构建，都会触发 dev server 全量 page reload（本项目
          // dev 与 build 共用 docs/ 目录，产物落在 docs/.vitepress/dist/）。
          ignored: [
            '**/.vitepress/dist/**',
            '**/.vitepress/cache/**',
            '**/node_modules/**',
          ],
        },
      },
      optimizeDeps: {
        // mermaid 内部以 UMD/IIFE 格式引入 fastdom 等老包。
        // 若 mermaid 未被预打包，Vite 会通过 /@fs/ 逐个服务其内部 chunk，
        // 导致 fastdom-promised 以原始 UMD 形式加载 → 缺少 default export 报错。
        // 强制预打包 mermaid，让 esbuild 统一转换其内部所有 UMD 依赖为 ESM。
        include: [
          'mermaid',
          'fastdom',
          'fastdom/extensions/fastdom-promised',
        ],
      },
    },
  }),
)
