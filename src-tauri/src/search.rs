// 本地 SQLite FTS5 (trigram) 全文索引引擎：
// - FTS5 trigram 子串分词（中英文无需词典，支持任意 3+ 字符子串）
// - 1~2 字符短词自动回退 blocks_raw LIKE 子串扫描并去重合并
// - 按 Markdown 标题章节切块 + BM25(body=8.0, heading=4.0) 评分
// - 统一索引 App 草稿与本地挂载文件夹中的 Markdown 文档，支持过期文件索引清理

use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

const INDEX_FORMAT_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize)]
pub struct SnippetPart {
    pub text: String,
    pub highlight: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSearchHit {
    pub key: String,
    pub doc_id: String,
    pub title: String,
    pub path: String,
    pub heading: String,
    pub line: usize,
    pub parts: Vec<SnippetPart>,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSearchResponse {
    pub hits: Vec<GlobalSearchHit>,
    pub indexed_files: usize,
    pub indexed_blocks: usize,
    pub elapsed_ms: u64,
}

struct Block {
    heading: String,
    line_start: usize,
    line_end: usize,
    body: String,
}

fn split_terms(q: &str) -> Vec<String> {
    q.split_whitespace()
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == '\'')
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .collect()
}

fn fts_phrase(term: &str) -> String {
    format!("\"{}\"", term.replace('"', "\"\""))
}

fn escape_like(term: &str) -> String {
    let mut out = String::with_capacity(term.len());
    for c in term.chars() {
        if c == '%' || c == '_' || c == '\\' {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

fn split_blocks(content: &str) -> Vec<Block> {
    const MAX_BLOCK: usize = 1200;
    let mut blocks = Vec::new();
    let mut heading = String::new();
    let mut buf: Vec<&str> = Vec::new();
    let mut start_line = 1usize;

    let flush = |heading: &str,
                 buf: &mut Vec<&str>,
                 start: usize,
                 end: usize,
                 blocks: &mut Vec<Block>| {
        let body = buf.join("\n").trim().to_string();
        if body.is_empty() {
            buf.clear();
            return;
        }
        blocks.push(Block {
            heading: heading.to_string(),
            line_start: start,
            line_end: end,
            body,
        });
        buf.clear();
    };

    for (i, line) in content.lines().enumerate() {
        let lineno = i + 1;
        let trimmed = line.trim_start();
        if trimmed.starts_with('#') {
            let after_hashes = trimmed.trim_start_matches('#');
            if after_hashes.starts_with(' ') || after_hashes.starts_with('\t') {
                let end = if buf.is_empty() { lineno } else { lineno - 1 };
                flush(&heading, &mut buf, start_line, end, &mut blocks);
                heading = after_hashes.trim().to_string();
                start_line = lineno;
                buf.push(line);
                continue;
            }
        }
        if buf.is_empty() {
            start_line = lineno;
        }
        buf.push(line);
        let cur: usize = buf.iter().map(|l| l.len() + 1).sum();
        if cur > MAX_BLOCK {
            flush(&heading, &mut buf, start_line, lineno, &mut blocks);
            start_line = lineno + 1;
        }
    }
    if !buf.is_empty() {
        let end = content.lines().count().max(start_line);
        flush(&heading, &mut buf, start_line, end, &mut blocks);
    }
    blocks
}

fn find_case_insensitive_spans(body: &str, words: &[String]) -> Vec<(usize, usize)> {
    let body_chars: Vec<(usize, char)> = body
        .char_indices()
        .map(|(i, c)| (i, c.to_lowercase().next().unwrap_or(c)))
        .collect();
    let mut spans = Vec::new();
    for w in words {
        let w_chars: Vec<char> = w.to_lowercase().chars().collect();
        if w_chars.is_empty() || w_chars.len() > body_chars.len() {
            continue;
        }
        let mut i = 0;
        while i + w_chars.len() <= body_chars.len() {
            let matched = (0..w_chars.len()).all(|k| body_chars[i + k].1 == w_chars[k]);
            if matched {
                let start = body_chars[i].0;
                let end = if i + w_chars.len() < body_chars.len() {
                    body_chars[i + w_chars.len()].0
                } else {
                    body.len()
                };
                spans.push((start, end));
                i += w_chars.len();
                if spans.len() >= 12 {
                    break;
                }
            } else {
                i += 1;
            }
        }
    }
    spans.sort_unstable();
    // 合并重叠区间避免切片错位
    let mut merged: Vec<(usize, usize)> = Vec::with_capacity(spans.len());
    for (s, e) in spans {
        if let Some(last) = merged.last_mut() {
            if s <= last.1 {
                last.1 = last.1.max(e);
                continue;
            }
        }
        merged.push((s, e));
    }
    merged
}

fn make_snippet_parts(body: &str, line_start: usize, words: &[String]) -> (Vec<SnippetPart>, usize) {
    let spans = find_case_insensitive_spans(body, words);
    if spans.is_empty() {
        let snippet: String = body.chars().take(120).collect();
        return (
            vec![SnippetPart {
                text: snippet.replace(['\n', '\r'], " "),
                highlight: false,
            }],
            line_start,
        );
    }

    let first_byte = spans[0].0;
    let char_offsets: Vec<usize> = body.char_indices().map(|(i, _)| i).collect();
    let first_char_idx = char_offsets.binary_search(&first_byte).unwrap_or(0);
    let start_char = first_char_idx.saturating_sub(40);
    let end_char = (first_char_idx + 120).min(char_offsets.len());
    let start_byte = *char_offsets.get(start_char).unwrap_or(&0);
    let end_byte = if end_char < char_offsets.len() {
        char_offsets[end_char]
    } else {
        body.len()
    };

    let mut parts = Vec::new();
    if start_byte > 0 {
        parts.push(SnippetPart {
            text: "…".to_string(),
            highlight: false,
        });
    }
    let mut cursor = start_byte;
    for &(s, e) in &spans {
        if e <= start_byte || s >= end_byte {
            continue;
        }
        let cs = s.max(start_byte);
        let ce = e.min(end_byte);
        if cs > cursor {
            parts.push(SnippetPart {
                text: body[cursor..cs].replace(['\n', '\r'], " "),
                highlight: false,
            });
        }
        if ce > cs {
            parts.push(SnippetPart {
                text: body[cs..ce].replace(['\n', '\r'], " "),
                highlight: true,
            });
        }
        cursor = ce;
    }
    if cursor < end_byte {
        parts.push(SnippetPart {
            text: body[cursor..end_byte].replace(['\n', '\r'], " "),
            highlight: false,
        });
    }
    if end_byte < body.len() {
        parts.push(SnippetPart {
            text: "…".to_string(),
            highlight: false,
        });
    }

    let line = line_start + body[..first_byte].matches('\n').count();
    (parts, line)
}

pub struct SearchIndex {
    conn: Connection,
}

impl SearchIndex {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        if let Some(dir) = db_path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap_or(0);
        if version != INDEX_FORMAT_VERSION {
            conn.execute_batch(
                "DROP TABLE IF EXISTS blocks;
                 DROP TABLE IF EXISTS blocks_raw;
                 DROP TABLE IF EXISTS docs;",
            )
            .map_err(|e| e.to_string())?;
        }
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS docs(
               key TEXT PRIMARY KEY,
               doc_id TEXT NOT NULL DEFAULT '',
               path TEXT NOT NULL DEFAULT '',
               mtime INTEGER NOT NULL,
               size INTEGER NOT NULL,
               title TEXT NOT NULL DEFAULT ''
             );
             CREATE TABLE IF NOT EXISTS blocks_raw(
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               key TEXT NOT NULL,
               heading TEXT NOT NULL,
               line_start INTEGER NOT NULL,
               line_end INTEGER NOT NULL,
               body TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_blocks_raw_key ON blocks_raw(key);
             CREATE VIRTUAL TABLE IF NOT EXISTS blocks USING fts5(
               body,
               heading,
               content='blocks_raw',
               content_rowid='id',
               tokenize='trigram'
             );
             PRAGMA user_version = 1;",
        )
        .map_err(|e| e.to_string())?;
        Ok(Self { conn })
    }

    pub fn is_unchanged(&self, key: &str, mtime: i64, size: i64, doc_id: &str, title: &str) -> bool {
        self.conn
            .query_row(
                "SELECT mtime, size, doc_id, title FROM docs WHERE key = ?1",
                params![key],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, i64>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                },
            )
            .map(|(m, s, d, t)| m == mtime && s == size && d == doc_id && t == title)
            .unwrap_or(false)
    }

    pub fn upsert_content(
        &mut self,
        key: &str,
        doc_id: &str,
        path: &str,
        title: &str,
        mtime: i64,
        size: i64,
        content: &str,
    ) -> Result<(), String> {
        if self.is_unchanged(key, mtime, size, doc_id, title) {
            return Ok(());
        }
        self.remove_key(key)?;
        let mut blocks = split_blocks(content);
        if blocks.is_empty() && !title.is_empty() {
            blocks.push(Block {
                heading: title.to_string(),
                line_start: 1,
                line_end: 1,
                body: title.to_string(),
            });
        }
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;
        {
            let mut ins_raw = tx
                .prepare("INSERT INTO blocks_raw(key, heading, line_start, line_end, body) VALUES (?1, ?2, ?3, ?4, ?5)")
                .map_err(|e| e.to_string())?;
            let mut ins_fts = tx
                .prepare("INSERT INTO blocks(rowid, body, heading) VALUES (?1, ?2, ?3)")
                .map_err(|e| e.to_string())?;
            for b in &blocks {
                ins_raw
                    .execute(params![key, b.heading, b.line_start as i64, b.line_end as i64, b.body])
                    .map_err(|e| e.to_string())?;
                let id = tx.last_insert_rowid();
                ins_fts
                    .execute(params![id, b.body, b.heading])
                    .map_err(|e| e.to_string())?;
            }
            tx.execute(
                "INSERT OR REPLACE INTO docs(key, doc_id, path, mtime, size, title) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![key, doc_id, path, mtime, size, title],
            )
            .map_err(|e| e.to_string())?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_key(&mut self, key: &str) -> Result<(), String> {
        self.conn
            .execute(
                "DELETE FROM blocks WHERE rowid IN (SELECT id FROM blocks_raw WHERE key = ?1)",
                params![key],
            )
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM blocks_raw WHERE key = ?1", params![key])
            .map_err(|e| e.to_string())?;
        self.conn
            .execute("DELETE FROM docs WHERE key = ?1", params![key])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn prune_missing(&mut self, valid_keys: &HashSet<String>) -> Result<(), String> {
        let mut stmt = self
            .conn
            .prepare("SELECT key FROM docs")
            .map_err(|e| e.to_string())?;
        let existing: Vec<String> = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        drop(stmt);
        for k in existing {
            if !valid_keys.contains(&k) {
                self.remove_key(&k)?;
            }
        }
        Ok(())
    }

    pub fn stats(&self) -> (usize, usize) {
        let files = self
            .conn
            .query_row("SELECT COUNT(*) FROM docs", [], |r| r.get::<_, usize>(0))
            .unwrap_or(0);
        let blocks = self
            .conn
            .query_row("SELECT COUNT(*) FROM blocks_raw", [], |r| r.get::<_, usize>(0))
            .unwrap_or(0);
        (files, blocks)
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<GlobalSearchHit>, String> {
        let terms = split_terms(query);
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let (long_terms, short_terms): (Vec<&String>, Vec<&String>) =
            terms.iter().partition(|t| t.chars().count() >= 3);

        // (row_id, key, doc_id, path, title, heading, line_start, body, score)
        let mut rows_acc: Vec<(i64, String, String, String, String, String, usize, String, f64)> =
            Vec::new();
        let mut seen_ids: HashSet<i64> = HashSet::new();

        if !long_terms.is_empty() {
            let match_expr = long_terms
                .iter()
                .map(|t| fts_phrase(t))
                .collect::<Vec<_>>()
                .join(" OR ");
            let sql = "SELECT b.rowid, r.key, d.doc_id, d.path, d.title, r.heading, r.line_start, r.body, bm25(blocks, 8.0, 4.0) AS score
                       FROM blocks b
                       JOIN blocks_raw r ON r.id = b.rowid
                       JOIN docs d ON d.key = r.key
                       WHERE blocks MATCH ?1
                       ORDER BY score
                       LIMIT ?2";
            let mut stmt = self.conn.prepare(sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![match_expr, (limit * 4) as i64], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, i64>(6)?,
                        r.get::<_, String>(7)?,
                        -r.get::<_, f64>(8)?,
                    ))
                })
                .map_err(|e| e.to_string())?;
            for row in rows.flatten() {
                if seen_ids.insert(row.0) {
                    rows_acc.push((
                        row.0,
                        row.1,
                        row.2,
                        row.3,
                        row.4,
                        row.5,
                        row.6 as usize,
                        row.7,
                        row.8,
                    ));
                }
            }
        }

        if !short_terms.is_empty() {
            for t in &short_terms {
                let pattern = format!("%{}%", escape_like(t));
                let sql = "SELECT r.id, r.key, d.doc_id, d.path, d.title, r.heading, r.line_start, r.body
                           FROM blocks_raw r
                           JOIN docs d ON d.key = r.key
                           WHERE r.body LIKE ?1 ESCAPE '\\' OR r.heading LIKE ?1 ESCAPE '\\' OR d.title LIKE ?1 ESCAPE '\\'
                           LIMIT ?2";
                let mut stmt = self.conn.prepare(sql).map_err(|e| e.to_string())?;
                let rows = stmt
                    .query_map(params![pattern, (limit * 4) as i64], |r| {
                        Ok((
                            r.get::<_, i64>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, String>(2)?,
                            r.get::<_, String>(3)?,
                            r.get::<_, String>(4)?,
                            r.get::<_, String>(5)?,
                            r.get::<_, i64>(6)?,
                            r.get::<_, String>(7)?,
                        ))
                    })
                    .map_err(|e| e.to_string())?;
                for row in rows.flatten() {
                    if seen_ids.insert(row.0) {
                        rows_acc.push((
                            row.0,
                            row.1,
                            row.2,
                            row.3,
                            row.4,
                            row.5,
                            row.6 as usize,
                            row.7,
                            0.5,
                        ));
                    }
                }
            }
        }

        // 同时兜底匹配文件名/标题（避免仅标题匹配而 body 块为空）
        let raw_q = query.trim();
        if !raw_q.is_empty() {
            let title_pattern = format!("%{}%", escape_like(raw_q));
            let sql = "SELECT r.id, r.key, d.doc_id, d.path, d.title, r.heading, r.line_start, r.body
                       FROM docs d
                       JOIN blocks_raw r ON r.key = d.key
                       WHERE d.title LIKE ?1 ESCAPE '\\' OR d.path LIKE ?1 ESCAPE '\\'
                       GROUP BY d.key
                       LIMIT ?2";
            if let Ok(mut stmt) = self.conn.prepare(sql) {
                if let Ok(rows) = stmt.query_map(params![title_pattern, limit as i64], |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, i64>(6)?,
                        r.get::<_, String>(7)?,
                    ))
                }) {
                    for row in rows.flatten() {
                        if seen_ids.insert(row.0) {
                            rows_acc.push((
                                row.0,
                                row.1,
                                row.2,
                                row.3,
                                row.4,
                                row.5,
                                row.6 as usize,
                                row.7,
                                6.0,
                            ));
                        }
                    }
                }
            }
        }

        rows_acc.sort_by(|a, b| {
            b.8.partial_cmp(&a.8)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| a.3.cmp(&b.3))
                .then_with(|| a.1.cmp(&b.1))
        });

        let mut seen_keys: HashSet<String> = HashSet::new();
        let mut out = Vec::new();
        for (_id, key, doc_id, path, title, heading, line_start, body, score) in rows_acc {
            if !seen_keys.insert(key.clone()) {
                continue;
            }
            let (parts, line) = make_snippet_parts(&body, line_start, &terms);
            out.push(GlobalSearchHit {
                key,
                doc_id,
                title,
                path,
                heading,
                line,
                parts,
                score,
            });
            if out.len() >= limit {
                break;
            }
        }
        Ok(out)
    }
}

pub fn default_db_path(app_data: &Path) -> PathBuf {
    app_data.join("index").join("search.db")
}
