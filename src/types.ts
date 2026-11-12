// DSH 宿主边界的极简类型声明。真实类型见 @deepseek-ai/dsh-* 各包的 .d.ts，
// 这里只声明本插件用到的最小面，避免为类型引入重依赖。

export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render(args: unknown, value: unknown): TextContentBlock[];
  };
  execute(args: Record<string, unknown>): Promise<unknown>;
  timeoutMs?: number;
}

export interface ToolsService {
  register(definition: ToolDefinition): unknown;
}

export interface ResolvedCredential {
  value: string;
  source: string;
}

export interface CredentialsService {
  resolve(ref: string): Promise<ResolvedCredential | undefined>;
  set(ref: string, value: string): Promise<void>;
}

export interface DshContext {
  tools: ToolsService;
  credentials: CredentialsService;
}
