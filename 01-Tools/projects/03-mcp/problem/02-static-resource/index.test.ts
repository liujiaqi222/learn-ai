import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./index";

let closeCurrent: (() => Promise<void>) | undefined;

async function connect() {
  const server = createServer();
  const client = new Client({ name: "resource-test", version: "1.0.0" });
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

test("能列出并读取 docs://guide", async () => {
  const client = await connect();
  const listed = await client.listResources();
  const read = await client.readResource({ uri: "docs://guide" });

  expect(listed.resources.some(({ uri }) => uri === "docs://guide")).toBe(true);
  expect(read.contents[0]?.mimeType).toBe("text/plain");
  expect(JSON.stringify(read.contents)).toContain("使用指南");
  expect(JSON.stringify(read.contents)).toContain("query_user");
});
