# 変更履歴（Road Report App）

このドキュメントは直近の修正内容をまとめたものです。

## 2025-08-09

### 機能追加: 写真を2枚（遠景/近景）で登録可能に
- HTML
  - 入力枠を2つに分割し、それぞれラベルを追加。
    - 遠景: `#photo-distant` / `#image-preview-distant` / `#start-camera-btn-distant`
    - 近景: `#photo-close` / `#image-preview-close` / `#start-camera-btn-close`
  - ラベル文言を「3-1. 遠景 (任意)」「3-2. 近景 (任意)」に変更。
  - プレビュー画像は初期非表示に変更。
- JavaScript（script.js）
  - 2枠管理用の状態を追加: `currentPhotos`（distant/close）、`activePhotoSlot`。
  - 各枠のファイル選択に個別のプレビュー処理を追加。
  - カメラ撮影時に、押下したボタンの枠へ画像が入るように切替。
  - 送信ペイロードを2枚対応に拡張。
    - `photoDistantData`, `photoDistantMimeType`
    - `photoCloseData`, `photoCloseMimeType`
  - 送信成功後は両方のプレビューをリセット。
- サーバ側（GAS）への影響
  - 上記4キーを新たに受け取り保存できるよう処理を拡張してください。
  - どちらか未送信（null）のケースは無視する分岐を入れてください。
- バリデーション
  - 写真は「任意」のまま（どちらも未選択で送信可）。

### クリーンアップ/セキュリティ
- 未使用ファイルを削除
  - `basic_camera_pemission.html`（綴り: pemission）を削除。リポジトリ内からの参照はありませんでした。
- ポリシーの追加
  - `index.html` に以下のメタを追加。
    - Content-Security-Policy（CSP）
    - Referrer-Policy（`no-referrer`）
- 機微情報の取り扱い
  - LIFFアクセストークンをコンソールへ出力しないよう変更。
  - `index.html` からアクセストークン/ユーザーIDの hidden フィールドを削除。

### 既知の注意点（今後のタスク候補）
- `updatePermissionStatus` では、状態表示に `innerHTML` を使用しています。表示文字列の安全性確保のため、可能であれば `textContent` とノード組立に移行してください。
- CDNリソース（Font Awesome等）への SRI 適用・バージョン固定は未実施です（計画は `SECURITY_FIX_PLAN.md` を参照）。
- `fetch` の `Content-Type` は現状 `text/plain` を継続（GAS側CORS運用に合わせて `application/json` 化は別PRで検討）。

---
差分の詳細は Git の履歴（直近コミット）または各ファイルを参照してください。
