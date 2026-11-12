"use client";

import { useEffect, useMemo, useState } from "react";

type AdminTableSummary = {
  name: string;
  label: string;
  primaryKeys: string[];
  columns: string[];
  total: number;
};

type AdminTable = AdminTableSummary & {
  searchableColumns?: string[];
  orderBy?: string;
};

type RowsPayload = {
  table: AdminTable;
  page: number;
  pageSize: number;
  total: number;
  rows: Array<Record<string, unknown>>;
};

const pageSize = 25;

export function AdminPanel() {
  const [tables, setTables] = useState<AdminTableSummary[]>([]);
  const [activeTable, setActiveTable] = useState("snapshots");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<RowsPayload | null>(null);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [editorText, setEditorText] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");

  const activeMeta = payload?.table ?? tables.find((table) => table.name === activeTable);
  const totalPages = payload ? Math.max(1, Math.ceil(payload.total / payload.pageSize)) : 1;
  const previewColumns = useMemo(() => getPreviewColumns(activeMeta), [activeMeta]);

  async function loadTables() {
    const response = await fetch("/api/admin/db");
    const data = (await response.json()) as { tables: AdminTableSummary[] };
    setTables(data.tables);
  }

  async function loadRows(nextQuery = query) {
    const params = new URLSearchParams({
      table: activeTable,
      page: String(page),
      pageSize: String(pageSize),
      q: nextQuery
    });
    const response = await fetch(`/api/admin/db?${params.toString()}`);
    const data = (await response.json()) as RowsPayload;
    setPayload(data);
  }

  useEffect(() => {
    let ignore = false;
    fetch("/api/admin/db")
      .then((response) => response.json())
      .then((data: { tables: AdminTableSummary[] }) => {
        if (!ignore) {
          setTables(data.tables);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage("加载数据表失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams({
      table: activeTable,
      page: String(page),
      pageSize: String(pageSize),
      q: query
    });
    fetch(`/api/admin/db?${params.toString()}`)
      .then((response) => response.json())
      .then((data: RowsPayload) => {
        if (!ignore) {
          setPayload(data);
        }
      })
      .catch(() => {
        if (!ignore) {
          setMessage("加载记录失败");
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeTable, page, query]);

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    await loadRows(query);
  }

  function selectRow(row: Record<string, unknown>) {
    setSelectedRow(row);
    setIsCreating(false);
    setEditorText(JSON.stringify(row, null, 2));
    setMessage("");
  }

  function startCreate() {
    const empty = Object.fromEntries((activeMeta?.columns ?? []).map((column) => [column, ""]));
    for (const key of activeMeta?.primaryKeys ?? []) {
      if (key === "id") {
        delete empty[key];
      }
    }
    setSelectedRow(null);
    setIsCreating(true);
    setEditorText(JSON.stringify(empty, null, 2));
    setMessage("");
  }

  async function saveEditor() {
    if (!activeMeta) {
      return;
    }

    try {
      const values = JSON.parse(editorText) as Record<string, unknown>;
      const response = await fetch("/api/admin/db", {
        method: isCreating ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          table: activeTable,
          key: selectedRow ? primaryKey(activeMeta, selectedRow) : undefined,
          values
        })
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      setMessage(isCreating ? "已新增记录" : "已保存修改");
      setIsCreating(false);
      await loadTables();
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function deleteSelected() {
    if (!activeMeta || !selectedRow) {
      return;
    }
    if (!window.confirm("确认删除这条记录？这个操作不可恢复。")) {
      return;
    }

    const response = await fetch("/api/admin/db", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        table: activeTable,
        key: primaryKey(activeMeta, selectedRow)
      })
    });
    if (response.ok) {
      setSelectedRow(null);
      setEditorText("");
      setMessage("已删除记录");
      await loadTables();
      await loadRows();
    } else {
      setMessage(await response.text());
    }
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span>WcCAT</span>
          <small>SQLite Admin</small>
        </div>
        <nav aria-label="数据库表">
          {tables.map((table) => (
            <button
              className={table.name === activeTable ? "active" : ""}
              key={table.name}
              onClick={() => {
                setActiveTable(table.name);
                setPage(1);
                setQuery("");
                setSelectedRow(null);
                setEditorText("");
                setIsCreating(false);
              }}
              type="button"
            >
              <span>{table.label}</span>
              <b>{table.total}</b>
              <small>{table.name}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Local Database</p>
            <h1>{activeMeta?.label ?? activeTable}</h1>
            <p>数据库文件：`data/wccat.sqlite`，本页面只挂载在独立路由 `/admin`。</p>
          </div>
          <form onSubmit={submitSearch}>
            <input onChange={(event) => setQuery(event.target.value)} placeholder="搜索当前表..." value={query} />
            <button type="submit">查询</button>
            <button onClick={startCreate} type="button">
              新增
            </button>
          </form>
        </header>

        <section className="admin-grid">
          <div className="admin-table-card">
            <div className="admin-table-head">
              <span>
                {payload?.total ?? 0} 条记录 · 第 {page}/{totalPages} 页
              </span>
              <div>
                <button
                  disabled={page <= 1}
                  onClick={() => {
                    setSelectedRow(null);
                    setEditorText("");
                    setIsCreating(false);
                    setPage((value) => Math.max(1, value - 1));
                  }}
                  type="button"
                >
                  上一页
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => {
                    setSelectedRow(null);
                    setEditorText("");
                    setIsCreating(false);
                    setPage((value) => Math.min(totalPages, value + 1));
                  }}
                  type="button"
                >
                  下一页
                </button>
              </div>
            </div>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payload?.rows.map((row, index) => (
                    <tr
                      className={selectedRow && samePrimaryKey(activeMeta, selectedRow, row) ? "active" : ""}
                      key={`${activeTable}-${index}-${JSON.stringify(primaryKey(activeMeta, row))}`}
                      onClick={() => selectRow(row)}
                    >
                      {previewColumns.map((column) => (
                        <td key={column}>{formatCell(row[column])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="admin-editor-card">
            <div className="admin-editor-head">
              <div>
                <p className="eyebrow">{isCreating ? "Create" : "Editor"}</p>
                <h2>{isCreating ? "新增记录" : selectedRow ? "编辑记录" : "选择一条记录"}</h2>
              </div>
              <div>
                <button disabled={!editorText} onClick={saveEditor} type="button">
                  保存
                </button>
                <button disabled={!selectedRow || isCreating} onClick={deleteSelected} type="button">
                  删除
                </button>
              </div>
            </div>
            <textarea
              onChange={(event) => setEditorText(event.target.value)}
              placeholder="选择一条记录，或点击新增。这里使用 JSON 编辑。"
              spellCheck={false}
              value={editorText}
            />
            {message ? <p className="admin-message">{message}</p> : null}
          </aside>
        </section>
      </section>
    </main>
  );
}

function getPreviewColumns(table?: AdminTable | AdminTableSummary) {
  if (!table) {
    return [];
  }

  return table.columns.filter((column) => !["payload", "request_payload", "response_payload"].includes(column)).slice(0, 8);
}

function primaryKey(table: AdminTable | AdminTableSummary | undefined, row: Record<string, unknown>) {
  return Object.fromEntries((table?.primaryKeys ?? []).map((key) => [key, row[key]]));
}

function samePrimaryKey(
  table: AdminTable | AdminTableSummary | undefined,
  left: Record<string, unknown>,
  right: Record<string, unknown>
) {
  return (table?.primaryKeys ?? []).every((key) => left[key] === right[key]);
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 120)}...` : value;
  }
  return String(value);
}
