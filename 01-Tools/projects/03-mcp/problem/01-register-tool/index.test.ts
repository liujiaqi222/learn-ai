import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index";

let closeCurrent: (() => Promise<void>) | undefined;

async function connect() {
  const server = createServer();
  const client = new Client({ name: "tool-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeCurrent = async () => {
    await client.close();
    await server.close();
  };
  return client;
}

afterEach(async () => {
  await closeCurrent?.();
  closeCurrent = undefined;
});

describe("query_user Tool", () => {
  test("Client 能发现工具及其 userId schema", async () => {
    const client = await connect();
    const result = await client.listTools();
    const tool = result.tools.find(({ name }) => name === "query_user");

    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toContain("userId");
  });

  test("能查询用户，也能处理未知用户", async () => {
    const client = await connect();
    const found = await client.callTool({ name: "query_user", arguments: { userId: "002" } });
    const missing = await client.callTool({ name: "query_user", arguments: { userId: "999" } });

    expect(JSON.stringify(found.content)).toContain("李四");
    expect(JSON.stringify(found.content)).toContain("user");
    expect(JSON.stringify(missing.content)).toContain("不存在");
  });
});
