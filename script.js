// script.js - LINE Login channel対応版

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbwQ95GWJvpt_AAE4QeLvVvAVFr6UVXsUy1WMPtOyJTnle-tBGADkn02_yS7NAPrPIuXaA/exec',
  LIFF_ID: '2007739464-gVVMBAQR', // LINE Login channelのLIFF IDに変更
  // 地図設定
  DEFAULT_LAT: 35.681236,
  DEFAULT_LNG: 139.767125,
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

/**
 * ページ読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', function () {
  console.log('ページ読み込み完了');

  // CSP対応: setTimeout の文字列実行を関数実行に変更
  setTimeout(function () {
    initializeApp();
  }, 100);
});

/**
 * アプリケーション初期化（CSP対応版）
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
 * LIFF初期化（CSP対応版）
 */
function initializeLiff() {
  if (!CONFIG.LIFF_ID || CONFIG.LIFF_ID === 'LINE Login channelで作成したLIFF ID') {
    console.warn('LIFF IDが設定されていません');
    updateLineStatus('warning', 'LIFF IDが設定されていません');
    return;
  }

  try {
    // LIFF初期化（CSP対応: コールバック関数を直接指定）
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
      updateLineStatus('success', `LINE連携済み: ${profile.displayName}`);
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
 * 地図初期化（CSP対応版）
 */
function initializeMap() {
  try {
    // Leaflet地図の初期化
    map = L.map('map').setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);

    // タイルレイヤーの追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // 地図移動イベント（CSP対応: 関数参照を使用）
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
 * 現在位置取得（CSP対応版）
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

  // CSP対応: コールバック関数を直接指定
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
 * 地図位置更新（CSP対応版）
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
 * 座標表示更新
 */
function updateCoordinatesDisplay() {
  const coordsDisplay = document.getElementById('coords-display');
  if (coordsDisplay) {
    coordsDisplay.textContent = `緯度: ${currentPosition.lat.toFixed(6)}, 経度: ${currentPosition.lng.toFixed(6)}`;
  }
}

/**
 * カメラ権限チェック（CSP対応版）
 */
function checkCameraPermission() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    updateCameraPermissionStatus('not-supported', 'カメラがサポートされていません');
    return;
  }

  // 権限状態をチェック（CSP対応: Promise.then()を使用）
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
  statusElement.innerHTML = `
    <span class="permission-status-icon">${config.icon}</span>
    <span>${message}</span>
  `;

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
 * イベントリスナー設定（CSP対応版）
 */
function setupEventListeners() {
  // カメラ権限要求ボタン
  const requestButton = document.getElementById('request-camera-permission');
  if (requestButton) {
    requestButton.addEventListener('click', function () {
      requestCameraPermission();
    });
  }

  // ファイル選択
  const fileInput = document.getElementById('photo-input');
  if (fileInput) {
    fileInput.addEventListener('change', function (event) {
      handleFileSelect(event);
    });
  }

  // カメラ撮影ボタン
  const cameraButton = document.getElementById('btn-camera');
  if (cameraButton) {
    cameraButton.addEventListener('click', function () {
      openCameraModal();
    });
  }

  // フォーム送信
  const submitButton = document.getElementById('btn-submit');
  if (submitButton) {
    submitButton.addEventListener('click', function (event) {
      event.preventDefault();
      submitForm();
    });
  }

  // モーダル関連のイベントリスナー
  setupModalEventListeners();
}

/**
 * モーダルイベントリスナー設定（CSP対応版）
 */
function setupModalEventListeners() {
  // カメラモーダルのボタン
  const captureButton = document.getElementById('btn-capture');
  if (captureButton) {
    captureButton.addEventListener('click', function () {
      capturePhoto();
    });
  }

  const closeModalButton = document.getElementById('btn-close-modal');
  if (closeModalButton) {
    closeModalButton.addEventListener('click', function () {
      closeCameraModal();
    });
  }

  // モーダル背景クリックで閉じる
  const modalOverlay = document.getElementById('camera-modal');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (event) {
      if (event.target === modalOverlay) {
        closeCameraModal();
      }
    });
  }
}

/**
 * カメラ権限要求（CSP対応版）
 */
function requestCameraPermission() {
  updateCameraPermissionStatus('checking', 'カメラ権限を要求中...');

  navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: CONFIG.CAMERA_WIDTH },
      height: { ideal: CONFIG.CAMERA_HEIGHT }
    }
  })
    .then(function (stream) {
      updateCameraPermissionStatus('granted', 'カメラアクセスが許可されました');

      // テスト用ストリームを停止
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    })
    .catch(function (error) {
      console.error('カメラ権限要求エラー:', error);

      if (error.name === 'NotAllowedError') {
        updateCameraPermissionStatus('denied', 'カメラアクセスが拒否されました');
      } else {
        updateCameraPermissionStatus('error', 'カメラ権限の要求に失敗しました');
      }
    });
}

/**
 * ファイル選択処理（CSP対応版）
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // ファイルサイズチェック
  if (file.size > CONFIG.MAX_IMAGE_SIZE) {
    showNotification(`ファイルサイズが大きすぎます（最大${CONFIG.MAX_IMAGE_SIZE / 1024 / 1024}MB）`, 'error');
    return;
  }

  // ファイルタイプチェック
  if (!file.type.startsWith('image/')) {
    showNotification('画像ファイルを選択してください', 'error');
    return;
  }

  // FileReader使用（CSP対応: onload関数を直接指定）
  const reader = new FileReader();
  reader.onload = function (e) {
    displaySelectedImage(e.target.result, file.type);
  };
  reader.onerror = function () {
    showNotification('ファイルの読み込みに失敗しました', 'error');
  };
  reader.readAsDataURL(file);
}

/**
 * 選択画像表示
 */
function displaySelectedImage(dataUrl, mimeType) {
  const preview = document.getElementById('image-preview');
  if (preview) {
    preview.src = dataUrl;
    preview.style.display = 'block';

    // グローバル変数に保存
    window.selectedImageData = dataUrl;
    window.selectedImageMimeType = mimeType;

    showNotification('画像が選択されました', 'success');
  }
}

/**
 * カメラモーダル開く（CSP対応版）
 */
function openCameraModal() {
  const modal = document.getElementById('camera-modal');
  const videoElement = document.getElementById('camera-stream');
  const errorView = document.getElementById('camera-error-view');

  if (!modal || !videoElement) return;

  modal.style.display = 'flex';

  // カメラストリーム開始
  navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: CONFIG.CAMERA_WIDTH },
      height: { ideal: CONFIG.CAMERA_HEIGHT }
    }
  })
    .then(function (stream) {
      cameraStream = stream;
      videoElement.srcObject = stream;
      videoElement.style.display = 'block';
      if (errorView) errorView.style.display = 'none';
    })
    .catch(function (error) {
      console.error('カメラストリーム開始エラー:', error);
      videoElement.style.display = 'none';
      if (errorView) {
        errorView.style.display = 'block';
        errorView.textContent = 'カメラの起動に失敗しました: ' + error.message;
      }
    });
}

/**
 * 写真撮影（CSP対応版）
 */
function capturePhoto() {
  const videoElement = document.getElementById('camera-stream');
  if (!videoElement || !cameraStream) {
    showNotification('カメラが利用できません', 'error');
    return;
  }

  // Canvas要素を作成して撮影
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  context.drawImage(videoElement, 0, 0);

  // 画像データを取得
  const dataUrl = canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY);

  // プレビュー表示
  displaySelectedImage(dataUrl, 'image/jpeg');

  // モーダルを閉じる
  closeCameraModal();

  showNotification('写真を撮影しました', 'success');
}

/**
 * カメラモーダル閉じる
 */
function closeCameraModal() {
  const modal = document.getElementById('camera-modal');
  if (modal) {
    modal.style.display = 'none';
  }

  // カメラストリームを停止
  if (cameraStream) {
    cameraStream.getTracks().forEach(function (track) {
      track.stop();
    });
    cameraStream = null;
  }
}
