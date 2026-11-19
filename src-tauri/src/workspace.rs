use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

const MAX_DOCUMENT: usize = 8 << 20;
const MAX_PICTURE: usize = 20 << 20;
const MAX_IMAGE_SIDE: u32 = 16000;
const INDEX_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Position {
    #[serde(default)]
    pub anchor: usize,
    #[serde(default)]
    pub head: usize,
    #[serde(default)]
    pub scroll: f64,
    #[serde(default)]
    pub source: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    #[serde(rename = "customTitle", default)]
    pub custom_title: bool,
    #[serde(
        rename = "generatedTitleSuffix",
        default,
        skip_serializing_if = "String::is_empty"
    )]
    pub generated_title_suffix: String,
    #[serde(default)]
    pub path: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub excerpt: String,
    #[serde(default)]
    pub status: String,
    #[serde(rename = "statusCode", default)]
    pub status_code: String,
    #[serde(default)]
    pub conflict: bool,
    #[serde(default)]
    pub modified: bool,
    #[serde(default)]
    pub updated: i64,
    #[serde(default)]
    pub revision: i64,
    #[serde(rename = "readOnly", default, skip_serializing_if = "is_false")]
    pub read_only: bool,
    #[serde(default)]
    pub position: Position,
    #[serde(
        rename = "imageAliases",
        default,
        skip_serializing_if = "HashMap::is_empty"
    )]
    pub image_aliases: HashMap<String, String>,
}

fn is_false(b: &bool) -> bool {
    !*b
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub id: String,
    pub title: String,
    pub path: String,
    pub updated: i64,
    #[serde(default)]
    pub excerpt: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub warning: String,
}

fn default_auto_space() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Appearance {
    pub theme: String,
    #[serde(default)]
    pub auto: String,
    #[serde(rename = "lightTheme", default)]
    pub light_theme: String,
    #[serde(rename = "darkTheme", default)]
    pub dark_theme: String,
    #[serde(rename = "followSystem", default)]
    pub follow_system: bool,
    #[serde(rename = "fontSize")]
    pub font_size: i32,
    #[serde(rename = "lineWidth")]
    pub line_width: String,
    pub layout: String,
    #[serde(default)]
    pub source: bool,
    #[serde(rename = "sidebarDocked", default)]
    pub sidebar_docked: bool,
    #[serde(rename = "outlineHidden", default)]
    pub outline_hidden: bool,
    #[serde(rename = "autoSpace", default = "default_auto_space")]
    pub auto_space: bool,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: "onelight".to_string(),
            auto: "system".to_string(),
            light_theme: "onelight".to_string(),
            dark_theme: "indigo".to_string(),
            follow_system: true,
            font_size: 18,
            line_width: "normal".to_string(),
            layout: "read".to_string(),
            source: false,
            sidebar_docked: false,
            outline_hidden: false,
            auto_space: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppearanceChange {
    pub theme: Option<String>,
    pub auto: Option<String>,
    #[serde(rename = "lightTheme")]
    pub light_theme: Option<String>,
    #[serde(rename = "darkTheme")]
    pub dark_theme: Option<String>,
    #[serde(rename = "fontSize")]
    pub font_size: Option<i32>,
    #[serde(rename = "lineWidth")]
    pub line_width: Option<String>,
    pub layout: Option<String>,
    pub source: Option<bool>,
    #[serde(rename = "sidebarDocked")]
    pub sidebar_docked: Option<bool>,
    #[serde(rename = "outlineHidden")]
    pub outline_hidden: Option<bool>,
    #[serde(rename = "autoSpace")]
    pub auto_space: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceState {
    pub current: Document,
    pub recent: Vec<Summary>,
    pub appearance: Appearance,
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notices: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edit {
    pub id: String,
    #[serde(default)]
    pub revision: i64,
    pub content: String,
    pub position: Position,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocStatus {
    pub id: String,
    pub revision: i64,
    pub conflict: bool,
    pub status: String,
    #[serde(rename = "statusCode", default, skip_serializing_if = "String::is_empty")]
    pub status_code: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRange {
    pub from: usize,
    pub to: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub from: usize,
    pub to: usize,
    pub line: usize,
    pub text: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchItem {
    pub id: String,
    pub title: String,
    pub path: String,
    pub updated: i64,
    pub revision: i64,
    #[serde(rename = "titleMatch")]
    pub title_match: Option<SearchRange>,
    pub hits: Vec<SearchHit>,
    #[serde(rename = "moreHits")]
    pub more_hits: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub items: Vec<SearchItem>,
    pub total: usize,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagSummary {
    pub name: String,
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentFilterItem {
    pub document: SearchItem,
    pub tags: Vec<String>,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentFilterResponse {
    pub items: Vec<DocumentFilterItem>,
    pub total: usize,
    pub truncated: bool,
    pub tags: Vec<TagSummary>,
    pub recent: Vec<Summary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageResult {
    pub destination: String,
    pub url: String,
    pub name: String,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Delivery {
    pub title: String,
    pub content: String,
    pub images: HashMap<String, String>,
    pub missing: Vec<String>,
    pub external: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderTreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub doc_id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<FolderTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountedFolder {
    pub path: String,
    pub name: String,
    pub nodes: Vec<FolderTreeNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderActionResponse {
    pub folders: Vec<MountedFolder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<WorkspaceState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceIndex {
    version: i32,
    current: String,
    #[serde(default)]
    locale: String,
    appearance: Appearance,
    #[serde(default)]
    folders: Vec<String>,
}

const VALID_THEMES: &[&str] = &[
    "onelight",
    "indigo",
];

const DARK_THEMES: &[&str] = &[
    "indigo",
];

fn valid_theme(s: &str) -> bool {
    VALID_THEMES.contains(&s)
}

fn dark_theme(s: &str) -> bool {
    DARK_THEMES.contains(&s)
}

fn valid_auto(s: &str) -> bool {
    matches!(s, "off" | "system" | "hours" | "seasons")
}

fn normalize_appearance(p: &mut Appearance) {
    if !valid_auto(&p.auto) {
        p.auto = if p.follow_system {
            "system".to_string()
        } else {
            "off".to_string()
        };
    }
    if !valid_theme(&p.theme) {
        p.theme = "onelight".to_string();
    }
    if !valid_theme(&p.light_theme) || dark_theme(&p.light_theme) {
        p.light_theme = "onelight".to_string();
    }
    if !dark_theme(&p.dark_theme) {
        p.dark_theme = "indigo".to_string();
    }
    if p.line_width == "comfortable" || p.line_width.is_empty() {
        p.line_width = "normal".to_string();
    }
    if p.layout == "edit" {
        p.layout = "single".to_string();
    } else if p.layout.is_empty() {
        p.layout = "read".to_string();
    }
    p.follow_system = p.auto == "system";
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn uid() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let pid = std::process::id() as u128;
    let hash = sha256_hex(format!("{}-{}-{}", nanos, pid, rand_counter()).as_bytes());
    hash[..16].to_string()
}

fn rand_counter() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(1);
    COUNTER.fetch_add(1, Ordering::Relaxed)
}

pub fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
    ];
    let bit_len = (data.len() as u64) * 8;
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }
    format!(
        "{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}{:08x}",
        h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]
    )
}

pub fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((n >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(n & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

pub fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0u32;
    for b in s.bytes() {
        if b == b'=' || b == b'\r' || b == b'\n' || b == b' ' {
            continue;
        }
        let val = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err("invalid base64".to_string()),
        };
        buf = (buf << 6) | (val as u32);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

fn clamp_pos(content: &str, pos: Position) -> Position {
    let max = utf16_len(content);
    Position {
        anchor: pos.anchor.min(max),
        head: pos.head.min(max),
        scroll: pos.scroll.max(0.0),
        source: pos.source,
    }
}

fn msg(_locale: &str, key: &str) -> String {
    match key {
        "bUntitled" => "未命名文稿",
        "bStatusDraftSaved" => "草稿已保存",
        "bStatusFileSaved" => "文件已保存",
        "bStatusFileReadOnly" => "文件为只读，修改保留在草稿中",
        "bStatusFileUnavailable" => "文件不可访问，草稿已保留",
        "bStatusDiskUnreadable" => "磁盘文件无法读取，草稿已保留",
        "bStatusDiskReloaded" => "已载入磁盘上的新版本",
        "bStatusReloadRecoveryFailed" => "已载入磁盘新版本，恢复记录更新失败",
        "bStatusDiskConflict" => "磁盘内容已变化，自动写入已暂停",
        "bStatusImageSaveFailed" => "草稿已保留，图片保存失败",
        "bStatusFileSaveFailed" => "草稿已保留，文件保存失败",
        "bStatusSaveFailed" => "保存失败，内容仍在编辑器",
        "bStatusRecoveryUpdateFailed" => "文件已保存，恢复记录更新失败",
        "bDocumentMissing" => "文稿不存在",
        "bDocumentChanged" => "文稿已变化，请重新载入，当前输入尚未保存",
        "bInvalidDocument" => "文稿超过 8 MB 或编码无效",
        "bDiskChanged" => "磁盘文件已变化",
        "bNameRequired" => "请输入名称",
        "bRenameExistingFile" => "已有文件请通过另存命名",
        "bCaptureInvalidTags" => "最多 32 个标签，每个不超过 80 个字，且不能包含换行。",
        "bSearchInvalidQuery" => "请输入有效的搜索文字。",
        "bSearchQueryTooLong" => "搜索文字最多 128 个字符。",
        "bSearchQueryLineBreak" => "请搜索单行内连续的文字。",
        "bFilterInvalidTag" => "请输入有效标签，最多 80 个字，且不能包含控制字符。",
        "bWikiInvalidName" => "引用名称无效，请使用单行标题，最多 256 个字，且不能包含控制字符、方括号或竖线。",
        "bWikiSourceChanged" => "来源文稿已更新，请重新点击引用。",
        "bWikiSourceMissing" => "来源文稿已移除。",
        "bUnknownTheme" => "未知主题",
        "bUnknownAutoSwitch" => "未知的自动切换方式",
        "bInvalidFontSize" => "字号应为 15 至 22",
        "bUnknownLineWidth" => "未知行宽",
        "bUnknownLayout" => "未知布局",
        "bImageTooLarge" => "图片超过 20 MB",
        "bUnsupportedImage" => "请选择 PNG、JPEG、GIF、WebP、SVG、AVIF 或 BMP 图片，最长边不超过 16000 像素",
        "bImageNotReferenced" => "图片未被文稿引用",
        "bRecoverySuffix" => " · 恢复副本",
        "bDiskVersionSuffix" => " · 磁盘版本",
        _ => key,
    }
    .to_string()
}

fn status_key_for_code(code: &str) -> &'static str {
    match code {
        "draftSaved" => "bStatusDraftSaved",
        "fileSaved" => "bStatusFileSaved",
        "fileReadOnly" => "bStatusFileReadOnly",
        "fileUnavailable" => "bStatusFileUnavailable",
        "diskUnreadable" => "bStatusDiskUnreadable",
        "diskReloaded" => "bStatusDiskReloaded",
        "reloadRecoveryFailed" => "bStatusReloadRecoveryFailed",
        "diskConflict" => "bStatusDiskConflict",
        "imageSaveFailed" => "bStatusImageSaveFailed",
        "fileSaveFailed" => "bStatusFileSaveFailed",
        "saveFailed" => "bStatusSaveFailed",
        "recoveryUpdateFailed" => "bStatusRecoveryUpdateFailed",
        _ => "",
    }
}

pub fn front_matter_end(s: &str) -> usize {
    let first_end = if s.starts_with("---\n") {
        4
    } else if s.starts_with("---\r\n") {
        5
    } else {
        return 0;
    };
    let rest = &s[first_end..];
    let mut offset = first_end;
    let mut lines = 0;
    let mut has_prop = false;
    for raw_line in rest.split_inclusive('\n') {
        lines += 1;
        offset += raw_line.len();
        if lines > 80 || offset > 8192 {
            return 0;
        }
        let line = raw_line.trim_end_matches(&['\r', '\n'][..]);
        let trimmed = line.trim();
        if trimmed == "---" || trimmed == "..." {
            return if has_prop { offset } else { 0 };
        }
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(colon) = line.find(':') {
            let key = line[..colon].trim();
            if !key.is_empty() && !key.contains(|c: char| c.is_whitespace()) {
                has_prop = true;
            }
        }
    }
    0
}

pub fn clean_inline(s: &str) -> String {
    let mut t = s.trim().to_string();
    for mark in ["**", "__", "~~", "`", "*", "_"] {
        t = t.replace(mark, "");
    }
    t.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn has_inferred_content_title(s: &str) -> bool {
    let body = &s[front_matter_end(s)..];
    for raw_line in body.lines() {
        let mut t = raw_line.trim();
        if t.is_empty()
            || t.starts_with("```")
            || t.starts_with("~~~")
            || t.chars().all(|c| c == '-' || c == '*' || c == '_')
        {
            continue;
        }
        t = t.trim_start_matches(&['#', '>', '-', '*', '+'][..]).trim();
        let cleaned = clean_inline(t);
        if !cleaned.is_empty() {
            return true;
        }
    }
    false
}

pub fn inferred_title(s: &str, locale: &str) -> String {
    let body = &s[front_matter_end(s)..];
    for raw_line in body.lines() {
        let mut t = raw_line.trim();
        if t.is_empty()
            || t.starts_with("```")
            || t.starts_with("~~~")
            || t.chars().all(|c| c == '-' || c == '*' || c == '_')
        {
            continue;
        }
        t = t.trim_start_matches(&['#', '>', '-', '*', '+'][..]).trim();
        let cleaned = clean_inline(t);
        if !cleaned.is_empty() {
            let chars: Vec<char> = cleaned.chars().collect();
            if chars.len() > 28 {
                return format!("{}…", chars[..28].iter().collect::<String>());
            }
            return cleaned;
        }
    }
    msg(locale, "bUntitled")
}

pub fn excerpt_of(s: &str) -> String {
    let body = &s[front_matter_end(s)..];
    let mut out: Vec<String> = Vec::new();
    for raw_line in body.lines() {
        let mut t = raw_line.trim();
        if t.is_empty() || t.starts_with("```") || t.starts_with("~~~") {
            continue;
        }
        for p in ["- [ ] ", "- [x] ", "- [X] ", "- ", "* ", "+ ", "> "] {
            t = t.strip_prefix(p).unwrap_or(t);
        }
        t = t.trim_start_matches('#').trim();
        let cleaned = clean_inline(t);
        if !cleaned.is_empty() {
            out.push(cleaned);
        }
        if out.join(" ").len() > 90 {
            break;
        }
    }
    let joined = out.join(" ");
    let chars: Vec<char> = joined.chars().collect();
    if chars.len() > 54 {
        format!("{}…", chars[..54].iter().collect::<String>())
    } else {
        joined
    }
}

pub fn extract_front_matter_tags(content: &str) -> Vec<String> {
    let end = front_matter_end(content);
    if end == 0 {
        return Vec::new();
    }
    let fm = &content[..end];
    let mut lines: Vec<&str> = fm.lines().collect();
    if lines.len() < 2 {
        return Vec::new();
    }
    lines = lines[1..lines.len() - 1].to_vec();
    let mut raw_tags: Vec<String> = Vec::new();
    let mut in_tags_seq = false;
    for line in lines {
        let trimmed = line.trim();
        if in_tags_seq {
            if let Some(item) = trimmed.strip_prefix('-') {
                let val = item.trim().trim_matches(&['"', '\''][..]).to_string();
                raw_tags.push(val);
                continue;
            } else if !trimmed.is_empty() && !trimmed.starts_with('#') {
                in_tags_seq = false;
            }
        }
        if let Some(rest) = trimmed.strip_prefix("tags:") {
            let val = rest.trim();
            if val.is_empty() {
                in_tags_seq = true;
            } else if val.starts_with('[') && val.ends_with(']') {
                let inner = &val[1..val.len() - 1];
                for part in inner.split(',') {
                    let item = part.trim().trim_matches(&['"', '\''][..]);
                    if !item.is_empty() {
                        raw_tags.push(item.to_string());
                    }
                }
            } else {
                let item = val.trim_matches(&['"', '\''][..]);
                if !item.is_empty() {
                    raw_tags.push(item.to_string());
                }
            }
        }
    }
    normalize_tags(&raw_tags).unwrap_or_default()
}

pub fn normalize_tags(tags: &[String]) -> Result<Vec<String>, String> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();
    for raw in tags {
        let tag = raw.trim().trim_start_matches('#').trim();
        if tag.is_empty() {
            continue;
        }
        if tag.chars().count() > 80 || tag.chars().any(|c| c.is_control()) {
            return Err("bCaptureInvalidTags".to_string());
        }
        if seen.insert(tag.to_string()) {
            result.push(tag.to_string());
        }
    }
    if result.len() > 32 {
        return Err("bCaptureInvalidTags".to_string());
    }
    Ok(result)
}

pub fn summary_of(d: &Document) -> Summary {
    Summary {
        id: d.id.clone(),
        title: d.title.clone(),
        path: d.path.clone(),
        updated: d.updated,
        excerpt: d.excerpt.clone(),
        tags: extract_front_matter_tags(&d.content),
        warning: if save_failed(&d.status_code) {
            d.status.clone()
        } else {
            String::new()
        },
    }
}

fn save_failed(code: &str) -> bool {
    matches!(
        code,
        "imageSaveFailed"
            | "fileSaveFailed"
            | "fileReadOnly"
            | "saveFailed"
            | "recoveryUpdateFailed"
            | "reloadRecoveryFailed"
    )
}

impl Document {
    pub fn generated_title(&self) -> bool {
        self.path.is_empty() && !self.custom_title && !has_inferred_content_title(&self.content)
    }

    pub fn set_status(&mut self, code: &str) {
        self.status_code = code.to_string();
        let key = status_key_for_code(code);
        if !key.is_empty() {
            self.status = msg("zh-Hans", key);
        }
    }

    pub fn localized(&self, locale: &str) -> Document {
        let mut d = self.clone();
        if !d.generated_title_suffix.is_empty() {
            let suffix_key = match d.generated_title_suffix.as_str() {
                "recovery" => "bRecoverySuffix",
                "diskVersion" => "bDiskVersionSuffix",
                _ => "",
            };
            if !suffix_key.is_empty() {
                let mut base = d.title.clone();
                for l in ["zh-Hans", "en"] {
                    let s = msg(l, suffix_key);
                    if let Some(stripped) = base.strip_suffix(&s) {
                        base = stripped.to_string();
                        break;
                    }
                }
                d.title = format!("{}{}", base, msg(locale, suffix_key));
            }
        } else if d.generated_title() {
            d.title = msg(locale, "bUntitled");
        }
        let key = status_key_for_code(&d.status_code);
        if !key.is_empty() {
            d.status = msg(locale, key);
        }
        d
    }
}

#[derive(Debug, Clone)]
pub struct WikiReference {
    pub target: String,
    pub from: usize,
    pub to: usize,
}

pub fn wiki_name(s: &str) -> Option<String> {
    let mut s = s.trim();
    if s.len() > 3 && s[s.len() - 3..].eq_ignore_ascii_case(".md") {
        s = s[..s.len() - 3].trim();
    }
    let name: String = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty()
        || name.chars().count() > 256
        || name.contains(&['[', ']', '|'][..])
        || name.chars().any(|c| c.is_control())
    {
        return None;
    }
    Some(name)
}

pub fn wiki_references(content: &str) -> Vec<WikiReference> {
    let mut refs = Vec::new();
    let end = front_matter_end(content);
    let mut in_fence = "";
    let mut offset = end;
    for line in content[end..].split_inclusive('\n') {
        let trimmed = line.trim_start_matches(' ');
        if line.len() - trimmed.len() <= 3
            && (trimmed.starts_with("```") || trimmed.starts_with("~~~"))
        {
            let ch = &trimmed[..1];
            if in_fence.is_empty() {
                in_fence = ch;
            } else if in_fence == ch {
                in_fence = "";
            }
            offset += line.len();
            continue;
        }
        if !in_fence.is_empty() || line.starts_with("    ") || line.starts_with('\t') {
            offset += line.len();
            continue;
        }
        let bytes = line.as_bytes();
        let mut tick = 0usize;
        let mut i = 0usize;
        while i < bytes.len() {
            if bytes[i] == b'\\' {
                i += 2;
                continue;
            }
            if bytes[i] == b'`' {
                let mut n = 1;
                while i + n < bytes.len() && bytes[i + n] == b'`' {
                    n += 1;
                }
                if tick == 0 {
                    tick = n;
                } else if tick == n {
                    tick = 0;
                }
                i += n;
                continue;
            }
            if tick > 0 {
                i += 1;
                continue;
            }
            if i + 3 < bytes.len()
                && bytes[i] == b'['
                && bytes[i + 1] == b'['
                && (i == 0 || bytes[i - 1] != b'!')
            {
                if let Some(rel_end) = line[i + 2..].find("]]") {
                    let end_idx = i + 2 + rel_end;
                    let raw = &line[i + 2..end_idx];
                    if !raw.contains(&['[', ']'][..]) {
                        let raw_target = raw.split('|').next().unwrap_or(raw);
                        if let Some(target) = wiki_name(raw_target) {
                            refs.push(WikiReference {
                                target,
                                from: offset + i,
                                to: offset + end_idx + 2,
                            });
                        }
                        i = end_idx + 2;
                        continue;
                    }
                }
            }
            i += 1;
        }
        offset += line.len();
    }
    refs
}

fn search_hits(content: &str, positions: &[(usize, usize)]) -> Vec<SearchHit> {
    if positions.is_empty() {
        return Vec::new();
    }
    let mut hits = Vec::with_capacity(positions.len());
    for &(from, to) in positions {
        let line_start = content[..from].rfind('\n').map(|i| i + 1).unwrap_or(0);
        let mut line_end = content[to..]
            .find('\n')
            .map(|i| to + i)
            .unwrap_or(content.len());
        if line_end > line_start && content.as_bytes()[line_end - 1] == b'\r' {
            line_end -= 1;
        }
        let line_no = 1 + content[..line_start].bytes().filter(|&b| b == b'\n').count();
        let before_full = &content[line_start..from];
        let match_full = &content[from..to.min(line_end)];
        let after_full = if to < line_end {
            &content[to..line_end]
        } else {
            ""
        };
        let before_chars: Vec<char> = before_full.chars().collect();
        let before = if before_chars.len() > 28 {
            format!("…{}", before_chars[before_chars.len() - 28..].iter().collect::<String>())
        } else {
            before_full.to_string()
        };
        let match_chars: Vec<char> = match_full.chars().collect();
        let text = if match_chars.len() > 80 {
            format!("{}…", match_chars[..80].iter().collect::<String>())
        } else {
            match_full.to_string()
        };
        let after_chars: Vec<char> = after_full.chars().collect();
        let after = if after_chars.len() > 52 {
            format!("{}…", after_chars[..52].iter().collect::<String>())
        } else {
            after_full.to_string()
        };
        hits.push(SearchHit {
            from: utf16_len(&content[..from]),
            to: utf16_len(&content[..to]),
            line: line_no,
            text,
            before,
            after,
        });
    }
    hits
}

fn find_matches_case_insensitive(text: &str, query: &str, limit: usize) -> Vec<(usize, usize)> {
    if query.is_empty() || limit == 0 {
        return Vec::new();
    }
    let q_lower = query.to_lowercase();
    let q_chars: Vec<char> = q_lower.chars().collect();
    if q_chars.is_empty() {
        return Vec::new();
    }
    let char_indices: Vec<(usize, char)> = text
        .char_indices()
        .map(|(i, c)| (i, c.to_lowercase().next().unwrap_or(c)))
        .collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i + q_chars.len() <= char_indices.len() {
        let mut matched = true;
        for j in 0..q_chars.len() {
            if char_indices[i + j].1 != q_chars[j] {
                matched = false;
                break;
            }
        }
        if matched {
            let start_byte = char_indices[i].0;
            let end_byte = if i + q_chars.len() < char_indices.len() {
                char_indices[i + q_chars.len()].0
            } else {
                text.len()
            };
            out.push((start_byte, end_byte));
            if out.len() == limit {
                break;
            }
            i += q_chars.len();
        } else {
            i += 1;
        }
    }
    out
}

#[derive(Debug, Clone)]
struct ImageInfo {
    mime: &'static str,
    format: &'static str,
}

fn sniff_image(b: &[u8]) -> Result<ImageInfo, String> {
    if b.len() > MAX_PICTURE {
        return Err("bImageTooLarge".to_string());
    }
    if b.len() >= 24 && &b[..8] == b"\x89PNG\r\n\x1a\n" && &b[12..16] == b"IHDR" {
        let w = u32::from_be_bytes([b[16], b[17], b[18], b[19]]);
        let h = u32::from_be_bytes([b[20], b[21], b[22], b[23]]);
        if w == 0 || h == 0 || w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE {
            return Err("bUnsupportedImage".to_string());
        }
        return Ok(ImageInfo {
            mime: "image/png",
            format: "png",
        });
    }
    if b.len() >= 4 && b[0] == 0xff && b[1] == 0xd8 {
        return Ok(ImageInfo {
            mime: "image/jpeg",
            format: "jpg",
        });
    }
    if b.len() >= 10 && (&b[..6] == b"GIF87a" || &b[..6] == b"GIF89a") {
        return Ok(ImageInfo {
            mime: "image/gif",
            format: "gif",
        });
    }
    if b.len() >= 16 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        return Ok(ImageInfo {
            mime: "image/webp",
            format: "webp",
        });
    }
    if b.len() >= 26 && &b[..2] == b"BM" {
        return Ok(ImageInfo {
            mime: "image/bmp",
            format: "bmp",
        });
    }
    if let Ok(s) = std::str::from_utf8(b) {
        let trimmed = s.trim_start();
        if trimmed.starts_with("<svg") || (trimmed.starts_with("<?xml") && trimmed.contains("<svg")) {
            return Ok(ImageInfo {
                mime: "image/svg+xml",
                format: "svg",
            });
        }
    }
    Err("bUnsupportedImage".to_string())
}

pub struct Workspace {
    pub root: PathBuf,
    pub docs: HashMap<String, Document>,
    pub current: String,
    pub locale_preference: String,
    pub appearance: Appearance,
    pub positions: HashMap<String, Position>,
    pub folders: Vec<String>,
    search_index: Option<crate::search::SearchIndex>,
}

impl Workspace {
    pub fn open_workspace(root: PathBuf) -> Result<Self, String> {
        for sub in ["drafts", "trash", "assets", "quarantine"] {
            fs::create_dir_all(root.join(sub)).map_err(|e| e.to_string())?;
        }
        let search_index = crate::search::SearchIndex::open(&crate::search::default_db_path(&root)).ok();
        let mut ws = Self {
            root: root.clone(),
            docs: HashMap::new(),
            current: String::new(),
            locale_preference: String::new(),
            appearance: Appearance::default(),
            positions: HashMap::new(),
            folders: Vec::new(),
            search_index,
        };
        if let Ok(pos_bytes) = fs::read(root.join("positions.json")) {
            if let Ok(pos_map) = serde_json::from_slice::<HashMap<String, Position>>(&pos_bytes) {
                ws.positions = pos_map;
            }
        }
        if let Ok(entries) = fs::read_dir(root.join("drafts")) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) != Some("json") {
                    continue;
                }
                if let Ok(bytes) = fs::read(&path) {
                    if let Ok(mut doc) = serde_json::from_slice::<Document>(&bytes) {
                        if !doc.id.is_empty() && doc.content.len() <= MAX_DOCUMENT {
                            if doc.status_code.is_empty() {
                                doc.set_status(if doc.path.is_empty() {
                                    "draftSaved"
                                } else {
                                    "fileSaved"
                                });
                            }
                            if doc.title.is_empty() {
                                doc.title = inferred_title(&doc.content, "zh-Hans");
                            }
                            doc.excerpt = excerpt_of(&doc.content);
                            ws.docs.insert(doc.id.clone(), doc);
                        }
                    }
                }
            }
        }
        if let Ok(idx_bytes) = fs::read(root.join("workspace.json")) {
            if let Ok(idx) = serde_json::from_slice::<WorkspaceIndex>(&idx_bytes) {
                ws.current = idx.current;
                ws.locale_preference = idx.locale;
                ws.appearance = idx.appearance;
                normalize_appearance(&mut ws.appearance);
                for f in idx.folders {
                    let norm = normalize_fs_path(Path::new(&f));
                    if !norm.is_empty() && !ws.folders.iter().any(|x| x.eq_ignore_ascii_case(&norm)) {
                        ws.folders.push(norm);
                    }
                }
            }
        }
        if ws.docs.is_empty() {
            let d = ws.create_draft()?;
            ws.current = d.id;
            ws.save_index()?;
        } else if !ws.docs.contains_key(&ws.current) {
            ws.current = ws.recent_summaries()[0].id.clone();
            ws.save_index()?;
        }
        Ok(ws)
    }

    fn create_draft(&mut self) -> Result<Document, String> {
        let mut d = Document {
            id: uid(),
            title: msg("zh-Hans", "bUntitled"),
            custom_title: false,
            generated_title_suffix: String::new(),
            path: String::new(),
            content: String::new(),
            excerpt: String::new(),
            status: String::new(),
            status_code: String::new(),
            conflict: false,
            modified: false,
            updated: now_millis(),
            revision: 0,
            read_only: false,
            position: Position::default(),
            image_aliases: HashMap::new(),
        };
        d.set_status("draftSaved");
        self.persist_doc(&d)?;
        self.docs.insert(d.id.clone(), d.clone());
        Ok(d)
    }

    fn persist_doc(&self, d: &Document) -> Result<(), String> {
        let mut copy = d.clone();
        copy.excerpt = excerpt_of(&copy.content);
        if copy.path.is_empty() && !copy.custom_title {
            copy.title = inferred_title(&copy.content, "zh-Hans");
        }
        let b = serde_json::to_vec_pretty(&copy).map_err(|e| e.to_string())?;
        fs::write(self.root.join("drafts").join(format!("{}.json", copy.id)), b)
            .map_err(|e| e.to_string())
    }

    fn save_index(&self) -> Result<(), String> {
        let idx = WorkspaceIndex {
            version: INDEX_VERSION,
            current: self.current.clone(),
            locale: self.locale_preference.clone(),
            appearance: self.appearance.clone(),
            folders: self.folders.clone(),
        };
        let b = serde_json::to_vec_pretty(&idx).map_err(|e| e.to_string())?;
        fs::write(self.root.join("workspace.json"), b).map_err(|e| e.to_string())
    }

    fn save_positions(&self) -> Result<(), String> {
        let b = serde_json::to_vec_pretty(&self.positions).map_err(|e| e.to_string())?;
        fs::write(self.root.join("positions.json"), b).map_err(|e| e.to_string())
    }

    fn recent_summaries(&self) -> Vec<Summary> {
        let mut list: Vec<Summary> = self.docs.values().map(summary_of).collect();
        list.sort_by(|a, b| b.updated.cmp(&a.updated).then_with(|| a.id.cmp(&b.id)));
        list
    }

    pub fn state(&mut self, locale: &str) -> WorkspaceState {
        let current_doc = self
            .docs
            .get(&self.current)
            .cloned()
            .unwrap_or_else(|| self.create_draft().unwrap());
        let mut recent = self.recent_summaries();
        for item in &mut recent {
            if let Some(doc) = self.docs.get(&item.id) {
                let loc_doc = doc.localized(locale);
                item.title = loc_doc.title;
                if !item.warning.is_empty() {
                    item.warning = loc_doc.status;
                }
            }
        }
        WorkspaceState {
            current: current_doc.localized(locale),
            recent,
            appearance: self.appearance.clone(),
            folders: self.folders.clone(),
            notices: Vec::new(),
        }
    }

    pub fn update(&mut self, edit: Edit, locale: &str) -> Result<Document, String> {
        let d = self
            .docs
            .get_mut(&edit.id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        if edit.revision >= 0 && edit.revision != d.revision && !edit.force {
            return Err(msg(locale, "bDocumentChanged"));
        }
        if edit.content.len() > MAX_DOCUMENT {
            return Err(msg(locale, "bInvalidDocument"));
        }
        let changed = d.content != edit.content;
        d.content = edit.content;
        d.position = clamp_pos(&d.content, edit.position);
        d.excerpt = excerpt_of(&d.content);
        if changed || edit.force {
            d.updated = now_millis();
            d.revision += 1;
        }
        if d.path.is_empty() {
            if !d.custom_title {
                d.title = inferred_title(&d.content, "zh-Hans");
            }
            d.modified = false;
            d.set_status("draftSaved");
        } else if fs::write(&d.path, d.content.as_bytes()).is_err() {
            d.modified = true;
            d.set_status("fileSaveFailed");
        } else {
            d.modified = false;
            d.set_status("fileSaved");
        }
        let cloned = d.clone();
        if !cloned.path.is_empty() {
            self.positions
                .insert(cloned.path.clone(), cloned.position.clone());
            let _ = self.save_positions();
        }
        self.persist_doc(&cloned)?;
        Ok(cloned.localized(locale))
    }

    pub fn save_position(
        &mut self,
        id: &str,
        revision: i64,
        pos: Position,
        locale: &str,
    ) -> Result<(), String> {
        let d = self
            .docs
            .get_mut(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        if revision >= 0 && revision != d.revision {
            return Ok(());
        }
        let next = clamp_pos(&d.content, pos);
        if d.position.anchor == next.anchor
            && d.position.head == next.head
            && d.position.source == next.source
            && (d.position.scroll - next.scroll).abs() < 0.01
        {
            return Ok(());
        }
        d.position = next.clone();
        let path = d.path.clone();
        let cloned = d.clone();
        if !path.is_empty() {
            self.positions.insert(path, next);
            let _ = self.save_positions();
        }
        self.persist_doc(&cloned)
    }

    pub fn new_doc(&mut self, locale: &str) -> Result<WorkspaceState, String> {
        let d = self.create_draft()?;
        self.current = d.id;
        self.save_index()?;
        Ok(self.state(locale))
    }

    pub fn activate(&mut self, id: &str, locale: &str) -> Result<WorkspaceState, String> {
        if !self.docs.contains_key(id) {
            return Err(msg(locale, "bDocumentMissing"));
        }
        self.current = id.to_string();
        self.save_index()?;
        Ok(self.state(locale))
    }

    pub fn activate_search(
        &mut self,
        id: &str,
        revision: i64,
        locale: &str,
    ) -> Result<WorkspaceState, String> {
        let d = self
            .docs
            .get(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        if revision >= 0 && d.revision != revision {
            return Err(msg(locale, "bDocumentChanged"));
        }
        self.current = id.to_string();
        self.save_index()?;
        Ok(self.state(locale))
    }

    pub fn open_file_path(&mut self, file_path: &Path, locale: &str) -> Result<WorkspaceState, String> {
        let canonical = fs::canonicalize(file_path).unwrap_or_else(|_| file_path.to_path_buf());
        let raw_str = canonical.to_string_lossy();
        let norm_path = raw_str
            .strip_prefix(r"\\?\")
            .unwrap_or(&raw_str)
            .to_string();
        let disk_path = PathBuf::from(&norm_path);
        if !disk_path.is_file() {
            return Err(msg(locale, "bDocumentMissing"));
        }
        let content = fs::read_to_string(&disk_path).map_err(|_| msg(locale, "bInvalidDocument"))?;
        if content.len() > MAX_DOCUMENT {
            return Err(msg(locale, "bInvalidDocument"));
        }
        let read_only = fs::metadata(&disk_path)
            .map(|m| m.permissions().readonly())
            .unwrap_or(false);
        let file_title = disk_path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| msg(locale, "bUntitled"));
        let existing_id = self
            .docs
            .iter()
            .find(|(_, d)| !d.path.is_empty() && d.path.eq_ignore_ascii_case(&norm_path))
            .map(|(id, _)| id.clone());
        let target_id = if let Some(id) = existing_id {
            if let Some(d) = self.docs.get_mut(&id) {
                if d.content != content {
                    d.content = content;
                    d.revision += 1;
                }
                d.excerpt = excerpt_of(&d.content);
                d.title = file_title;
                d.custom_title = true;
                d.read_only = read_only;
                d.modified = false;
                d.updated = now_millis();
                d.set_status(if read_only { "fileReadOnly" } else { "fileSaved" });
                let cloned = d.clone();
                self.persist_doc(&cloned)?;
            }
            id
        } else {
            let pos = self
                .positions
                .get(&norm_path)
                .cloned()
                .map(|p| clamp_pos(&content, p))
                .unwrap_or_default();
            let mut d = Document {
                id: uid(),
                title: file_title,
                custom_title: true,
                generated_title_suffix: String::new(),
                path: norm_path,
                excerpt: excerpt_of(&content),
                content,
                status: String::new(),
                status_code: String::new(),
                conflict: false,
                modified: false,
                updated: now_millis(),
                revision: 1,
                read_only,
                position: pos,
                image_aliases: HashMap::new(),
            };
            d.set_status(if read_only { "fileReadOnly" } else { "fileSaved" });
            self.persist_doc(&d)?;
            let id = d.id.clone();
            self.docs.insert(id.clone(), d);
            id
        };
        self.current = target_id;
        self.save_index()?;
        Ok(self.state(locale))
    }

    pub fn delete_doc(&mut self, id: &str, locale: &str) -> Result<WorkspaceState, String> {
        let d = self
            .docs
            .remove(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        let draft_path = self.root.join("drafts").join(format!("{}.json", id));
        if d.path.is_empty() && !d.content.trim().is_empty() {
            let _ = fs::rename(
                &draft_path,
                self.root
                    .join("trash")
                    .join(format!("{}-{}.json", now_millis(), id)),
            );
        } else {
            let _ = fs::remove_file(&draft_path);
        }
        if self.docs.is_empty() {
            let nd = self.create_draft()?;
            self.current = nd.id;
        } else if self.current == id {
            self.current = self.recent_summaries()[0].id.clone();
        }
        self.save_index()?;
        Ok(self.state(locale))
    }

    pub fn status(&self, id: &str, locale: &str) -> Result<DocStatus, String> {
        let d = self
            .docs
            .get(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?
            .localized(locale);
        Ok(DocStatus {
            id: d.id,
            revision: d.revision,
            conflict: d.conflict,
            status: d.status,
            status_code: d.status_code,
        })
    }

    pub fn rename(&mut self, id: &str, title: &str, locale: &str) -> Result<WorkspaceState, String> {
        let d = self
            .docs
            .get_mut(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        if !d.path.is_empty() {
            return Err(msg(locale, "bRenameExistingFile"));
        }
        let cleaned = clean_inline(title);
        if cleaned.is_empty() {
            return Err(msg(locale, "bNameRequired"));
        }
        let chars: Vec<char> = cleaned.chars().collect();
        d.title = if chars.len() > 60 {
            chars[..60].iter().collect()
        } else {
            cleaned
        };
        d.custom_title = true;
        d.generated_title_suffix.clear();
        d.updated = now_millis();
        d.revision += 1;
        let cloned = d.clone();
        self.persist_doc(&cloned)?;
        Ok(self.state(locale))
    }

    pub fn update_appearance(
        &mut self,
        change: AppearanceChange,
        locale: &str,
    ) -> Result<Appearance, String> {
        let mut p = self.appearance.clone();
        if let Some(v) = change.theme {
            p.theme = v;
        }
        if let Some(v) = change.auto {
            p.auto = v;
        }
        if let Some(v) = change.light_theme {
            p.light_theme = v;
        }
        if let Some(v) = change.dark_theme {
            p.dark_theme = v;
        }
        if let Some(v) = change.font_size {
            p.font_size = v;
        }
        if let Some(v) = change.line_width {
            p.line_width = v;
        }
        if let Some(v) = change.layout {
            p.layout = v;
        }
        if let Some(v) = change.source {
            p.source = v;
        }
        if let Some(v) = change.sidebar_docked {
            p.sidebar_docked = v;
        }
        if let Some(v) = change.outline_hidden {
            p.outline_hidden = v;
        }
        if let Some(v) = change.auto_space {
            p.auto_space = v;
        }
        normalize_appearance(&mut p);
        if !valid_theme(&p.theme) {
            return Err(msg(locale, "bUnknownTheme"));
        }
        if !valid_auto(&p.auto) {
            return Err(msg(locale, "bUnknownAutoSwitch"));
        }
        if p.font_size < 15 || p.font_size > 22 {
            return Err(msg(locale, "bInvalidFontSize"));
        }
        if !matches!(p.line_width.as_str(), "normal" | "wide" | "full") {
            return Err(msg(locale, "bUnknownLineWidth"));
        }
        if !matches!(p.layout.as_str(), "single" | "split" | "read") {
            return Err(msg(locale, "bUnknownLayout"));
        }
        self.appearance = p.clone();
        self.save_index()?;
        Ok(p)
    }

    fn search_docs(docs: &mut [Document], q: &str, locale: &str) -> SearchResponse {
        #[derive(Clone)]
        struct Candidate {
            item: SearchItem,
            has_title: bool,
            updated: i64,
        }
        let mut matches = Vec::new();
        for raw_doc in docs.iter() {
            let doc = raw_doc.localized(locale);
            let title_match = if q.is_empty() {
                None
            } else {
                find_matches_case_insensitive(&doc.title, q, 1)
                    .into_iter()
                    .next()
                    .map(|(f, t)| SearchRange {
                        from: utf16_len(&doc.title[..f]),
                        to: utf16_len(&doc.title[..t]),
                    })
            };
            let positions = if q.is_empty() {
                Vec::new()
            } else {
                find_matches_case_insensitive(&doc.content, q, 4)
            };
            if !q.is_empty() && title_match.is_none() && positions.is_empty() {
                continue;
            }
            let hit_slice = &positions[..positions.len().min(3)];
            let has_title = title_match.is_some();
            matches.push(Candidate {
                item: SearchItem {
                    id: doc.id.clone(),
                    title: doc.title.clone(),
                    path: doc.path.clone(),
                    updated: doc.updated,
                    revision: doc.revision,
                    title_match,
                    hits: search_hits(&doc.content, hit_slice),
                    more_hits: positions.len() > 3,
                },
                has_title,
                updated: doc.updated,
            });
        }
        matches.sort_by(|a, b| {
            b.has_title
                .cmp(&a.has_title)
                .then_with(|| b.updated.cmp(&a.updated))
                .then_with(|| a.item.id.cmp(&b.item.id))
        });
        let total = matches.len();
        let truncated = total > 100;
        let items = matches.into_iter().take(100).map(|c| c.item).collect();
        SearchResponse {
            items,
            total,
            truncated,
        }
    }

    pub fn filter_documents(
        &self,
        query: &str,
        tag: &str,
        locale: &str,
    ) -> Result<DocumentFilterResponse, String> {
        let q = query.trim();
        if q.contains('\n') || q.contains('\r') {
            return Err(msg(locale, "bSearchQueryLineBreak"));
        }
        if q.chars().any(|c| c.is_control()) {
            return Err(msg(locale, "bSearchInvalidQuery"));
        }
        if q.chars().count() > 128 {
            return Err(msg(locale, "bSearchQueryTooLong"));
        }
        let t = tag.trim();
        if t.chars().count() > 80 || t.chars().any(|c| c.is_control()) {
            return Err(msg(locale, "bFilterInvalidTag"));
        }
        let mut docs: Vec<Document> = self.docs.values().cloned().collect();
        let mut tags_by_id: HashMap<String, Vec<String>> = HashMap::new();
        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut selected: Vec<Document> = Vec::new();
        for doc in &docs {
            let doc_tags = summary_of(doc).tags;
            for name in &doc_tags {
                *counts.entry(name.clone()).or_insert(0) += 1;
            }
            if t.is_empty() || doc_tags.iter().any(|x| x == t) {
                selected.push(doc.clone());
            }
            tags_by_id.insert(doc.id.clone(), doc_tags);
        }
        let tag_summaries: Vec<TagSummary> = counts
            .into_iter()
            .map(|(name, count)| TagSummary { name, count })
            .collect();
        if q.is_empty() && t.is_empty() {
            docs.sort_by(|a, b| b.updated.cmp(&a.updated).then_with(|| a.id.cmp(&b.id)));
            let recent = docs
                .into_iter()
                .map(|doc| {
                    let loc = doc.localized(locale);
                    let id = loc.id.clone();
                    Summary {
                        id: id.clone(),
                        title: loc.title,
                        path: loc.path,
                        updated: loc.updated,
                        excerpt: if loc.excerpt.is_empty() {
                            excerpt_of(&loc.content)
                        } else {
                            loc.excerpt
                        },
                        tags: tags_by_id.remove(&id).unwrap_or_default(),
                        warning: String::new(),
                    }
                })
                .collect();
            return Ok(DocumentFilterResponse {
                items: Vec::new(),
                total: 0,
                truncated: false,
                tags: tag_summaries,
                recent,
            });
        }
        let found = Self::search_docs(&mut selected, q, locale);
        let by_id: HashMap<String, Document> = selected
            .into_iter()
            .map(|d| (d.id.clone(), d))
            .collect();
        let items = found
            .items
            .into_iter()
            .map(|item| {
                let id = item.id.clone();
                let excerpt = if q.is_empty() {
                    by_id
                        .get(&id)
                        .map(|d| {
                            if d.excerpt.is_empty() {
                                excerpt_of(&d.content)
                            } else {
                                d.excerpt.clone()
                            }
                        })
                        .unwrap_or_default()
                } else {
                    String::new()
                };
                DocumentFilterItem {
                    document: item,
                    tags: tags_by_id.get(&id).cloned().unwrap_or_default(),
                    excerpt,
                }
            })
            .collect();
        Ok(DocumentFilterResponse {
            items,
            total: found.total,
            truncated: found.truncated,
            tags: tag_summaries,
            recent: Vec::new(),
        })
    }

    fn wiki_title(d: &Document) -> Option<String> {
        let title = wiki_name(&d.title)?;
        if title != d.title || (d.generated_title_suffix.is_empty() && d.generated_title()) {
            return None;
        }
        Some(d.title.clone())
    }

    pub fn resolve_wiki_link(
        &self,
        source_id: &str,
        revision: i64,
        target: &str,
        locale: &str,
    ) -> Result<SearchResponse, String> {
        let source = self
            .docs
            .get(source_id)
            .ok_or_else(|| msg(locale, "bWikiSourceMissing"))?;
        if source.revision != revision {
            return Err(msg(locale, "bWikiSourceChanged"));
        }
        let target_name = wiki_name(target).ok_or_else(|| msg(locale, "bWikiInvalidName"))?;
        let present = wiki_references(&source.content)
            .iter()
            .any(|r| r.target == target_name);
        if !present {
            return Err(msg(locale, "bWikiSourceChanged"));
        }
        let mut candidates: Vec<Document> = self
            .docs
            .values()
            .filter(|d| Self::wiki_title(d).as_deref() == Some(target_name.as_str()))
            .cloned()
            .collect();
        candidates.sort_by(|a, b| b.updated.cmp(&a.updated).then_with(|| a.id.cmp(&b.id)));
        let total = candidates.len();
        let truncated = total > 100;
        let items = candidates
            .into_iter()
            .take(100)
            .map(|d| {
                let loc = d.localized(locale);
                SearchItem {
                    id: loc.id,
                    title: loc.title,
                    path: loc.path,
                    updated: loc.updated,
                    revision: loc.revision,
                    title_match: None,
                    hits: Vec::new(),
                    more_hits: false,
                }
            })
            .collect();
        Ok(SearchResponse {
            items,
            total,
            truncated,
        })
    }

    pub fn import_image(
        &mut self,
        id: &str,
        encoded: &str,
        locale: &str,
    ) -> Result<ImageResult, String> {
        let doc_path = self
            .docs
            .get(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?
            .path
            .clone();
        if encoded.len() > MAX_PICTURE * 4 / 3 + 8 {
            return Err(msg(locale, "bImageTooLarge"));
        }
        let b = base64_decode(encoded).map_err(|_| msg(locale, "bUnsupportedImage"))?;
        let info = sniff_image(&b).map_err(|k| msg(locale, &k))?;
        let name = format!("{}.{}", &sha256_hex(&b)[..24], info.format);
        let data_url = format!("data:{};base64,{}", info.mime, base64_encode(&b));

        if !doc_path.is_empty() {
            if let Some(parent) = Path::new(&doc_path).parent() {
                let rel_dir = parent.join("assets");
                if fs::create_dir_all(&rel_dir).is_ok() && fs::write(rel_dir.join(&name), &b).is_ok()
                {
                    let dest = format!("assets/{}", name);
                    return Ok(ImageResult {
                        destination: dest.clone(),
                        url: data_url,
                        name,
                        markdown: dest,
                    });
                }
            }
        }

        let dir = self.root.join("assets").join(id);
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        fs::write(dir.join(&name), &b).map_err(|e| e.to_string())?;
        let dest = format!("readsoul-asset:{}", name);
        Ok(ImageResult {
            destination: dest.clone(),
            url: data_url,
            name,
            markdown: dest,
        })
    }

    pub fn read_image(
        &self,
        id: &str,
        dest: &str,
        locale: &str,
    ) -> Result<ImageResult, String> {
        let d = self
            .docs
            .get(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        let path = resolve_doc_image_path(&self.root, d, dest)
            .ok_or_else(|| msg(locale, "bImageNotReferenced"))?;
        let b = fs::read(&path).map_err(|_| msg(locale, "bImageNotReferenced"))?;
        let info = sniff_image(&b).map_err(|k| msg(locale, &k))?;
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("image")
            .to_string();
        Ok(ImageResult {
            destination: dest.to_string(),
            url: format!("data:{};base64,{}", info.mime, base64_encode(&b)),
            name,
            markdown: dest.to_string(),
        })
    }

    pub fn delivery(&self, id: &str, locale: &str) -> Result<Delivery, String> {
        let d = self
            .docs
            .get(id)
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        let mut images = HashMap::new();
        let asset_dir = self.root.join("assets").join(id);
        if let Ok(entries) = fs::read_dir(&asset_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                if let (Some(name), Ok(bytes)) =
                    (p.file_name().and_then(|s| s.to_str()), fs::read(&p))
                {
                    if let Ok(info) = sniff_image(&bytes) {
                        let data_url =
                            format!("data:{};base64,{}", info.mime, base64_encode(&bytes));
                        images.insert(format!("readsoul-asset:{}", name), data_url);
                    }
                }
            }
        }

        let mut missing = Vec::new();
        let mut missing_set = HashSet::new();
        let mut external = 0usize;
        for raw_ref in extract_image_refs(&d.content) {
            let trimmed = raw_ref.trim();
            if trimmed.is_empty()
                || trimmed.starts_with("data:")
                || trimmed.starts_with("blob:")
            {
                continue;
            }
            if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                external += 1;
                continue;
            }
            if trimmed.starts_with("readsoul-asset:") {
                if !images.contains_key(trimmed) && missing_set.insert(trimmed.to_string()) {
                    missing.push(trimmed.to_string());
                }
                continue;
            }
            if images.contains_key(trimmed) {
                continue;
            }
            let loaded = resolve_doc_image_path(&self.root, d, trimmed)
                .and_then(|p| fs::read(&p).ok())
                .and_then(|bytes| {
                    sniff_image(&bytes)
                        .ok()
                        .map(|info| format!("data:{};base64,{}", info.mime, base64_encode(&bytes)))
                });
            if let Some(data_url) = loaded {
                images.insert(trimmed.to_string(), data_url);
            } else if missing_set.insert(trimmed.to_string()) {
                missing.push(trimmed.to_string());
            }
        }

        Ok(Delivery {
            title: d.title.clone(),
            content: d.content.clone(),
            images,
            missing,
            external,
        })
    }

    fn is_within_mounted(&self, target: &Path) -> bool {
        let probe = fs::canonicalize(target).unwrap_or_else(|_| {
            target
                .parent()
                .and_then(|p| fs::canonicalize(p).ok())
                .map(|p| {
                    if let Some(name) = target.file_name() {
                        p.join(name)
                    } else {
                        p
                    }
                })
                .unwrap_or_else(|| target.to_path_buf())
        });
        let probe_norm = normalize_fs_path(&probe).to_lowercase();
        for root_str in &self.folders {
            let canon_root =
                fs::canonicalize(root_str).unwrap_or_else(|_| PathBuf::from(root_str));
            let root_norm = normalize_fs_path(&canon_root).to_lowercase();
            let prefix = format!("{}{}", root_norm.trim_end_matches(&['\\', '/'][..]), std::path::MAIN_SEPARATOR);
            if probe_norm == root_norm.trim_end_matches(&['\\', '/'][..]) || probe_norm.starts_with(&prefix) {
                return true;
            }
        }
        false
    }

    fn doc_id_by_path_map(&self) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for d in self.docs.values() {
            if !d.path.is_empty() {
                map.insert(d.path.to_lowercase(), d.id.clone());
            }
        }
        map
    }

    pub fn scan_mounted_folders(&self) -> Vec<MountedFolder> {
        let doc_map = self.doc_id_by_path_map();
        let mut out = Vec::new();
        for f in &self.folders {
            let root_path = Path::new(f);
            let name = root_path
                .file_name()
                .and_then(|s| s.to_str())
                .filter(|s| !s.is_empty())
                .unwrap_or(f)
                .to_string();
            let mut count = 0usize;
            let nodes = if root_path.is_dir() {
                scan_folder_dir(root_path, 0, &mut count, &doc_map)
            } else {
                Vec::new()
            };
            out.push(MountedFolder {
                path: f.clone(),
                name,
                nodes,
            });
        }
        out
    }

    pub fn add_folder(&mut self, raw: &str, locale: &str) -> Result<Vec<MountedFolder>, String> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(msg(locale, "bDocumentMissing"));
        }
        let p = Path::new(trimmed);
        if !p.is_dir() {
            return Err(msg(locale, "bDocumentMissing"));
        }
        let canon = fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf());
        let norm = normalize_fs_path(&canon);
        if !self.folders.iter().any(|x| x.eq_ignore_ascii_case(&norm)) {
            self.folders.push(norm);
            self.save_index()?;
        }
        Ok(self.scan_mounted_folders())
    }

    pub fn remove_folder(&mut self, raw: &str) -> Result<Vec<MountedFolder>, String> {
        let target = normalize_fs_path(Path::new(raw.trim()));
        self.folders
            .retain(|x| !x.eq_ignore_ascii_case(&target));
        self.save_index()?;
        Ok(self.scan_mounted_folders())
    }

    pub fn create_in_folder(
        &mut self,
        parent_dir: &str,
        raw_name: &str,
        kind: &str,
        locale: &str,
    ) -> Result<FolderActionResponse, String> {
        let name = raw_name.trim();
        if !valid_fs_item_name(name) {
            return Err(msg(locale, "bInvalidDocument"));
        }
        let parent = Path::new(parent_dir);
        if !parent.is_dir() || !self.is_within_mounted(parent) {
            return Err(msg(locale, "bDocumentMissing"));
        }
        if kind == "dir" {
            let target = parent.join(name);
            if target.exists() {
                return Err(msg(locale, "bDocumentChanged"));
            }
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            return Ok(FolderActionResponse {
                folders: self.scan_mounted_folders(),
                state: None,
            });
        }

        let file_name = if name.ends_with(".md")
            || name.ends_with(".markdown")
            || name.ends_with(".txt")
        {
            name.to_string()
        } else {
            format!("{}.md", name)
        };
        let target = parent.join(&file_name);
        if target.exists() {
            return Err(msg(locale, "bDocumentChanged"));
        }
        let stem = Path::new(&file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled");
        let initial = format!("# {}\n\n", stem);
        fs::write(&target, initial.as_bytes()).map_err(|e| e.to_string())?;
        let state = self.open_file_path(&target, locale)?;
        Ok(FolderActionResponse {
            folders: self.scan_mounted_folders(),
            state: Some(state),
        })
    }

    pub fn rename_fs_item(
        &mut self,
        old_path_str: &str,
        raw_new_name: &str,
        locale: &str,
    ) -> Result<FolderActionResponse, String> {
        let new_name = raw_new_name.trim();
        if !valid_fs_item_name(new_name) {
            return Err(msg(locale, "bInvalidDocument"));
        }
        let old_path = Path::new(old_path_str);
        if !old_path.exists() || !self.is_within_mounted(old_path) {
            return Err(msg(locale, "bDocumentMissing"));
        }
        let is_file = old_path.is_file();
        let final_name = if is_file
            && !new_name.contains('.')
            && old_path
                .extension()
                .and_then(|s| s.to_str())
                .map(|ext| !ext.is_empty())
                .unwrap_or(false)
        {
            format!(
                "{}.{}",
                new_name,
                old_path.extension().and_then(|s| s.to_str()).unwrap_or("md")
            )
        } else {
            new_name.to_string()
        };
        let parent = old_path
            .parent()
            .ok_or_else(|| msg(locale, "bDocumentMissing"))?;
        let new_path = parent.join(&final_name);
        if new_path.exists() {
            return Err(msg(locale, "bDocumentChanged"));
        }
        fs::rename(old_path, &new_path).map_err(|e| e.to_string())?;
        let old_norm = normalize_fs_path(&fs::canonicalize(&old_path).unwrap_or_else(|_| old_path.to_path_buf()));
        let new_norm = normalize_fs_path(&fs::canonicalize(&new_path).unwrap_or_else(|_| new_path.clone()));

        let mut affected = false;
        let ids: Vec<String> = self.docs.keys().cloned().collect();
        for id in ids {
            if let Some(d) = self.docs.get_mut(&id) {
                if d.path.eq_ignore_ascii_case(&old_norm) {
                    let old_pos = self.positions.remove(&d.path);
                    d.path = new_norm.clone();
                    d.title = Path::new(&new_norm)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&final_name)
                        .to_string();
                    d.updated = now_millis();
                    if let Some(p) = old_pos {
                        self.positions.insert(new_norm.clone(), p);
                    }
                    let cloned = d.clone();
                    let _ = self.persist_doc(&cloned);
                    affected = true;
                }
            }
        }
        if affected {
            let _ = self.save_positions();
        }
        Ok(FolderActionResponse {
            folders: self.scan_mounted_folders(),
            state: if affected { Some(self.state(locale)) } else { None },
        })
    }

    pub fn trash_fs_item(
        &mut self,
        target_str: &str,
        locale: &str,
    ) -> Result<FolderActionResponse, String> {
        let target = Path::new(target_str);
        if !target.exists() || !self.is_within_mounted(target) {
            return Err(msg(locale, "bDocumentMissing"));
        }
        let canon = fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
        let norm = normalize_fs_path(&canon);
        let file_name = target
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("item");
        let trash_target = self
            .root
            .join("trash")
            .join(format!("{}-{}", now_millis(), file_name));
        fs::rename(target, &trash_target).map_err(|e| e.to_string())?;

        let matching_ids: Vec<String> = self
            .docs
            .iter()
            .filter(|(_, d)| {
                !d.path.is_empty()
                    && (d.path.eq_ignore_ascii_case(&norm)
                        || d.path
                            .to_lowercase()
                            .starts_with(&format!("{}{}", norm.to_lowercase(), std::path::MAIN_SEPARATOR)))
            })
            .map(|(id, _)| id.clone())
            .collect();
        let mut state_opt = None;
        for id in matching_ids {
            state_opt = self.delete_doc(&id, locale).ok();
        }
        Ok(FolderActionResponse {
            folders: self.scan_mounted_folders(),
            state: state_opt,
        })
    }

    pub fn global_search(
        &mut self,
        query: &str,
        limit: usize,
        _locale: &str,
    ) -> Result<crate::search::GlobalSearchResponse, String> {
        let start = Instant::now();
        if self.search_index.is_none() {
            self.search_index = Some(crate::search::SearchIndex::open(
                &crate::search::default_db_path(&self.root),
            )?);
        }
        let idx = self
            .search_index
            .as_mut()
            .ok_or_else(|| "Search index unavailable".to_string())?;

        let mut valid_keys = HashSet::new();
        let mut open_paths = HashSet::new();

        for d in self.docs.values() {
            let key = if d.path.is_empty() {
                format!("doc:{}", d.id)
            } else {
                let lower = d.path.to_lowercase();
                open_paths.insert(lower.clone());
                lower
            };
            valid_keys.insert(key.clone());
            let _ = idx.upsert_content(
                &key,
                &d.id,
                &d.path,
                &d.title,
                d.updated,
                d.content.len() as i64,
                &d.content,
            );
        }

        let mut scanned = 0usize;
        for root_str in &self.folders {
            let root = Path::new(root_str);
            if root.is_dir() {
                index_folder_files(root, 0, &mut scanned, &open_paths, &mut valid_keys, idx);
            }
        }
        let _ = idx.prune_missing(&valid_keys);

        let hits = if query.trim().is_empty() {
            Vec::new()
        } else {
            idx.search(query, limit.clamp(1, 200))?
        };
        let (indexed_files, indexed_blocks) = idx.stats();
        Ok(crate::search::GlobalSearchResponse {
            hits,
            indexed_files,
            indexed_blocks,
            elapsed_ms: start.elapsed().as_millis() as u64,
        })
    }

    pub fn handle_rpc(&mut self, method: &str, args: &[Value], locale: &str) -> Result<Value, String> {
        match method {
            "State" => Ok(serde_json::to_value(self.state(locale)).unwrap()),
            "Update" => {
                let edit: Edit = serde_json::from_value(args.get(0).cloned().unwrap_or(Value::Null))
                    .map_err(|e| e.to_string())?;
                Ok(serde_json::to_value(self.update(edit, locale)?).unwrap())
            }
            "SavePosition" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let (rev, pos_val) = if args.get(1).and_then(|v| v.as_i64()).is_some() {
                    (
                        args.get(1).and_then(|v| v.as_i64()).unwrap_or(-1),
                        args.get(2).cloned().unwrap_or(Value::Null),
                    )
                } else {
                    (-1, args.get(1).cloned().unwrap_or(Value::Null))
                };
                let pos: Position = serde_json::from_value(pos_val).unwrap_or_default();
                self.save_position(id, rev, pos, locale)?;
                Ok(Value::Null)
            }
            "FilterDocuments" => {
                let req = args.get(0).cloned().unwrap_or(Value::Null);
                let q = req.get("query").and_then(|v| v.as_str()).unwrap_or("");
                let tag = req.get("tag").and_then(|v| v.as_str()).unwrap_or("");
                let loc = args.get(1).and_then(|v| v.as_str()).unwrap_or(locale);
                Ok(serde_json::to_value(self.filter_documents(q, tag, loc)?).unwrap())
            }
            "ResolveWikiLink" => {
                let req = args.get(0).cloned().unwrap_or(Value::Null);
                let source_id = req.get("sourceID").and_then(|v| v.as_str()).unwrap_or("");
                let rev = req.get("revision").and_then(|v| v.as_i64()).unwrap_or(0);
                let target = req.get("target").and_then(|v| v.as_str()).unwrap_or("");
                let loc = args.get(1).and_then(|v| v.as_str()).unwrap_or(locale);
                Ok(serde_json::to_value(self.resolve_wiki_link(source_id, rev, target, loc)?).unwrap())
            }
            "New" => Ok(serde_json::to_value(self.new_doc(locale)?).unwrap()),
            "OpenFile" => {
                let p = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.open_file_path(Path::new(p), locale)?).unwrap())
            }
            "Activate" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.activate(id, locale)?).unwrap())
            }
            "ActivateSearch" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let rev = args.get(1).and_then(|v| v.as_i64()).unwrap_or(-1);
                Ok(serde_json::to_value(self.activate_search(id, rev, locale)?).unwrap())
            }
            "Delete" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.delete_doc(id, locale)?).unwrap())
            }
            "Status" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.status(id, locale)?).unwrap())
            }
            "UpdateAppearance" => {
                let change: AppearanceChange =
                    serde_json::from_value(args.get(0).cloned().unwrap_or(Value::Null))
                        .map_err(|e| e.to_string())?;
                Ok(serde_json::to_value(self.update_appearance(change, locale)?).unwrap())
            }
            "Rename" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let title = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.rename(id, title, locale)?).unwrap())
            }
            "ImportImage" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let encoded = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.import_image(id, encoded, locale)?).unwrap())
            }
            "ReadImage" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let dest = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.read_image(id, dest, locale)?).unwrap())
            }
            "Delivery" => {
                let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.delivery(id, locale)?).unwrap())
            }
            "AddFolder" => {
                let p = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.add_folder(p, locale)?).unwrap())
            }
            "RemoveFolder" => {
                let p = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.remove_folder(p)?).unwrap())
            }
            "ScanFolders" => Ok(serde_json::to_value(self.scan_mounted_folders()).unwrap()),
            "CreateInFolder" => {
                let parent = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
                let kind = args.get(2).and_then(|v| v.as_str()).unwrap_or("file");
                Ok(serde_json::to_value(self.create_in_folder(parent, name, kind, locale)?).unwrap())
            }
            "RenameFsItem" => {
                let old_path = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let new_name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.rename_fs_item(old_path, new_name, locale)?).unwrap())
            }
            "TrashFsItem" => {
                let target = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                Ok(serde_json::to_value(self.trash_fs_item(target, locale)?).unwrap())
            }
            "GlobalSearch" => {
                let q = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
                let limit = args.get(1).and_then(|v| v.as_u64()).unwrap_or(60) as usize;
                Ok(serde_json::to_value(self.global_search(q, limit, locale)?).unwrap())
            }
            _ => Ok(Value::Null),
        }
    }
}

fn normalize_fs_path(p: &Path) -> String {
    let raw = p.to_string_lossy();
    raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
}

fn is_markdown_file(p: &Path) -> bool {
    p.extension()
        .and_then(|s| s.to_str())
        .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "md" | "markdown" | "txt"))
        .unwrap_or(false)
}

fn skip_folder_entry(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "node_modules" | "target" | "dist" | "build" | "__pycache__"
        )
}

fn valid_fs_item_name(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." || name.chars().count() > 160 {
        return false;
    }
    !name
        .chars()
        .any(|c| matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control())
}

fn percent_decode_path(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push(((h << 4) | l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn resolve_doc_image_path(root: &Path, d: &Document, dest: &str) -> Option<PathBuf> {
    let cleaned = dest.trim().trim_start_matches('<').trim_end_matches('>');
    if let Some(name) = cleaned.strip_prefix("readsoul-asset:") {
        return Some(root.join("assets").join(&d.id).join(name));
    }
    if cleaned.starts_with("http://")
        || cleaned.starts_with("https://")
        || cleaned.starts_with("data:")
        || cleaned.starts_with("blob:")
    {
        return None;
    }
    let no_query = cleaned.split(&['?', '#'][..]).next().unwrap_or(cleaned);
    let decoded = percent_decode_path(no_query);
    let p = Path::new(&decoded);
    if p.is_absolute() {
        return Some(p.to_path_buf());
    }
    if !d.path.is_empty() {
        let base = Path::new(&d.path).parent().unwrap_or_else(|| Path::new("."));
        return Some(base.join(p));
    }
    None
}

fn extract_image_refs(content: &str) -> Vec<String> {
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    let bytes = content.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        if i + 1 < bytes.len() && bytes[i] == b'!' && bytes[i + 1] == b'[' {
            if let Some(close_bracket) = content[i + 2..].find(']') {
                let after_bracket = i + 2 + close_bracket + 1;
                if after_bracket < bytes.len() && bytes[after_bracket] == b'(' {
                    let tail = &content[after_bracket + 1..];
                    if let Some(dest) = parse_md_link_dest(tail) {
                        if seen.insert(dest.clone()) {
                            refs.push(dest);
                        }
                    }
                }
            }
        } else if content[i..].starts_with("<img") {
            let next_char = bytes.get(i + 4).copied().unwrap_or(b' ');
            if next_char == b' ' || next_char == b'\t' || next_char == b'\n' || next_char == b'\r' {
                if let Some(end_tag) = content[i..].find('>') {
                    let tag = &content[i..i + end_tag + 1];
                    if let Some(src) = extract_html_attr(tag, "src") {
                        if seen.insert(src.clone()) {
                            refs.push(src);
                        }
                    }
                    i += end_tag + 1;
                    continue;
                }
            }
        }
        i += 1;
    }
    refs
}

fn parse_md_link_dest(tail: &str) -> Option<String> {
    let s = tail.trim_start();
    if let Some(inner) = s.strip_prefix('<') {
        let end = inner.find('>')?;
        return Some(inner[..end].trim().to_string());
    }
    let mut depth = 0usize;
    let mut end = s.len();
    for (idx, ch) in s.char_indices() {
        if ch == '\n' || ch == '\r' || ch.is_whitespace() {
            end = idx;
            break;
        }
        if ch == '(' {
            depth += 1;
        } else if ch == ')' {
            if depth == 0 {
                end = idx;
                break;
            }
            depth -= 1;
        }
    }
    let candidate = s[..end].trim();
    if candidate.is_empty() {
        None
    } else {
        Some(candidate.to_string())
    }
}

fn extract_html_attr(tag: &str, attr: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{}=", attr);
    let pos = lower.find(&needle)?;
    let rest = tag[pos + needle.len()..].trim_start();
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let inner = &rest[1..];
        let end = inner.find(quote)?;
        return Some(inner[..end].trim().to_string());
    }
    let end = rest
        .find(|c: char| c.is_whitespace() || c == '>')
        .unwrap_or(rest.len());
    Some(rest[..end].trim().to_string())
}

fn scan_folder_dir(
    dir: &Path,
    depth: usize,
    total: &mut usize,
    doc_map: &HashMap<String, String>,
) -> Vec<FolderTreeNode> {
    if depth >= 12 || *total >= 8000 {
        return Vec::new();
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut dirs = Vec::new();
    let mut files = Vec::new();
    for entry in entries.flatten() {
        if *total >= 8000 {
            break;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if skip_folder_entry(&name) {
            continue;
        }
        if path.is_dir() {
            *total += 1;
            let children = scan_folder_dir(&path, depth + 1, total, doc_map);
            dirs.push(FolderTreeNode {
                name,
                path: normalize_fs_path(&path),
                is_dir: true,
                doc_id: String::new(),
                children,
            });
        } else if path.is_file() && is_markdown_file(&path) {
            *total += 1;
            let norm = normalize_fs_path(&fs::canonicalize(&path).unwrap_or(path));
            let doc_id = doc_map
                .get(&norm.to_lowercase())
                .cloned()
                .unwrap_or_default();
            files.push(FolderTreeNode {
                name,
                path: norm,
                is_dir: false,
                doc_id,
                children: Vec::new(),
            });
        }
    }
    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    dirs
}

fn index_folder_files(
    dir: &Path,
    depth: usize,
    count: &mut usize,
    open_paths: &HashSet<String>,
    valid_keys: &mut HashSet<String>,
    idx: &mut crate::search::SearchIndex,
) {
    if depth >= 12 || *count >= 5000 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if *count >= 5000 {
            break;
        }
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if skip_folder_entry(&name) {
            continue;
        }
        if path.is_dir() {
            index_folder_files(&path, depth + 1, count, open_paths, valid_keys, idx);
        } else if path.is_file() && is_markdown_file(&path) {
            *count += 1;
            let norm = normalize_fs_path(&fs::canonicalize(&path).unwrap_or_else(|_| path.clone()));
            let key = norm.to_lowercase();
            if open_paths.contains(&key) {
                continue;
            }
            valid_keys.insert(key.clone());
            let Ok(meta) = fs::metadata(&path) else {
                continue;
            };
            let size = meta.len() as i64;
            if size as usize > MAX_DOCUMENT {
                continue;
            }
            let mtime = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let title = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&name)
                .to_string();
            if idx.is_unchanged(&key, mtime, size, "", &title) {
                continue;
            }
            if let Ok(content) = fs::read_to_string(&path) {
                let _ = idx.upsert_content(&key, "", &norm, &title, mtime, size, &content);
            }
        }
    }
}

pub type SharedWorkspace = Mutex<Workspace>;
