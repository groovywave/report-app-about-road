// script.js - Google Drive写真登録・LINE投稿対応版

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbx0hPcerC84t47KY-1Pyh9j0YVZTSQ-Wrl21PMYkYe4DImm1Xxj9TQhwuDrV-Z3AgYEAQ/exec',
  LIFF_ID: '2007739464-gVVMBAQR', // 実際のLIFF IDに変更
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  REQUEST_TIMEOUT: 30000,
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  DEFAULT_LAT: 36.87,
  DEFAULT_LNG: 140.01,
  MAP_ZOOM: 15
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// グローバル変数
let map = null;
let currentPosition = { lat: CONFIG.DEFAULT_LAT, lng: CONFIG.DEFAULT_LNG };
let currentPhoto = { data: null, mimeType: null };
let videoStream = null;
let lineAccessToken = null;
let lineUserId = null;

// ===== 動作実績のあるデータ送信関数（写真データ対応） =====

async function sendDataWithRetry(formData, attempt = 1) {
  try {
    console.log('送信試行 ' + attempt + '/' + CONFIG.MAX_RETRY_ATTEMPTS);

    // フォームデータから送信用ペイロードを作成
    const payload = {
      latitude: formData.get('latitude'),
      longitude: formData.get('longitude'),
      type: formData.get('type'),
      details: formData.get('details'),
      photoData: currentPhoto.data, // Base64画像データ
      photoMimeType: currentPhoto.mimeType, // MIMEタイプ
      accessToken: lineAccessToken,
      userId: lineUserId,
      timestamp: new Date().toISOString()
    };

    console.log('Sending payload:', {
      ...payload,
      photoData: payload.photoData ? '[IMAGE_DATA_' + payload.photoData.length + '_CHARS]' : null
    });

    // AbortControllerでタイムアウト制御
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

    // 動作実績のあるfetchリクエスト
    const response = await fetch(CONFIG.GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'text/plain' }, // 重要：text/plain
      mode: 'cors',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`サーバーエラー: ${response.status} ${response.statusText}`);
    }

    const data = JSON.parse(await response.text());

    if (data.status === 'success') {
      return data;
    } else {
      throw new Error(data.message || 'サーバーでエラーが発生しました。');
    }

  } catch (error) {
    console.error('Fetch error (attempt ' + attempt + '):', error);

    if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && shouldRetry(error)) {
      showNotification(`送信に失敗しました。${CONFIG.RETRY_DELAY / 1000}秒後に再試行します... (${attempt}/${CONFIG.MAX_RETRY_ATTEMPTS})`, 'warning');
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
      return sendDataWithRetry(formData, attempt + 1);
    }

    throw error;
  }
}

function shouldRetry(error) {
  return error.name === 'AbortError' ||
    error.message.includes('fetch') ||
    error.message.includes('network') ||
    error.message.includes('timeout');
}

// ===== フォーム送信処理（写真データ対応版） =====

async function handleFormSubmission(formData, elements) {
  try {
    setSubmissionState(true, elements);

    // バリデーション
    const validation = validateFormData(formData);
    if (!validation.isValid) {
      throw new Error(validation.message);
    }

    // 写真データの確認
    if (currentPhoto.data) {
      console.log('写真データあり:', {
        mimeType: currentPhoto.mimeType,
        dataLength: currentPhoto.data.length
      });
    }

    // データ送信
    const result = await sendDataWithRetry(formData);

    // 成功処理
    showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');

    if (result.lineNotified) {
      showNotification('LINEに詳細情報を送信しました', 'info');
    }

    if (result.spreadsheetUpdated) {
      console.log('スプレッドシート更新成功');
    }

    if (result.imageUploaded) {
      showNotification('写真をGoogle Driveに保存しました', 'info');
    }

    // フォームリセット
    elements.form.reset();
    updatePhoto(null, null, elements);

  } catch (error) {
    console.error('送信エラー:', error);
    showNotification(`送信に失敗しました: ${error.message}`, 'error');
  } finally {
    setSubmissionState(false, elements);
  }
}

function validateFormData(formData) {
  const requiredFields = [
    { name: 'latitude', label: '場所' },
    { name: 'longitude', label: '場所' },
    { name: 'type', label: '異常の種類' }
  ];

  for (const field of requiredFields) {
    const value = formData.get(field.name);
    if (!value || value.trim() === '') {
      return {
        isValid: false,
        message: field.name.includes('itude')
          ? '場所が指定されていません。地図を動かして位置を合わせてください。'
          : `${field.label}が入力されていません。`
      };
    }
  }

  const lat = parseFloat(formData.get('latitude'));
  const lng = parseFloat(formData.get('longitude'));

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return { isValid: false, message: '緯度の値が正しくありません。' };
  }
  if (isNaN(lng) || lng < -180 || lng > 180) {
    return { isValid: false, message: '経度の値が正しくありません。' };
  }

  return { isValid: true };
}

// ===== 写真処理関数（Base64データ対応） =====

function updatePhoto(data, mimeType, elements) {
  currentPhoto.data = data;
  currentPhoto.mimeType = mimeType;

  if (data && mimeType) {
    elements.imagePreview.src = data;
    elements.imagePreview.style.display = 'block';
    console.log('写真設定完了:', {
      mimeType: mimeType,
      dataLength: data.length
    });
  } else {
    elements.imagePreview.src = '#';
    elements.imagePreview.style.display = 'none';
    console.log('写真クリア');
  }

  if (elements.photoInput) {
    elements.photoInput.value = '';
  }
}

function handlePhotoInput(input, elements) {
  if (input.files && input.files[0]) {
    const file = input.files[0];

    console.log('ファイル選択:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showNotification('ファイルサイズが大きすぎます。5MB以下のファイルを選択してください。', 'error');
      updatePhoto(null, null, elements);
      return;
    }

    if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
      showNotification('対応していないファイル形式です。', 'error');
      updatePhoto(null, null, elements);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      updatePhoto(e.target.result, file.type, elements);
      showNotification('画像が選択されました', 'success');
    };
    reader.onerror = () => {
      showNotification('ファイルの読み込みに失敗しました。', 'error');
      updatePhoto(null, null, elements);
    };
    reader.readAsDataURL(file);
  }
}

// ===== その他の関数（既存のまま） =====

function showNotification(message, type = 'info') {
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) existingNotification.remove();

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  notification.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 12px 20px;
    border-radius: 4px; color: white; font-weight: bold; z-index: 10000;
    max-width: 300px; word-wrap: break-word; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    background-color: ${colors[type] || colors.info};
  `;

  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

function setSubmissionState(isSending, elements) {
  if (isSending) {
    elements.loader.classList.remove('hidden');
    elements.loader.classList.add('sending');
  } else {
    elements.loader.classList.add('hidden');
    elements.loader.classList.remove('sending');
  }

  const formElements = elements.form.querySelectorAll('input, select, textarea, button');
  formElements.forEach(el => el.disabled = isSending);
}

// ===== LIFF初期化（動作実績版） =====

async function initializeLIFF() {
  try {
    console.log('LIFF初期化開始');

    if (!CONFIG.LIFF_ID) {
      console.warn('LIFF_IDが設定されていません');
      updateLineStatus('warning', 'LIFF設定が必要です');
      return;
    }

    await liff.init({ liffId: CONFIG.LIFF_ID });
    console.log('LIFF初期化成功');

    if (liff.isLoggedIn()) {
      // アクセストークンを取得
      lineAccessToken = liff.getAccessToken();

      // プロフィール情報を取得
      const profile = await liff.getProfile();
      lineUserId = profile.userId;

      // 隠しフィールドに設定
      const accessTokenInput = document.getElementById('accessToken');
      const userIdInput = document.getElementById('userId');
      if (accessTokenInput) accessTokenInput.value = lineAccessToken;
      if (userIdInput) userIdInput.value = lineUserId;

      updateLineStatus('success', `LINE連携済み: ${profile.displayName}`);
      console.log('LINEユーザー情報取得成功:', profile);
    } else {
      updateLineStatus('error', 'LINEログインが必要です');
      console.log('LINEログインが必要');

      // 自動ログインを試行
      try {
        await liff.login();
      } catch (loginError) {
        console.error('自動ログイン失敗:', loginError);
      }
    }
  } catch (error) {
    console.error('LIFF初期化エラー:', error);
    updateLineStatus('error', 'LINE連携エラー');
  }
}

function updateLineStatus(status, message) {
  const lineStatus = document.getElementById('line-status');
  const lineStatusText = document.getElementById('line-status-text');

  if (!lineStatus || !lineStatusText) return;

  lineStatus.className = `line-status ${status}`;
  lineStatusText.textContent = message;
  lineStatus.classList.remove('hidden');

  // 5秒後に非表示（成功時のみ）
  if (status === 'success') {
    setTimeout(() => {
      lineStatus.classList.add('hidden');
    }, 5000);
  }
}

// ===== 地図初期化（動作実績版） =====

function initializeMap() {
  try {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('地図要素が見つかりません');
      return;
    }

    map = L.map('map').setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);

    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: "地理院タイル（GSI）",
      maxZoom: 18
    }).addTo(map);

    function updateCenterCoords() {
      const center = map.getCenter();
      currentPosition = {
        lat: center.lat,
        lng: center.lng
      };

      const coordsDisplay = document.getElementById('coords-display');
      const latInput = document.getElementById('latitude');
      const lngInput = document.getElementById('longitude');

      if (coordsDisplay) {
        coordsDisplay.innerText = `緯度: ${center.lat.toFixed(6)} 経度: ${center.lng.toFixed(6)}`;
      }
      if (latInput) latInput.value = center.lat;
      if (lngInput) lngInput.value = center.lng;
    }

    map.on('move', updateCenterCoords);
    updateCenterCoords();

    // 現在位置の取得
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          currentPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          };
          map.setView([currentPosition.lat, currentPosition.lng], 18);
        },
        function(error) {
          console.warn('位置情報の取得に失敗しました:', error);
          showNotification('位置情報の取得に失敗しました。手動で位置を調整してください。', 'warning');
        }
      );
    }

    console.log('地図初期化完了');

  } catch (error) {
    console.error('地図初期化エラー:', error);
    showNotification('地図の初期化に失敗しました', 'error');
  }
}

// ===== アプリケーション初期化（動作実績版ベース） =====

document.addEventListener('DOMContentLoaded', function() {
  console.log('ページ読み込み完了');

  // 要素の取得
  const elements = {
    form: document.getElementById('report-form'),
    loader: document.getElementById('loader'),
    photoInput: document.getElementById('photo'),
    imagePreview: document.getElementById('image-preview')
  };

  // LIFF初期化
  initializeLIFF();

  // 地図初期化
  setTimeout(() => {
    initializeMap();
  }, 100);

  // 写真プレビュー
  if (elements.photoInput) {
    elements.photoInput.addEventListener('change', function() {
      handlePhotoInput(this, elements);
    });
  }

  // フォーム送信
  if (elements.form) {
    elements.form.addEventListener('submit', function(e) {
      e.preventDefault();
      if (!elements.loader.classList.contains('sending')) {
        const formData = new FormData(this);
        handleFormSubmission(formData, elements);
      }
    });
  }

  console.log('アプリケーション初期化完了');
});

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
  }
});
