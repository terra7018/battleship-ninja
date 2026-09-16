// Verifies every board cell keeps the same size after shots are marked.
// Runs in Chrome via CDP (the page must be reachable at the URL below).
// Usage: node test/layout.test.js [url]   (default: local http-server on :8099)

const assert = require("assert");
const url = process.argv[2] || "http://localhost:8099/";

async function cdp() {
  const res = await fetch("http://localhost:29229/json/new?" + encodeURIComponent(url), { method: "PUT" });
  return res.json();
}

function connect(wsUrl) {
  const WebSocket = require("ws");
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.on("message", data => {
    const msg = JSON.parse(data);
    if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params) => new Promise(resolve => {
    const msgId = ++id;
    pending.set(msgId, resolve);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  return new Promise(resolve => ws.on("open", () => resolve({ send, close: () => ws.close() })));
}

const measure = `
  (() => {
    const cells = [...document.querySelectorAll('#enemy-board .cell')];
    const w = cells.map(c => Math.round(c.getBoundingClientRect().width * 100) / 100);
    const h = cells.map(c => Math.round(c.getBoundingClientRect().height * 100) / 100);
    return JSON.stringify({ widths: [...new Set(w)], heights: [...new Set(h)],
      boardWidth: document.getElementById('enemy-board').getBoundingClientRect().width });
  })()
`;

(async () => {
  const target = await cdp();
  const client = await connect(target.webSocketDebuggerUrl);
  const evaluate = async expr => {
    const r = await client.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result.result.value;
  };
  await new Promise(r => setTimeout(r, 1500));

  const before = JSON.parse(await evaluate(measure));
  assert.strictEqual(before.widths.length, 1, "cells uniform before shots: " + JSON.stringify(before.widths));

  // Randomize, start, and fire at a scattered set of cells so hits and misses appear.
  await evaluate(`document.getElementById('randomize-btn').click();
                  document.getElementById('start-btn').click();
                  [0,1,2,11,34,35,36,55,77,99].forEach(i => onEnemyBoardClick(i)); true`);
  await new Promise(r => setTimeout(r, 1200));

  const after = JSON.parse(await evaluate(measure));
  assert.strictEqual(after.widths.length, 1, "cells uniform after shots: " + JSON.stringify(after.widths));
  assert.strictEqual(after.heights.length, 1, "row heights uniform after shots: " + JSON.stringify(after.heights));
  assert.deepStrictEqual(after.widths, before.widths, "cell width unchanged by shots");
  assert.strictEqual(Math.round(after.boardWidth), Math.round(before.boardWidth), "board width unchanged");

  console.log("ok - cell geometry constant across shots", after.widths[0] + "px");
  client.close();
  await fetch(`http://localhost:29229/json/close/${target.id}`);
})().catch(e => { console.error(e.message); process.exit(1); });
