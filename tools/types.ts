import { z } from 'zod';
import type { PermissionAction } from '../core/permissions';

export const toolPermissionSchema = z.enum([
  'computer_control',
  'file_read',
  'file_modify',
  'app_install',
  'purchase',
  'system_destruction',
  'terminal',
  'web',
  'clipboard',
]);

export interface ToolContext {
  signal?: AbortSignal;
  confirm: (message: string) => Promise<boolean>;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  permission: PermissionAction;
  execute: (input: TInput, ctx: ToolContext) => Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition<any>>();

  register<T>(tool: ToolDefinition<T>): void {
    this.tools.set(tool.name, tool as ToolDefinition<any>);
  }

  get(name: string): ToolDefinition<any> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<any>[] {
    return [...this.tools.values()];
  }

  toLlmTools(): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema),
    }));
  }
}

/** Minimal Zod -> JSON Schema for tool parameters. */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return {
      type: 'object',
      properties,
      required: required.length ? required : undefined,
      additionalProperties: false,
    };
  }
  if (schema instanceof z.ZodString) return { type: 'string', description: schema.description };
  if (schema instanceof z.ZodNumber) return { type: 'number', description: schema.description };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean', description: schema.description };
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodDefault) return zodToJsonSchema(schema._def.innerType);
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options, description: schema.description };
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: zodToJsonSchema(schema.element) };
  }
  return { type: 'object' };
}
