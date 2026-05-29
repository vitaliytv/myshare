//! YouTube transcript через supadata.ai API.
//!
//! YouTube anti-bot (PO-Token, у 2025) ефективно зламав усі прямі шляхи —
//! Innertube `/player`, raw `timedtext` без visitor session, navavit
//! `youtubei.js` через будь-який HTTP-proxy не отримує subtitles. Стабільний
//! шлях — комерційний transcript-сервіс, який тримає актуальний обхід.
//! Вибрали supadata.ai — REST API з простим x-api-key auth і free tier.
//!
//! API ключ жорстко зашитий у `SUPADATA_API_KEY` нижче — на цьому етапі
//! проєкт `myshare` не має secret-management шару, тому ключ живе у коді
//! для нульового setup'у. Якщо колись доведеться ротувати ключ або тримати
//! його окремо — замінимо на `std::env::var(...)` із dotenvy fallback.

use serde::{Deserialize, Serialize};
use thiserror::Error;

const SUPADATA_BASE: &str = "https://api.supadata.ai";
/// Захардкоджений supadata API ключ. Free-tier, прив'язаний до аккаунту
/// розробника застосунку `myshare`. При ротації — оновити тут і перебілдити.
const SUPADATA_API_KEY: &str = "sd_ddedfce7d9539db445e456b52938fa2d";

/// Зведений транскрипт для UI.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeTranscript {
    pub language_code: String,
    pub text: String,
    pub available_langs: Vec<String>,
}

/// Помилки для Tauri-IPC.
#[derive(Debug, Error)]
pub enum YoutubeError {
    #[error("invalid YouTube video id: {0}")]
    InvalidVideoId(String),
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("URL parse error: {0}")]
    Url(#[from] url::ParseError),
    #[error("supadata returned HTTP {status}: {message}")]
    Supadata { status: u16, message: String },
    #[error("жодна з мов {tried:?} недоступна; доступні: {available:?}")]
    NoMatchingLang { tried: Vec<String>, available: Vec<String> },
}

impl From<YoutubeError> for String {
    fn from(value: YoutubeError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SupadataResponse {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    lang: Option<String>,
    #[serde(default)]
    available_langs: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SupadataError {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

/// Tauri command: запитує транскрипт через supadata, пробуючи мови у порядку
/// `preferred`. Перша наявна перемагає.
#[tauri::command]
pub async fn yt_get_transcript(
    video_id: String,
    preferred: Vec<String>,
) -> Result<YoutubeTranscript, String> {
    Ok(get_transcript_inner(&video_id, &preferred, SUPADATA_BASE, SUPADATA_API_KEY).await?)
}

async fn get_transcript_inner(
    video_id: &str,
    preferred: &[String],
    base: &str,
    api_key: &str,
) -> Result<YoutubeTranscript, YoutubeError> {
    if !is_valid_video_id(video_id) {
        return Err(YoutubeError::InvalidVideoId(video_id.to_string()));
    }
    let client = reqwest::Client::new();

    let mut available: Vec<String> = Vec::new();
    let mut tried_count = 0;
    for lang in preferred {
        tried_count += 1;
        let url = format!(
            "{base}/v1/youtube/transcript?videoId={video_id}&lang={lang}&text=true"
        );
        let resp = client
            .get(&url)
            .header("x-api-key", api_key)
            .send()
            .await?;
        let status = resp.status();
        let body = resp.text().await?;
        if status.is_success() {
            let parsed: SupadataResponse = serde_json::from_str(&body)
                .map_err(|e| YoutubeError::Supadata { status: status.as_u16(), message: e.to_string() })?;
            // supadata повертає `lang` фактично використаний — він може бути
            // не той, що ми просили (auto-fallback на default). Беремо як є.
            let language_code = parsed.lang.unwrap_or_else(|| lang.clone());
            let text = parsed.content.unwrap_or_default();
            if text.is_empty() {
                // запам'ятовуємо available для останнього error message
                available = parsed.available_langs;
                continue;
            }
            return Ok(YoutubeTranscript {
                language_code,
                text,
                available_langs: parsed.available_langs,
            });
        }
        // Errors з supadata часто JSON {"error","message"} — намагаємось дістати.
        let message = serde_json::from_str::<SupadataError>(&body)
            .ok()
            .and_then(|e| e.message.or(e.error))
            .unwrap_or_else(|| body.chars().take(200).collect());
        // 404 на конкретну мову — не fatal, переходимо до наступної.
        if status.as_u16() == 404 {
            // спробуємо отримати available_langs з тіла
            if let Ok(parsed) = serde_json::from_str::<SupadataResponse>(&body) {
                available = parsed.available_langs;
            }
            continue;
        }
        return Err(YoutubeError::Supadata { status: status.as_u16(), message });
    }
    let _ = tried_count;
    Err(YoutubeError::NoMatchingLang {
        tried: preferred.to_vec(),
        available,
    })
}

/// YouTube IDs — 11 символів `[A-Za-z0-9_-]` (base64url).
fn is_valid_video_id(id: &str) -> bool {
    id.len() == 11 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_KEY: &str = "test_key";

    #[tokio::test]
    async fn invalid_video_id_errors() {
        let err = get_transcript_inner("bad_id", &["uk".into()], "https://example.com", TEST_KEY)
            .await
            .unwrap_err();
        assert!(matches!(err, YoutubeError::InvalidVideoId(_)));
    }

    #[tokio::test]
    async fn happy_path_returns_text() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/v1/youtube/transcript")
            .match_query(mockito::Matcher::AllOf(vec![
                mockito::Matcher::UrlEncoded("videoId".into(), "dQw4w9WgXcQ".into()),
                mockito::Matcher::UrlEncoded("lang".into(), "uk".into()),
                mockito::Matcher::UrlEncoded("text".into(), "true".into()),
            ]))
            .match_header("x-api-key", "test_key")
            .with_status(200)
            .with_body(
                r#"{"content":"Привіт\nСвіт","lang":"uk","availableLangs":["uk","en"]}"#,
            )
            .create_async()
            .await;

        let t = get_transcript_inner("dQw4w9WgXcQ", &["uk".into(), "en".into()], &server.url(), TEST_KEY)
            .await
            .unwrap();
        assert_eq!(t.language_code, "uk");
        assert_eq!(t.text, "Привіт\nСвіт");
        assert_eq!(t.available_langs, vec!["uk", "en"]);
    }

    #[tokio::test]
    async fn fallback_to_en_when_uk_404() {
        let mut server = mockito::Server::new_async().await;
        let _m_uk = server
            .mock("GET", "/v1/youtube/transcript")
            .match_query(mockito::Matcher::UrlEncoded("lang".into(), "uk".into()))
            .with_status(404)
            .with_body(r#"{"error":"not_found","availableLangs":["en","de"]}"#)
            .create_async()
            .await;
        let _m_en = server
            .mock("GET", "/v1/youtube/transcript")
            .match_query(mockito::Matcher::UrlEncoded("lang".into(), "en".into()))
            .with_status(200)
            .with_body(r#"{"content":"hello","lang":"en","availableLangs":["en","de"]}"#)
            .create_async()
            .await;

        let t = get_transcript_inner("dQw4w9WgXcQ", &["uk".into(), "en".into()], &server.url(), TEST_KEY)
            .await
            .unwrap();
        assert_eq!(t.language_code, "en");
        assert_eq!(t.text, "hello");
    }

    #[tokio::test]
    async fn no_matching_returns_error_with_available() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/v1/youtube/transcript")
            .match_query(mockito::Matcher::Any)
            .with_status(404)
            .with_body(r#"{"availableLangs":["de","fr"]}"#)
            .expect(2) // uk + en
            .create_async()
            .await;

        let err = get_transcript_inner("dQw4w9WgXcQ", &["uk".into(), "en".into()], &server.url(), TEST_KEY)
            .await
            .unwrap_err();
        match err {
            YoutubeError::NoMatchingLang { tried, available } => {
                assert_eq!(tried, vec!["uk", "en"]);
                assert_eq!(available, vec!["de", "fr"]);
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[tokio::test]
    async fn unauthorized_propagates() {
        let mut server = mockito::Server::new_async().await;
        let _m = server
            .mock("GET", "/v1/youtube/transcript")
            .match_query(mockito::Matcher::Any)
            .with_status(401)
            .with_body(r#"{"error":"unauthorized","message":"Missing API Key"}"#)
            .create_async()
            .await;
        let err = get_transcript_inner("dQw4w9WgXcQ", &["en".into()], &server.url(), TEST_KEY)
            .await
            .unwrap_err();
        match err {
            YoutubeError::Supadata { status, message } => {
                assert_eq!(status, 401);
                assert!(message.contains("Missing API Key"));
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn validates_video_id() {
        assert!(is_valid_video_id("dQw4w9WgXcQ"));
        assert!(!is_valid_video_id("too-short"));
        assert!(!is_valid_video_id("dQw4w9WgXcQ_extra"));
        assert!(!is_valid_video_id("dQw4w9WgXc!"));
    }
}
