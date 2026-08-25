/**
 * The interactive surface: an MCP Apps card for a single service ticket.
 *
 * MCP Apps (SEP-1865, extension `io.modelcontextprotocol/ui`) has hosts fetch a
 * predeclared `ui://` resource and render it in a sandboxed iframe, then push the
 * tool's `structuredContent` into it as a `ui/notifications/tool-result`
 * notification. The card talks back over the same JSON-RPC channel to add a note.
 *
 * Everything is inline — no network, no CDN, no build step — so the card renders
 * under a strict iframe sandbox, and hosts without MCP Apps simply show the JSON
 * text content that every one of these tools also returns.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const TICKET_CARD_URI = "ui://connectwise-manage/ticket-card";
export const TICKET_CARD_MIME_TYPE = "text/html;profile=mcp-app";

export const TICKET_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ConnectWise ticket</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --fg: #16181d;
    --muted: #5c6370;
    --line: #e3e6eb;
    --chip: #f2f4f7;
    --accent: #1c6fd6;
    --danger: #b3261e;
    --ok: #126b45;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181d;
      --fg: #eceef2;
      --muted: #a0a7b4;
      --line: #2c3039;
      --chip: #22262e;
      --accent: #74a9f0;
      --danger: #f2b8b5;
      --ok: #7fd6a9;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    background: var(--bg);
    color: var(--fg);
    font: 14px/1.5 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  h1 { font-size: 16px; margin: 0 0 4px; line-height: 1.35; }
  .id { color: var(--muted); font-variant-numeric: tabular-nums; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 14px; }
  .chip {
    background: var(--chip);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 10px;
    font-size: 12px;
    white-space: nowrap;
  }
  .chip.closed { color: var(--ok); }
  dl {
    display: grid;
    grid-template-columns: minmax(90px, auto) 1fr;
    gap: 4px 14px;
    margin: 0 0 14px;
  }
  dt { color: var(--muted); font-size: 12px; }
  dd { margin: 0; overflow-wrap: anywhere; }
  section { border-top: 1px solid var(--line); padding-top: 12px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 8px; }
  .note { border-left: 2px solid var(--line); padding: 0 0 0 10px; margin-bottom: 10px; }
  .note-head { color: var(--muted); font-size: 12px; margin-bottom: 2px; }
  .note-body { white-space: pre-wrap; overflow-wrap: anywhere; }
  .more { color: var(--muted); font-size: 12px; }
  textarea {
    width: 100%;
    min-height: 68px;
    resize: vertical;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--fg);
    font: inherit;
  }
  .row { display: flex; align-items: center; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
  button {
    background: var(--accent);
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 7px 14px;
    font: inherit;
    cursor: pointer;
  }
  button[disabled] { opacity: .55; cursor: default; }
  .status { font-size: 12px; color: var(--muted); }
  .status.err { color: var(--danger); }
  .status.ok { color: var(--ok); }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<main id="root"><p class="empty">Waiting for ticket data…</p></main>
<script>
(function () {
  "use strict";

  var pending = {};
  var nextId = 1;
  var state = null;

  function host() { return window.parent !== window ? window.parent : null; }

  function send(message) {
    var target = host();
    if (target) target.postMessage(message, "*");
  }

  function request(method, params) {
    var openai = window.openai;
    if (method === "tools/call" && openai && typeof openai.callTool === "function") {
      return openai.callTool(params.name, params.arguments);
    }
    if (!host()) return Promise.reject(new Error("No host to call."));
    var id = "card-" + nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      send({ jsonrpc: "2.0", id: id, method: method, params: params });
      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          reject(new Error("The host did not answer in time."));
        }
      }, 30000);
    });
  }

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;

    if (msg.id !== undefined && msg.method === undefined) {
      var waiter = pending[msg.id];
      if (!waiter) return;
      delete pending[msg.id];
      if (msg.error) waiter.reject(new Error(msg.error.message || "Tool call failed."));
      else waiter.resolve(msg.result);
      return;
    }

    if (msg.method === "initialize") {
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: (msg.params && msg.params.protocolVersion) || "2025-06-18",
          capabilities: {},
          serverInfo: { name: "connectwise-ticket-card", version: "1.0.0" }
        }
      });
      return;
    }

    if (msg.method === "ping") {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
      return;
    }

    if (msg.method === "ui/notifications/tool-result") {
      render((msg.params && msg.params.structuredContent) || msg.params);
      return;
    }

    if (msg.id !== undefined && msg.method) {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found: " + msg.method } });
    }
  });

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function el(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  function named(value) {
    if (!value) return "";
    return text(value.name || value.identifier || value.id);
  }

  function when(value) {
    if (!value) return "";
    var parsed = new Date(value);
    return isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString();
  }

  function noteBody(note) {
    return text(note.text || note.notes || "");
  }

  function noteKind(note) {
    if (note.resolutionFlag) return "Resolution";
    if (note.internalAnalysisFlag) return "Internal";
    if (note.detailDescriptionFlag) return "Discussion";
    return "Note";
  }

  function render(data) {
    if (!data) return;
    state = {
      ticket: data.ticket || data,
      notes: (data.notes && data.notes.items) || data.notes || []
    };
    draw();
  }

  function draw(message, tone) {
    var ticket = state.ticket || {};
    var notes = state.notes || [];
    var root = document.getElementById("root");
    root.textContent = "";

    var title = el("h1");
    title.appendChild(el("span", "id", "#" + text(ticket.id) + " "));
    title.appendChild(document.createTextNode(text(ticket.summary)));
    root.appendChild(title);

    var chips = el("div", "chips");
    [
      named(ticket.status),
      named(ticket.priority),
      named(ticket.board),
      ticket.closedFlag ? "Closed" : ""
    ].forEach(function (value) {
      if (!value) return;
      var chip = el("span", value === "Closed" ? "chip closed" : "chip", value);
      chips.appendChild(chip);
    });
    root.appendChild(chips);

    var dl = document.createElement("dl");
    [
      ["Company", named(ticket.company)],
      ["Contact", named(ticket.contact)],
      ["Owner", named(ticket.owner)],
      ["Type", named(ticket.type)],
      ["Hours", ticket.actualHours === undefined ? "" : text(ticket.actualHours)],
      ["Updated", when(ticket._info && ticket._info.lastUpdated)]
    ].forEach(function (pair) {
      if (!pair[1]) return;
      dl.appendChild(el("dt", null, pair[0]));
      dl.appendChild(el("dd", null, pair[1]));
    });
    if (dl.childNodes.length) root.appendChild(dl);

    var notesSection = el("section");
    notesSection.appendChild(el("h2", null, "Notes"));
    if (!notes.length) {
      notesSection.appendChild(el("p", "empty", "No notes on this ticket."));
    } else {
      notes.slice(0, 5).forEach(function (note) {
        var wrap = el("div", "note");
        wrap.appendChild(
          el("div", "note-head", noteKind(note) + " · " + text(note.createdBy || "") + " · " + when(note.dateCreated))
        );
        wrap.appendChild(el("div", "note-body", noteBody(note)));
        notesSection.appendChild(wrap);
      });
      if (notes.length > 5) {
        notesSection.appendChild(el("p", "more", notes.length - 5 + " older note(s) not shown."));
      }
    }
    root.appendChild(notesSection);

    var composer = el("section");
    composer.appendChild(el("h2", null, "Add internal note"));
    var box = document.createElement("textarea");
    box.placeholder = "Visible to your team only — posted as an internal analysis note.";
    composer.appendChild(box);

    var row = el("div", "row");
    var button = el("button", null, "Add internal note");
    var status = el("span", tone ? "status " + tone : "status", message || "");
    row.appendChild(button);
    row.appendChild(status);
    composer.appendChild(row);
    root.appendChild(composer);

    button.addEventListener("click", function () {
      var value = box.value.trim();
      if (!value) {
        status.className = "status err";
        status.textContent = "Write the note first.";
        return;
      }
      button.disabled = true;
      status.className = "status";
      status.textContent = "Adding…";
      request("tools/call", {
        name: "cw_add_ticket_note",
        arguments: { ticketId: ticket.id, text: value, noteType: "internal" }
      }).then(function (result) {
        if (result && result.isError) throw new Error("ConnectWise rejected the note.");
        state.notes = [
          {
            text: value,
            internalAnalysisFlag: true,
            dateCreated: new Date().toISOString(),
            createdBy: "you"
          }
        ].concat(state.notes || []);
        draw("Note added.", "ok");
      }).catch(function (err) {
        button.disabled = false;
        status.className = "status err";
        status.textContent = err.message || "Could not add the note.";
      });
    });
  }

  var openai = window.openai;
  if (openai && openai.toolOutput) render(openai.toolOutput);
  window.addEventListener("openai:set_globals", function () {
    if (window.openai && window.openai.toolOutput) render(window.openai.toolOutput);
  });
})();
</script>
</body>
</html>
`;

/**
 * Predeclare the card so hosts can fetch and review it before any tool runs, which is
 * what MCP Apps asks for (templates are declared, not smuggled out in tool results).
 */
export function registerTicketCard(server: McpServer): void {
  server.registerResource(
    "ticket-card",
    TICKET_CARD_URI,
    {
      title: "Ticket Card",
      description:
        "Interactive card for one ConnectWise service ticket: status, assignment, recent notes, and an internal-note box.",
      mimeType: TICKET_CARD_MIME_TYPE,
      _meta: {
        ui: {
          // No network, no CDN: everything the card needs is in the document.
          csp: { connectDomains: [], resourceDomains: [] },
          prefersBorder: true,
        },
      },
    },
    async () => ({
      contents: [
        {
          uri: TICKET_CARD_URI,
          mimeType: TICKET_CARD_MIME_TYPE,
          text: TICKET_CARD_HTML,
        },
      ],
    }),
  );
}
