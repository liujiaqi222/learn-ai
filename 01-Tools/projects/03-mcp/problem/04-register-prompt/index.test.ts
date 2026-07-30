import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index";

let closeCurrent: (() => Promise<void>) | undefined;

async function connect() {
  const server = createServer();
  const client = new Client({ name: "prompt-test", version: "1.0.0" });
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

test("能发现并获取 summarize_user Prompt", async () => {
  const client = await connect();
  const listed = await client.listPrompts();
  const result = await client.getPrompt({ name: "summarize_user", arguments: { userId: "001" } });

  expect(listed.prompts.some(({ name }) => name === "summarize_user")).toBe(true);
  expect(result.messages[0]?.role).toBe("user");
  expect(JSON.stringify(result.messages)).toContain("张三");
  expect(JSON.stringify(result.messages)).toContain("admin");
  expect(JSON.stringify(result.messages)).toContain("总结");
});
