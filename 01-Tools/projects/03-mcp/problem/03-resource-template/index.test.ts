import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index";

let closeCurrent: (() => Promise<void>) | undefined;

async function connect() {
  const server = createServer();
  const client = new Client({ name: "template-test", version: "1.0.0" });
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

test("能发现模板并按 URI 读取不同用户", async () => {
  const client = await connect();
  const templates = await client.listResourceTemplates();
  const found = await client.readResource({ uri: "user://002" });
  const missing = await client.readResource({ uri: "user://999" });

  expect(templates.resourceTemplates.some(({ uriTemplate }) => uriTemplate === "user://{userId}")).toBe(true);
  expect(JSON.stringify(found.contents)).toContain("李四");
  expect(JSON.stringify(found.contents)).toContain("lisi@example.com");
  expect(JSON.stringify(missing.contents)).toContain("不存在");
});
