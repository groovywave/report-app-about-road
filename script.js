// 設定
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbxRQHZJrSOyPcALCbPQksYbV-gDznGWM5jxkQlA4Bdod4K6H1S31eN0O2iCKZoDrfqnDg/exec',
  LIFF_ID: '2007739464-gVVMBAQR',
  DEFAULT_LAT: 36.87,
  DEFAULT_LNG: 140.01,
  MAP_ZOOM: 15
};

// グローバル変数
let map = null;
let currentPosition = { lat: CONFIG.DEFAULT_LAT, lng: CONFIG.DEFAULT_LNG };
let lineAccessToken = null;
let lineUserId = null;
let selectedImageData = null;

// 通知表示
function showNotification(message, type) {
  // 既存の通知を削除
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  // 新しい通知を作成
  const notification = document.createElement('div');
  notification.className = 'notification notification-' + (type || 'info');
  notification.textContent = message;
  document.body.appendChild(notification);

  // 3秒後に削除
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}

// LINE状態更新
function updateLineStatus(type, message) {
  const statusElement = document.getElementById('line-status');
  if (!statusElement) return;

  statusElement.className = 'line-status ' + type;
  statusElement.innerHTML = '<div class="line-status-content"><span>' + message + '</span></div>';
  statusElement.classList.remove('hidden');
}

// 座標表示更新
function updateCoordinatesDisplay() {
  const coordsDisplay = document.getElementById('coords-display');
  if (coordsDisplay) {
    coordsDisplay.textContent = '緯度: ' + currentPosition.lat.toFixed(6) + ', 経度: ' + currentPosition.lng.toFixed(6);
  }
}

// LIFF初期化
function initializeLiff() {
  if (!CONFIG.LIFF_ID) {
    updateLineStatus('warning', 'LIFF IDが設定されていません');
    return;
  }

  liff.init({ liffId: CONFIG.LIFF_ID })
    .then(() => {
      console.log('LIFF初期化成功');
      if (liff.isLoggedIn()) {
        lineAccessToken = liff.getAccessToken();
        return liff.getProfile();
      } else {
        throw new Error('LINEにログインしていません');
      }
    })
    .then((profile) => {
      lineUserId = profile.userId;
      updateLineStatus('success', 'LINE連携済み: ' + profile.displayName);
    })
    .catch((error) => {
      console.error('LIFF初期化エラー:', error);
      updateLineStatus('error', 'LINE連携エラー: ' + error.message);
    });
}

// 地図初期化
function initializeMap() {
  try {
    // 地図要素の存在確認
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('地図要素が見つかりません');
      return;
    }

    // Leaflet地図の初期化
    map = L.map('map').setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);

    // タイルレイヤーの追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 地図移動イベント
    map.on('moveend', () => {
      const center = map.getCenter();
      currentPosition = {
        lat: center.lat,
        lng: center.lng
      };
      updateCoordinatesDisplay();
    });

    // 初期座標表示
    updateCoordinatesDisplay();

    console.log('地図初期化完了');

  } catch (error) {
    console.error('地図初期化エラー:', error);
    showNotification('地図の初期化に失敗しました', 'error');
  }
}

// 現在位置取得
function getCurrentLocation() {
  if (!navigator.geolocation) {
    console.warn('位置情報がサポートされていません');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      if (map) {
        map.setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);
        updateCoordinatesDisplay();
      }

      console.log('現在位置取得成功:', currentPosition);
    },
    (error) => {
      console.warn('現在位置取得エラー:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

// ファイル選択処理
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // ファイルサイズチェック（5MB）
  if (file.size > 5 * 1024 * 1024) {
    showNotification('ファイルサイズが大きすぎます（最大5MB）', 'error');
    return;
  }

  // ファイルタイプチェック
  if (!file.type.startsWith('image/')) {
    showNotification('画像ファイルを選択してください', 'error');
    return;
  }

  // FileReader使用
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.getElementById('image-preview');
    if (preview) {
      preview.src = e.target.result;
      preview.style.display = 'block';
      selectedImageData = e.target.result;
      showNotification('画像が選択されました', 'success');
    }
  };
  reader.onerror = () => {
    showNotification('ファイルの読み込みに失敗しました', 'error');
  };
  reader.readAsDataURL(file);
}

// カメラ撮影（シンプル版）
function openCamera() {
  const input = document.getElementById('photo');
  if (input) {
    input.click();
  }
}

// フォームバリデーション
function validateForm() {
  // 通報種別チェック
  const typeInputs = document.querySelectorAll('input[name="type"]');
  let typeSelected = false;

  for (let input of typeInputs) {
    if (input.checked) {
      typeSelected = true;
      break;
    }
  }

  if (!typeSelected) {
    showNotification('通報種別を選択してください', 'warning');
    return false;
  }

  return true;
}

// フォーム送信
function submitForm(event) {
  event.preventDefault();

  if (!validateForm()) {
    return;
  }

  // ローディング表示
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.remove('hidden');
  }

  // フォームデータ収集
  let selectedType = '';
  const typeInputs = document.querySelectorAll('input[name="type"]');
  for (let input of typeInputs) {
    if (input.checked) {
      selectedType = input.value;
      break;
    }
  }

  const details = document.getElementById('details').value.trim();

  const formData = {
    latitude: currentPosition.lat,
    longitude: currentPosition.lng,
    type: selectedType,
    details: details,
    timestamp: new Date().toISOString()
  };

  // LINE情報追加
  if (lineAccessToken) {
    formData.accessToken = lineAccessToken;
  }
  if (lineUserId) {
    formData.userId = lineUserId;
  }

  // 画像データ追加
  if (selectedImageData) {
    formData.photoData = selectedImageData;
    formData.photoMimeType = 'image/jpeg';
  }

  // GASに送信
  fetch(CONFIG.GAS_WEB_APP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formData)
  })
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP error! status: ' + response.status);
      }
      return response.json();
    })
    .then(result => {
      console.log('送信成功:', result);

      if (result.status === 'success') {
        showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');

        if (result.lineNotified) {
          showNotification('LINEに詳細情報を送信しました', 'info');
        }

        // フォームリセット
        resetForm();
      } else {
        throw new Error(result.message || '送信に失敗しました');
      }
    })
    .catch(error => {
      console.error('送信エラー:', error);
      showNotification('送信に失敗しました: ' + error.message, 'error');
    })
    .finally(() => {
      // ローディング非表示
      if (loader) {
        loader.classList.add('hidden');
      }
    });
}

// フォームリセット
function resetForm() {
  // ラジオボタンリセット
  const typeInputs = document.querySelectorAll('input[name="type"]');
  typeInputs.forEach(input => input.checked = false);

  // テキストエリアリセット
  const details = document.getElementById('details');
  if (details) details.value = '';

  // ファイル入力リセット
  const fileInput = document.getElementById('photo');
  if (fileInput) fileInput.value = '';

  // 画像プレビューリセット
  const preview = document.getElementById('image-preview');
  if (preview) {
    preview.style.display = 'none';
    preview.src = '';
  }

  selectedImageData = null;
}

// イベントリスナー設定
function setupEventListeners() {
  // ファイル選択
  const fileInput = document.getElementById('photo');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  // カメラボタン
  const cameraButton = document.getElementById('start-camera-btn');
  if (cameraButton) {
    cameraButton.addEventListener('click', openCamera);
  }

  // フォーム送信
  const form = document.getElementById('report-form');
  if (form) {
    form.addEventListener('submit', submitForm);
  }

  // 送信ボタン
  const submitButton = document.getElementById('btn-submit');
  if (submitButton) {
    submitButton.addEventListener('click', submitForm);
  }
}

// アプリケーション初期化
function initializeApp() {
  console.log('アプリケーション初期化開始');

  try {
    // 1. LIFF初期化
    initializeLiff();

    // 2. 地図初期化（少し遅延）
    setTimeout(() => {
      initializeMap();
      getCurrentLocation();
    }, 100);

    // 3. イベントリスナー設定
    setupEventListeners();

    console.log('アプリケーション初期化完了');

  } catch (error) {
    console.error('初期化エラー:', error);
    showNotification('初期化に失敗しました', 'error');
  }
}

// DOM読み込み完了時の初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('ページ読み込み完了');

  // 少し遅延させて初期化
  setTimeout(initializeApp, 200);
});

// エラーハンドリング
window.addEventListener('error', (event) => {
  console.error('グローバルエラー:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未処理のPromise拒否:', event.reason);
});
