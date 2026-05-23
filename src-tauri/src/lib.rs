use std::path::Path;
use std::io::{Read, Write};
use std::net::TcpListener;
use tauri::Manager;
use serde::{Deserialize, Serialize};

/// Load repo-root `.env` (Vite reads it for the webview; Rust does not unless we load it here).
fn load_dotenv() {
  let root_env = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".env");
  let _ = dotenvy::from_path(root_env);
  let _ = dotenvy::dotenv();
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TokenResponse {
  pub access_token: String,
  pub refresh_token: Option<String>,
  pub expires_in: u64,
}

/// Web-application OAuth clients require `client_secret`; Desktop app clients do not.
fn append_client_secret_if_configured(mut body: String) -> String {
  if let Ok(secret) = std::env::var("GOOGLE_CLIENT_SECRET") {
    if !secret.trim().is_empty() {
      body.push_str("&client_secret=");
      body.push_str(&urlencoding::encode(secret.trim()));
    }
  }
  body
}

fn post_google_token_form(body: String) -> Result<String, String> {
  match ureq::post("https://oauth2.googleapis.com/token")
    .set("Content-Type", "application/x-www-form-urlencoded")
    .send_bytes(body.as_bytes())
  {
    Ok(response) => response
      .into_string()
      .map_err(|e| format!("Failed to read response: {}", e)),
    Err(ureq::Error::Status(status, response)) => {
      let error_text = response
        .into_string()
        .unwrap_or_else(|_| "Unknown error body".to_string());
      Err(format!("Google token endpoint error {}: {}", status, error_text))
    }
    Err(ureq::Error::Transport(t)) => Err(format!("HTTP transport error: {}", t)),
  }
}

#[tauri::command]
fn google_exchange_code(
  code: String,
  code_verifier: String,
  client_id: String,
  redirect_uri: String,
) -> Result<TokenResponse, String> {
  let body = append_client_secret_if_configured(format!(
    "grant_type=authorization_code&code={}&client_id={}&redirect_uri={}&code_verifier={}",
    urlencoding::encode(&code),
    urlencoding::encode(&client_id),
    urlencoding::encode(&redirect_uri),
    urlencoding::encode(&code_verifier),
  ));

  #[derive(Deserialize)]
  struct GoogleTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
  }

  let response_text = post_google_token_form(body)?;

  let token_response: GoogleTokenResponse = serde_json::from_str(&response_text)
    .map_err(|e| format!("Failed to parse response: {}", e))?;

  Ok(TokenResponse {
    access_token: token_response.access_token,
    refresh_token: token_response.refresh_token,
    expires_in: token_response.expires_in,
  })
}

fn wait_for_oauth_code_blocking(port: u16) -> Result<String, String> {
  let listener = TcpListener::bind(("127.0.0.1", port))
    .map_err(|e| format!("Failed to bind OAuth callback listener: {}", e))?;

  listener
    .set_nonblocking(false)
    .map_err(|e| format!("Failed to configure OAuth callback listener: {}", e))?;

  // Browsers often open an extra connection first (e.g. /favicon.ico) with no ?code=.
  // Only treat Google's redirect as final: path must include code= or error=.
  const MAX_ATTEMPTS: u32 = 64;
  let mut attempt = 0_u32;

  loop {
    attempt += 1;
    if attempt > MAX_ATTEMPTS {
      return Err(
        "OAuth callback: only empty or unrelated requests received (e.g. favicon). Close other tabs using this port and try Connect again.".to_string(),
      );
    }

    let (mut stream, _) = listener
      .accept()
      .map_err(|e| format!("Failed to accept OAuth callback: {}", e))?;

    let mut buffer = [0_u8; 8192];
    let read = stream
      .read(&mut buffer)
      .map_err(|e| format!("Failed to read OAuth callback request: {}", e))?;
    let request = String::from_utf8_lossy(&buffer[..read]).to_string();

    let first_line = request.lines().next().unwrap_or_default();
    let path = first_line
      .split_whitespace()
      .nth(1)
      .ok_or_else(|| "Invalid OAuth callback request line".to_string())?;

    let response_html = "<html><body><h3>Calendar Widget connected. You can close this tab.</h3></body></html>";
    let response = format!(
      "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
      response_html.len(),
      response_html
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();

    if path.contains("code=") || path.contains("error=") {
      return Ok(format!("http://127.0.0.1:{}{}", port, path));
    }
  }
}

#[tauri::command]
async fn google_wait_for_oauth_code(port: u16) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || wait_for_oauth_code_blocking(port))
    .await
    .map_err(|e| format!("OAuth callback task failed: {}", e))?
}

#[tauri::command]
fn google_refresh_token(
  refresh_token: String,
  client_id: String,
) -> Result<TokenResponse, String> {
  let body = append_client_secret_if_configured(format!(
    "grant_type=refresh_token&refresh_token={}&client_id={}",
    urlencoding::encode(&refresh_token),
    urlencoding::encode(&client_id),
  ));

  #[derive(Deserialize)]
  struct GoogleRefreshResponse {
    access_token: String,
    expires_in: u64,
  }

  let response_text = post_google_token_form(body)?;

  let token_response: GoogleRefreshResponse = serde_json::from_str(&response_text)
    .map_err(|e| format!("Failed to parse response: {}", e))?;

  Ok(TokenResponse {
    access_token: token_response.access_token,
    refresh_token: None,
    expires_in: token_response.expires_in,
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  load_dotenv();
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_single_instance::init(|app, _, _| {
      if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.show();
        let _ = main_window.unminimize();
        let _ = main_window.set_focus();
      }
    }))
    .invoke_handler(tauri::generate_handler![
      google_exchange_code,
      google_refresh_token,
      google_wait_for_oauth_code
    ])
    .setup(|app| {
      if let Some(main_window) = app.get_webview_window("main") {
        let _ = main_window.set_always_on_bottom(true);
        let _ = main_window.set_skip_taskbar(true);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
