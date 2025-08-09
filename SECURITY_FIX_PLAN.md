# セキュリティ修正計画（フロント＋GAS）

本ドキュメントは診断結果を踏まえた修正計画です。ソースの変更は含みません（実装の指示のみ）。

## 目的
- 機微情報の露出防止（アクセストークン・ユーザーID）
- XSS/サプライチェーン由来のリスク低減
- 通報送信先（GAS）の濫用防止と入力検証の強化
- 変更は小さなPR単位で段階的に適用

## 適用範囲
- フロント: `index.html`, `basic_camera_pemission.html`, `script.js`, `style.css`
- サーバ（GAS）: スクリプト本体、デプロイ設定、ログ/ストレージ運用

## フロント修正計画
1) 機微情報の非露出（PR1）
- `script.js`: LIFF初期化後のデバッグ用 `console.log(accessToken)` を削除。
- `index.html`: アクセストークン/ユーザーIDのhiddenフィールドを使わない方針に統一（値のDOM格納禁止）。
- 保持はメモリ変数のみとし、サーバ送信時にのみ使用。DevToolsやDOMからの漏洩を抑止。

2) XSS耐性の強化（PR1）
- 動的UI組み立てで `innerHTML` を使用しない。全体検索して `textContent` とDOMノード組立へ置換。
- 例: 権限表示UI、通知系メッセージ、例外メッセージの描画箇所。

3) CSP導入と段階的厳格化（PR2→PR2.1）
- `index.html` に `Content-Security-Policy` を追加。初期ポリシー例:
  - `default-src 'self'`
  - `script-src 'self' https://unpkg.com https://static.line-scdn.net`
  - `style-src 'self' 'unsafe-inline' https://unpkg.com https://cdnjs.cloudflare.com`（後述のPRで `'unsafe-inline'` を削減）
  - `connect-src https://script.google.com https://api.line.me https://access.line.me https://static.line-scdn.net`
  - `img-src 'self' data: https://cyberjapandata.gsi.go.jp`
  - `font-src 'self' https://cdnjs.cloudflare.com`
  - `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
- PR2.1: インラインスタイルの排除・`nonce`/`hash`化により `style-src 'unsafe-inline'` を除去。

4) 外部依存の健全化（PR3）
- `cdnjs`（Font Awesome）へ SRI（`integrity` + `crossorigin="anonymous"`）を付与。該当バージョンのハッシュをCDN配布ページで取得して反映。
- LeafletはSRI付与済みか確認し、必要なら更新。
- LIFF SDKはSRI未提供のため、ドメイン固定（`https://static.line-scdn.net`）とCSPの組合せで限定。可能ならURLのバージョン固定を検討。

5) 送信形式の明確化（PR4）
- `script.js` の `fetch` を `headers: { 'Content-Type': 'application/json' }` とし、`body` は `JSON.stringify(payload)` のまま。
- GAS側のCORS設定を合わせ、プリフライト（OPTIONS）に対応。

6) A11y観点の微調整（任意・別PR）
- `meta viewport` の `user-scalable=no` を撤廃し拡大可能に（セキュリティではなくUX/アクセシビリティ改善）。

## サーバ（GAS）側修正計画
1) トークン検証（PR5-1）
- 受信するLINEアクセス・トークンを `/oauth2/v2.1/verify` で検証（`aud`/`exp` 等）。
- `userId` との整合性を検証。ログへはトークンの完全値を保持しない（マスク）。

2) 入力検証/制限（PR5-2）
- 緯度: 数値・範囲（-90〜90）、経度: 数値・範囲（-180〜180）。
- `type`: ホワイトリスト（「雑草」「倒木」「路面の穴ぼこ・段差」「落下物・汚れ」「その他」）。
- `details`: 文字数上限・制御文字除去・正規化（必要に応じて）。
- 画像: MIME再判定、寸法/容量上限、サーバ側で再エンコード（例: JPEG）して保存。保存パスは固定しパス操作不可に。

3) 濫用防止（PR5-3）
- レート制限: `userId` / IP ごとの短時間送信回数を制限（`CacheService` 等）。
- Origin制限: 静的サイトのオリジンをホワイトリスト化し、`Origin/Referer` を検証。
- 必要に応じて hCaptcha/署名付きリクエストの導入を検討。

4) 出力無害化・ログ衛生（PR5-4）
- スプレッドシート/CSV/メール等への出力時、`= + - @` 始まりの値には先頭に `'` を付与（式インジェクション対策）。
- ログはPII/トークンをマスクし、内部情報を露出する詳細なエラーは返さない。

## 作業順序（小PR分割）
- PR1: 機微情報非露出 + `innerHTML` 撲滅（フロント）
- PR2: CSP導入（緩め）
- PR2.1: インラインスタイル削減 → CSP厳格化
- PR3: SRI適用 + CDNバージョン固定
- PR4: `fetch` を `application/json` 化 + GAS側CORS対応
- PR5-1〜5-4: GAS側のトークン検証/入力検証/濫用防止/出力無害化/ログ衛生

## 受け入れ基準（抜粋）
- DevToolsでアクセストークン/ユーザーIDがDOM/console/Networkログに現れない。
- 任意の文字列入力や例外がUIへ表示されてもスクリプト実行されない（`textContent` のみ）。
- CSP/ネットワーク: 意図したドメイン以外への接続・読み込みがブロックされる。
- SRI: 改竄されたCDNリソースは読み込まれない（integrity検証で失敗）。
- GAS: 無効/期限切れトークンが拒否され、緯度経度の異常値・巨大画像・未許可`type`が拒否される。
- 濫用: 同一ユーザー/短時間の連投がしきい値超過で抑制される。

## 検証手順（要点）
- CSP: Console/SecurityでCSP違反が出ないこと、意図外の通信がないことを確認。
- SRI: 故意に誤ったintegrityを付与しブロックを確認→正しいハッシュで成功。
- 入力検証: 緯度=999、未許可`type`、過長`details`、巨大画像などで拒否されること。
- トークン検証: 無効/期限切れトークンでエラー、正規トークンで成功。
- レート制限: 連投で制限が発動すること。

## ロールバックとリスク
- CSPは段階導入（PR2）→厳格化（PR2.1）で運用影響を抑制。ブロック発生時は直前PRをリバート。
- SRI導入で読み込み失敗が出た場合は、ハッシュ誤りの可能性が高い。正しいハッシュへ更新。
- `application/json` 化はGAS側のCORS/OPTIONS対応が前提。先にサーバ側を用意し、クライアント切替は最後に。

---
この計画に沿って小さなPR単位で進めれば、ユーザー影響を抑えながら主要リスクを段階的に封じ込められます。
