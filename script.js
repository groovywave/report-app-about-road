// script.js - LINE Login channel対応版

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwQ95GWJvpt_AAE4QeLvVvAVFr6UVXsUy1WMPtOyJTnle-tBGADkn02_yS7NAPrPIuXaA/exec',
  LIFF_ID: '2007739464-gVVMBAQR', // LINE Login channelのLIFF IDに変更
  // 地図設定
  DEFAULT_LAT: 36.87,
  DEFAULT_LNG: 140.01,
  MAP_ZOOM: 15,
  // カメラ設定
  CAMERA_WIDTH: 1280,
  CAMERA_HEIGHT: 720,
  IMAGE_QUALITY: 0.8,
  MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
  // UI設定
  NOTIFICATION_DURATION: 3000,
  LOADING_MIN_DURATION: 1000
};
// ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

// グローバル変数
let map = null;
let currentPosition = { lat: CONFIG.DEFAULT_LAT, lng: CONFIG.DEFAULT_LNG };
let cameraStream = null;
let lineAccessToken = null;
let lineUserId = null;
let isLiffInitialized = false;
let selectedImageData = null;
let selectedImageMimeType = null;

// ===========================================
// ユーティリティ関数群（最初に定義）
// ===========================================

/**
 * 通知表示
 */
function showNotification(message, type) {
  type = type || 'info';

  // 既存の通知を削除
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  // 新しい通知要素を作成
  const notification = document.createElement('div');
  notification.className = 'notification notification-' + type;
  notification.textContent = message;

  // ページに追加
  document.body.appendChild(notification);

  // 自動削除
  setTimeout(function () {
    if (notification.parentNode) {
      notification.remove();
    }
  }, CONFIG.NOTIFICATION_DURATION);
}

/**
 * ローディング表示
 */
function showLoading(message) {
  message = message || '処理中...';

  let loader = document.getElementById('loader-overlay');

  if (!loader) {
    // ローディング要素を作成
    loader = document.createElement('div');
    loader.id = 'loader-overlay';
    loader.className = 'loader-overlay';
    loader.innerHTML = '<div class="loader"></div><div class="loader-text">' + message + '</div>';
    document.body.appendChild(loader);
  } else {
    // メッセージを更新
    const loaderText = loader.querySelector('.loader-text');
    if (loaderText) {
      loaderText.textContent = message;
    }
    loader.style.display = 'flex';
  }
}

/**
 * ローディング非表示
 */
function hideLoading() {
  const loader = document.getElementById('loader-overlay');
  if (loader) {
    loader.style.display = 'none';
  }
}

/**
 * LINE連携状態更新
 */
function updateLineStatus(type, message) {
  const statusElement = document.getElementById('line-status');
  if (!statusElement) return;

  // 既存のクラスを削除
  statusElement.className = 'line-status';

  // 新しいクラスを追加
  statusElement.classList.add(type);

  // アイコンとメッセージを設定
  const iconMap = {
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'info': 'ℹ️'
  };

  const icon = iconMap[type] || 'ℹ️';

  statusElement.innerHTML = '<div class="line-status-content"><span class="line-icon">' + icon + '</span><span>' + message + '</span></div>';

  // 表示
  statusElement.classList.remove('hidden');
}

/**
 * カメラ権限状況更新
 */
function updateCameraPermissionStatus(status, message) {
  const statusElement = document.getElementById('camera-permission-status');
  const requestButton = document.getElementById('request-camera-permission');
  const cameraButton = document.getElementById('btn-camera');

  if (!statusElement) return;

  // 既存のクラスを削除
  statusElement.className = 'permission-status';

  // ステータスに応じたクラスとアイコンを設定
  const statusConfig = {
    'checking': { class: 'checking', icon: '⏳', showButton: false, enableCamera: false },
    'granted': { class: 'granted', icon: '✅', showButton: false, enableCamera: true },
    'denied': { class: 'denied', icon: '❌', showButton: true, enableCamera: false },
    'prompt': { class: 'prompt', icon: '❓', showButton: true, enableCamera: false },
    'not-found': { class: 'denied', icon: '📷', showButton: false, enableCamera: false },
    'not-supported': { class: 'denied', icon: '🚫', showButton: false, enableCamera: false },
    'error': { class: 'denied', icon: '⚠️', showButton: true, enableCamera: false }
  };

  const config = statusConfig[status] || statusConfig['error'];

  statusElement.classList.add(config.class);
  statusElement.innerHTML = '<span class="permission-status-icon">' + config.icon + '</span><span>' + message + '</span>';

  // ボタンの表示/非表示
  if (requestButton) {
    requestButton.style.display = config.showButton ? 'flex' : 'none';
  }

  // カメラボタンの有効/無効
  if (cameraButton) {
    cameraButton.disabled = !config.enableCamera;
  }
}

/**
 * 座標表示更新
 */
function updateCoordinatesDisplay() {
  const coordsDisplay = document.getElementById('coords-display');
  if (coordsDisplay) {
    coordsDisplay.textContent = '緯度: ' + currentPosition.lat.toFixed(6) + ', 経度: ' + currentPosition.lng.toFixed(6);
  }
}

/**
 * 安全なJSON解析
 */
function safeJsonParse(jsonString, defaultValue) {
  defaultValue = defaultValue || null;
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('JSON解析エラー:', error);
    return defaultValue;
  }
}

// ===========================================
// 初期化関数群
// ===========================================

/**
 * アプリケーション初期化
 */
function initializeApp() {
  try {
    console.log('アプリケーション初期化開始');

    // 1. LIFF初期化
    initializeLiff();

    // 2. 地図初期化
    initializeMap();

    // 3. カメラ権限チェック
    checkCameraPermission();

    // 4. イベントリスナー設定
    setupEventListeners();

    console.log('アプリケーション初期化完了');

  } catch (error) {
    console.error('初期化エラー:', error);
    showNotification('初期化に失敗しました', 'error');
  }
}

/**
 * LIFF初期化
 */
function initializeLiff() {
  if (!CONFIG.LIFF_ID || CONFIG.LIFF_ID === 'LINE Login channelで作成したLIFF ID') {
    console.warn('LIFF IDが設定されていません');
    updateLineStatus('warning', 'LIFF IDが設定されていません');
    return;
  }

  try {
    // LIFF初期化
    liff.init({
      liffId: CONFIG.LIFF_ID
    }).then(function () {
      console.log('LIFF初期化成功');
      isLiffInitialized = true;

      if (liff.isLoggedIn()) {
        // ログイン済みの場合、アクセストークンを取得
        return liff.getAccessToken();
      } else {
        throw new Error('LINEにログインしていません');
      }
    }).then(function (accessToken) {
      if (accessToken) {
        lineAccessToken = accessToken;
        console.log('アクセストークン取得成功');

        // ユーザー情報取得
        return liff.getProfile();
      } else {
        throw new Error('アクセストークンの取得に失敗しました');
      }
    }).then(function (profile) {
      lineUserId = profile.userId;
      console.log('ユーザー情報取得成功:', profile.displayName);
      updateLineStatus('success', 'LINE連携済み: ' + profile.displayName);
    }).catch(function (error) {
      console.error('LIFF初期化エラー:', error);
      updateLineStatus('error', 'LINE連携エラー: ' + error.message);
    });

  } catch (error) {
    console.error('LIFF初期化例外:', error);
    updateLineStatus('error', 'LIFF初期化に失敗しました');
  }
}

/**
 * 地図初期化
 */
function initializeMap() {
  try {
    // Leaflet地図の初期化
    map = L.map('map').setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);

    // タイルレイヤーの追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 地図移動イベント
    map.on('moveend', function () {
      updateMapPosition();
    });

    // 現在位置取得を試行
    getCurrentLocation();

    console.log('地図初期化完了');

  } catch (error) {
    console.error('地図初期化エラー:', error);
    showNotification('地図の初期化に失敗しました', 'error');
  }
}

/**
 * 現在位置取得
 */
function getCurrentLocation() {
  if (!navigator.geolocation) {
    console.warn('Geolocation APIがサポートされていません');
    return;
  }

  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 300000 // 5分間キャッシュ
  };

  navigator.geolocation.getCurrentPosition(
    function (position) {
      currentPosition = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      // 地図の中心を更新
      if (map) {
        map.setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);
        updateCoordinatesDisplay();
      }

      console.log('現在位置取得成功:', currentPosition);
    },
    function (error) {
      console.warn('現在位置取得エラー:', error.message);
      // エラーでもデフォルト位置で継続
    },
    options
  );
}

/**
 * 地図位置更新
 */
function updateMapPosition() {
  if (!map) return;

  const center = map.getCenter();
  currentPosition = {
    lat: center.lat,
    lng: center.lng
  };

  updateCoordinatesDisplay();
}

/**
 * カメラ権限チェック
 */
function checkCameraPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateCameraPermissionStatus('not-supported', 'カメラがサポートされていません');
    return;
  }

  // 権限状態をチェック
  navigator.mediaDevices.enumerateDevices()
    .then(function (devices) {
      const hasCamera = devices.some(function (device) {
        return device.kind === 'videoinput';
      });

      if (hasCamera) {
        updateCameraPermissionStatus('checking', 'カメラ権限を確認中...');

        // 権限テスト
        return navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: CONFIG.CAMERA_WIDTH },
            height: { ideal: CONFIG.CAMERA_HEIGHT }
          }
        });
      } else {
        throw new Error('カメラデバイスが見つかりません');
      }
    })
    .then(function (stream) {
      // 権限取得成功
      updateCameraPermissionStatus('granted', 'カメラアクセスが許可されています');

      // テスト用ストリームを停止
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    })
    .catch(function (error) {
      console.warn('カメラ権限エラー:', error);

      if (error.name === 'NotAllowedError') {
        updateCameraPermissionStatus('denied', 'カメラアクセスが拒否されています');
      } else if (error.name === 'NotFoundError') {
        updateCameraPermissionStatus('not-found', 'カメラデバイスが見つかりません');
      } else {
        updateCameraPermissionStatus('error', 'カメラ権限の確認に失敗しました');
      }
    });
}
