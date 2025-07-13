// script.js - 最終修正版（CORSエラー・TypeError解決）

// ▼▼▼【重要】設定値を更新してください ▼▼▼
const CONFIG = {
  GAS_WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbz-em0Wk0cxx4yFT7JHLM_4AjkS6o4rowxdfA1lfa6xlwL9pbN5Nwd5x6qXJMyD5DEWIg/exec',
  LIFF_ID: '2007739464-gVVMBAQR',
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

// ===== ユーティリティ関数群 =====

function showNotification(message, type) {
  type = type || 'info';

  // 既存の通知を削除
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  // 新しい通知を作成
  const notification = document.createElement('div');
  notification.className = 'notification notification-' + type;
  notification.textContent = message;

  const colors = {
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  notification.style.cssText =
    'position: fixed; top: 20px; right: 20px; padding: 12px 20px;' +
    'border-radius: 8px; color: white; font-weight: 600; z-index: 10000;' +
    'max-width: 300px; word-wrap: break-word; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);' +
    'background-color: ' + (colors[type] || colors.info) + ';' +
    'animation: slideIn 0.3s ease;';

  document.body.appendChild(notification);

  // 5秒後に削除
  setTimeout(function () {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 5000);
}

function updateLineStatus(type, message) {
  const statusElement = document.getElementById('line-status');
  const textElement = document.getElementById('line-status-text');

  if (!statusElement || !textElement) return;

  statusElement.className = 'line-status ' + type;
  textElement.textContent = message;
  statusElement.classList.remove('hidden');

  // 成功時は5秒後に非表示
  if (type === 'success') {
    setTimeout(function () {
      statusElement.classList.add('hidden');
    }, 5000);
  }
}

function updateCoordinatesDisplay() {
  const coordsDisplay = document.getElementById('coords-display');
  if (coordsDisplay) {
    coordsDisplay.textContent = '緯度: ' + currentPosition.lat.toFixed(6) + ', 経度: ' + currentPosition.lng.toFixed(6);
  }

  // 隠しフィールドも更新
  const latInput = document.getElementById('latitude');
  const lngInput = document.getElementById('longitude');
  if (latInput) latInput.value = currentPosition.lat;
  if (lngInput) lngInput.value = currentPosition.lng;
}

function updatePhoto(data, mimeType) {
  currentPhoto.data = data;
  currentPhoto.mimeType = mimeType;

  const preview = document.getElementById('image-preview');
  if (preview) {
    if (data && mimeType) {
      preview.src = data;
      preview.style.display = 'block';
    } else {
      preview.src = '#';
      preview.style.display = 'none';
    }
  }

  // ファイル入力をクリア
  const fileInput = document.getElementById('photo');
  if (fileInput) fileInput.value = '';
}

// ===== LIFF関連関数 =====

function initializeLiff() {
  if (!CONFIG.LIFF_ID || CONFIG.LIFF_ID === '2007739464-gVVMBAQR') {
    console.warn('LIFF IDが設定されていません');
    updateLineStatus('warning', 'LIFF設定が必要です');
    return;
  }

  try {
    liff.init({ liffId: CONFIG.LIFF_ID })
      .then(function () {
        console.log('LIFF初期化成功');

        if (liff.isLoggedIn()) {
          lineAccessToken = liff.getAccessToken();
          return liff.getProfile();
        } else {
          throw new Error('LINEにログインしていません');
        }
      })
      .then(function (profile) {
        lineUserId = profile.userId;

        // 隠しフィールドに設定
        const accessTokenInput = document.getElementById('accessToken');
        const userIdInput = document.getElementById('userId');
        if (accessTokenInput) accessTokenInput.value = lineAccessToken;
        if (userIdInput) userIdInput.value = lineUserId;

        updateLineStatus('success', 'LINE連携済み: ' + profile.displayName);
        console.log('LINEユーザー情報取得成功:', profile);
      })
      .catch(function (error) {
        console.error('LIFF初期化エラー:', error);
        updateLineStatus('error', 'LINE連携エラー');

        // 自動ログインを試行
        try {
          liff.login();
        } catch (loginError) {
          console.error('自動ログイン失敗:', loginError);
        }
      });
  } catch (error) {
    console.error('LIFF初期化例外:', error);
    updateLineStatus('error', 'LIFF初期化に失敗しました');
  }
}

// ===== 地図関連関数 =====

function initializeMap() {
  try {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('地図要素が見つかりません');
      return;
    }

    // Leaflet地図の初期化
    map = L.map('map').setView([currentPosition.lat, currentPosition.lng], CONFIG.MAP_ZOOM);

    // 地理院タイルの追加
    L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
      attribution: '地理院タイル（GSI）',
      maxZoom: 18
    }).addTo(map);

    // 地図移動イベント
    map.on('moveend', function () {
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

function getCurrentLocation() {
  if (!navigator.geolocation) {
    console.warn('位置情報がサポートされていません');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    function (position) {
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
    function (error) {
      console.warn('現在位置取得エラー:', error.message);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

// ===== カメラ関連関数 =====

function checkCameraPermission() {
  const permissionStatus = document.getElementById('permission-status');
  const startCameraButton = document.getElementById('start-camera-btn');

  if (!permissionStatus) return;

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      updatePermissionStatus('error', 'カメラAPIがサポートされていません');
      return;
    }

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'camera' })
        .then(function (permission) {
          const messages = {
            granted: 'カメラアクセスが許可されています',
            denied: 'カメラアクセスが拒否されています',
            prompt: 'カメラ権限が未設定です'
          };
          updatePermissionStatus(permission.state, messages[permission.state] || '権限状態が不明です');

          if (startCameraButton) {
            startCameraButton.style.display = permission.state === 'granted' ? 'block' : 'none';
          }
        })
        .catch(function (error) {
          console.error('権限確認エラー:', error);
          updatePermissionStatus('error', '権限確認エラー');
        });
    } else {
      updatePermissionStatus('prompt', 'Permission API未サポート');
    }
  } catch (error) {
    console.error('権限確認エラー:', error);
    updatePermissionStatus('error', '権限確認エラー');
  }
}

function updatePermissionStatus(state, message) {
  const permissionStatus = document.getElementById('permission-status');
  if (!permissionStatus) return;

  const icons = {
    granted: '🟢', denied: '🔴', prompt: '🟡',
    checking: '🔍', error: '🔴'
  };

  permissionStatus.className = 'permission-status ' + state;
  permissionStatus.innerHTML =
    '<span class="permission-status-icon">' + (icons[state] || '❓') + '</span>' +
    '<span>' + message + '</span>';
}

function requestCameraPermission() {
  const button = document.getElementById('request-camera-permission');
  if (!button) return;

  button.disabled = true;
  const originalHTML = button.innerHTML;
  button.innerHTML = '🔍 権限要求中...';

  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(function (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });

      updatePermissionStatus('granted', 'カメラ権限が正常に設定されました！');
      showNotification('カメラ権限が正常に設定されました。', 'success');

      const startCameraButton = document.getElementById('start-camera-btn');
      if (startCameraButton) {
        startCameraButton.style.display = 'block';
      }
    })
    .catch(function (error) {
      const errorMessages = {
        NotAllowedError: 'カメラアクセスが拒否されました。ブラウザの設定で許可してください。',
        NotFoundError: 'カメラデバイスが見つかりません。',
        NotSupportedError: 'このブラウザではカメラがサポートされていません。'
      };
      const message = errorMessages[error.name] || 'エラー: ' + error.message;
      updatePermissionStatus('denied', message);
      showNotification(message, 'error');
    })
    .finally(function () {
      button.disabled = false;
      button.innerHTML = originalHTML;
    });
}

function startCamera() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then(function (stream) {
      videoStream = stream;

      const videoElement = document.getElementById('camera-stream');
      const videoWrapper = document.getElementById('video-wrapper');
      const cameraErrorView = document.getElementById('camera-error-view');
      const captureButton = document.getElementById('capture-btn');
      const cameraModal = document.getElementById('camera-modal');

      if (videoElement) videoElement.srcObject = stream;
      if (videoWrapper) videoWrapper.classList.remove('hidden');
      if (cameraErrorView) cameraErrorView.classList.add('hidden');
      if (captureButton) captureButton.classList.remove('hidden');
      if (cameraModal) cameraModal.classList.remove('hidden');

      showNotification('カメラが起動しました', 'success');
    })
    .catch(function (error) {
      console.error('カメラ起動失敗:', error);

      const cameraErrorText = document.getElementById('camera-error-text');
      const videoWrapper = document.getElementById('video-wrapper');
      const cameraErrorView = document.getElementById('camera-error-view');
      const captureButton = document.getElementById('capture-btn');
      const cameraModal = document.getElementById('camera-modal');

      if (cameraErrorText) cameraErrorText.textContent = 'カメラの起動に失敗しました: ' + error.message;
      if (videoWrapper) videoWrapper.classList.add('hidden');
      if (cameraErrorView) cameraErrorView.classList.remove('hidden');
      if (captureButton) captureButton.classList.add('hidden');
      if (cameraModal) cameraModal.classList.remove('hidden');

      showNotification('カメラの起動に失敗しました', 'error');
    });
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(function (track) {
      track.stop();
    });
    videoStream = null;
  }

  const videoElement = document.getElementById('camera-stream');
  const cameraModal = document.getElementById('camera-modal');

  if (videoElement) videoElement.srcObject = null;
  if (cameraModal) cameraModal.classList.add('hidden');
}

function capturePhoto() {
  const canvas = document.getElementById('camera-canvas');
  const video = document.getElementById('camera-stream');

  if (!canvas || !video) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext('2d');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  updatePhoto(dataUrl, 'image/jpeg');
  stopCamera();
  showNotification('写真を撮影しました。', 'success');
}

// ===== ファイル処理関数 =====

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // ファイルサイズチェック
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    showNotification('ファイルサイズが大きすぎます（最大5MB）', 'error');
    updatePhoto(null, null);
    return;
  }

  // ファイルタイプチェック
  if (!CONFIG.ALLOWED_FILE_TYPES.includes(file.type)) {
    showNotification('対応していないファイル形式です', 'error');
    updatePhoto(null, null);
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    updatePhoto(e.target.result, file.type);
    showNotification('画像が選択されました', 'success');
  };
  reader.onerror = function () {
    showNotification('ファイルの読み込みに失敗しました', 'error');
    updatePhoto(null, null);
  };
  reader.readAsDataURL(file);
}

// ===== フォーム処理関数 =====

function validateForm() {
  // 通報種別チェック
  const typeInputs = document.querySelectorAll('input[name="type"]');
  let typeSelected = false;

  for (let i = 0; i < typeInputs.length; i++) {
    if (typeInputs[i].checked) {
      typeSelected = true;
      break;
    }
  }

  if (!typeSelected) {
    showNotification('通報種別を選択してください', 'warning');
    return false;
  }

  // 位置情報チェック
  if (!currentPosition.lat || !currentPosition.lng) {
    showNotification('位置情報が取得できていません', 'warning');
    return false;
  }

  return true;
}

function setSubmissionState(isSending) {
  const loader = document.getElementById('loader');
  const form = document.getElementById('report-form');

  if (loader) {
    if (isSending) {
      loader.classList.remove('hidden');
    } else {
      loader.classList.add('hidden');
    }
  }

  if (form) {
    const formElements = form.querySelectorAll('input, select, textarea, button');
    for (let i = 0; i < formElements.length; i++) {
      formElements[i].disabled = isSending;
    }
  }
}

function submitForm(event) {
  if (event) event.preventDefault();

  if (!validateForm()) {
    return;
  }

  setSubmissionState(true);

  // フォームデータ収集
  let selectedType = '';
  const typeInputs = document.querySelectorAll('input[name="type"]');
  for (let i = 0; i < typeInputs.length; i++) {
    if (typeInputs[i].checked) {
      selectedType = typeInputs[i].value;
      break;
    }
  }

  const details = document.getElementById('details').value.trim();

  const formData = {
    latitude: currentPosition.lat,
    longitude: currentPosition.lng,
    type: selectedType,
    details: details,
    photoData: currentPhoto.data,
    photoMimeType: currentPhoto.mimeType,
    accessToken: lineAccessToken,
    userId: lineUserId,
    timestamp: new Date().toISOString()
  };

  // データ送信（CORS対応版）
  sendDataWithRetry(formData)
    .then(function (result) {
      console.log('送信成功:', result);
      showNotification('通報を受け付けました。ご協力ありがとうございます。', 'success');

      if (result.lineNotified) {
        showNotification('LINEに詳細情報を送信しました', 'info');
      }

      // フォームリセット
      resetForm();
    })
    .catch(function (error) {
      console.error('送信エラー:', error);
      showNotification('送信に失敗しました: ' + error.message, 'error');
    })
    .finally(function () {
      setSubmissionState(false);
    });
}

function sendDataWithRetry(formData, attempt) {
  attempt = attempt || 1;

  return new Promise(function (resolve, reject) {
    const controller = new AbortController();
    const timeoutId = setTimeout(function () {
      controller.abort();
    }, CONFIG.REQUEST_TIMEOUT);

    // CORS対応のfetchリクエスト
    fetch(CONFIG.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain' // CORS対応のため
      },
      body: JSON.stringify(formData),
      mode: 'cors',
      signal: controller.signal
    })
      .then(function (response) {
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error('サーバーエラー: ' + response.status + ' ' + response.statusText);
        }

        return response.text();
      })
      .then(function (text) {
        const data = JSON.parse(text);
        if (data.status === 'success') {
          resolve(data);
        } else {
          throw new Error(data.message || 'サーバーでエラーが発生しました');
        }
      })
      .catch(function (error) {
        clearTimeout(timeoutId);

        if (attempt < CONFIG.MAX_RETRY_ATTEMPTS && shouldRetry(error)) {
          showNotification('送信に失敗しました。' + (CONFIG.RETRY_DELAY / 1000) + '秒後に再試行します... (' + attempt + '/' + CONFIG.MAX_RETRY_ATTEMPTS + ')', 'warning');
          setTimeout(function () {
            sendDataWithRetry(formData, attempt + 1)
              .then(resolve)
              .catch(reject);
          }, CONFIG.RETRY_DELAY);
        } else {
          reject(error);
        }
      });
  });
}

function shouldRetry(error) {
  return error.name === 'AbortError' ||
    error.message.includes('fetch') ||
    error.message.includes('network') ||
    error.message.includes('timeout');
}

function resetForm() {
  // ラジオボタンリセット
  const typeInputs = document.querySelectorAll('input[name="type"]');
  typeInputs.forEach(function (input) {
    input.checked = false;
  });

  // テキストエリアリセット
  const details = document.getElementById('details');
  if (details) details.value = '';

  // 写真リセット
  updatePhoto(null, null);
}

// ===== イベントリスナー設定 =====

function setupEventListeners() {
  // ファイル選択
  const fileInput = document.getElementById('photo');
  if (fileInput) {
    fileInput.addEventListener('change', handleFileSelect);
  }

  // カメラ権限要求
  const requestPermissionButton = document.getElementById('request-camera-permission');
  if (requestPermissionButton) {
    requestPermissionButton.addEventListener('click', function (e) {
      e.preventDefault();
      requestCameraPermission();
    });
  }

  // カメラ開始
  const startCameraButton = document.getElementById('start-camera-btn');
  if (startCameraButton) {
    startCameraButton.addEventListener('click', function (e) {
      e.preventDefault();
      startCamera();
    });
  }

  // カメラ再試行
  const retryCameraButton = document.getElementById('retry-camera-btn');
  if (retryCameraButton) {
    retryCameraButton.addEventListener('click', function (e) {
      e.preventDefault();
      startCamera();
    });
  }

  // 撮影
  const captureButton = document.getElementById('capture-btn');
  if (captureButton) {
    captureButton.addEventListener('click', function () {
      capturePhoto();
    });
  }

  // カメラキャンセル
  const cancelButton = document.getElementById('cancel-camera-btn');
  if (cancelButton) {
    cancelButton.addEventListener('click', function () {
      stopCamera();
    });
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

// ===== アプリケーション初期化 =====

function initializeApp() {
  console.log('アプリケーション初期化開始');

  try {
    // 1. LIFF初期化
    initializeLiff();

    // 2. 地図初期化（少し遅延）
    setTimeout(function () {
      initializeMap();
      getCurrentLocation();
    }, 100);

    // 3. カメラ権限確認
    setTimeout(function () {
      checkCameraPermission();
    }, 200);

    // 4. イベントリスナー設定
    setupEventListeners();

    console.log('アプリケーション初期化完了');

  } catch (error) {
    console.error('初期化エラー:', error);
    showNotification('初期化に失敗しました', 'error');
  }
}

// ===== DOM読み込み完了時の初期化 =====

document.addEventListener('DOMContentLoaded', function () {
  console.log('ページ読み込み完了');

  // 少し遅延させて初期化
  setTimeout(initializeApp, 200);
});

// ===== エラーハンドリング =====

window.addEventListener('error', function (event) {
  console.error('グローバルエラー:', event.error);
});

window.addEventListener('unhandledrejection', function (event) {
  console.error('未処理のPromise拒否:', event.reason);
});

// ===== ページ離脱時のクリーンアップ =====

window.addEventListener('beforeunload', function () {
  if (videoStream) {
    videoStream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
});
