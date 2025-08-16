// /functions/api/config.js

export function onRequest(context) {
  // context.env からCloudflareで設定した環境変数を安全に取得できる
  const envConfig = {
    GAS_WEB_APP_URL: context.env.GAS_WEB_APP_URL,
    LIFF_ID: context.env.LIFF_ID,
  };

  // JSON形式で設定情報を返す
  return new Response(JSON.stringify(envConfig), {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

